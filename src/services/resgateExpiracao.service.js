const pool = require("../config/database");

const HORAS_PARA_EXPIRAR = 5;

/**
 * Cancela automaticamente resgates que ficaram "pendente_validacao" por mais
 * de 5 horas, devolvendo ao cliente exatamente os pontos descontados.
 *
 * Serviço centralizado (não espalhado em controllers) — chamado tanto pela
 * limpeza periódica (ver iniciarLimpezaPeriodica abaixo) quanto sob demanda,
 * antes de qualquer leitura de resgates que um usuário possa ver (GET
 * /resgates/meus, GET /resgates, POST /resgates/validar, GET /admin/dashboard
 * — ver redemption.controller.js e admin.controller.js). Assim, mesmo que o
 * servidor tenha ficado horas parado, o primeiro acesso depois de voltar já
 * processa o atraso inteiro antes de responder.
 *
 * Tempo sempre comparado no PostgreSQL (`criado_em + INTERVAL '5 hours' <=
 * NOW()`) — nunca um valor calculado no Node nem recebido do frontend.
 *
 * Transacional e idempotente:
 *   1. Uma consulta fora de transação apenas lista candidatos (leitura, não
 *      trava nada) — mantém o lock, quando ele existe, o mais curto possível.
 *   2. Cada resgate candidato é processado na SUA PRÓPRIA transação:
 *      SELECT ... FOR UPDATE trava a linha, o status é conferido de novo
 *      DEPOIS de obter o lock (não antes) e só então o cancelamento +
 *      devolução acontecem, num único COMMIT.
 *   3. Se duas chamadas tentarem cancelar o mesmo resgate ao mesmo tempo, a
 *      segunda só obtém o lock depois que a primeira já deu COMMIT — nesse
 *      momento o status já não é mais 'pendente_validacao', então ela vê
 *      isso e não faz nada. Nunca duas devoluções para o mesmo resgate.
 *   4. Um erro num resgate específico não derruba o processamento dos
 *      demais candidatos da mesma chamada.
 *
 * Retorna a lista dos resgates efetivamente cancelados nesta chamada (usado
 * pelos testes e para log).
 */
async function cancelarResgatesExpirados() {
    const candidatos = await pool.query(
        `SELECT id FROM resgates
         WHERE status = 'pendente_validacao'
           AND criado_em + INTERVAL '${HORAS_PARA_EXPIRAR} hours' <= NOW()`
    );

    const cancelados = [];

    for (const linha of candidatos.rows) {
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // FOR UPDATE trava a linha — uma segunda chamada concorrente para
            // o mesmo id bloqueia aqui até esta transação terminar (COMMIT ou
            // ROLLBACK), e só então lê o status já atualizado.
            const resgateResultado = await client.query(
                `SELECT id, usuario_id, pontos, status, criado_em
                 FROM resgates
                 WHERE id = $1
                   AND status = 'pendente_validacao'
                   AND criado_em + INTERVAL '${HORAS_PARA_EXPIRAR} hours' <= NOW()
                 FOR UPDATE`,
                [linha.id]
            );

            if (resgateResultado.rows.length === 0) {
                // Já foi processado por outra chamada concorrente, validado,
                // ou deixou de estar expirado (não deveria acontecer, mas o
                // recheck cobre qualquer corrida) — nada a fazer aqui.
                await client.query("ROLLBACK");
                continue;
            }

            const resgate = resgateResultado.rows[0];

            await client.query(
                `UPDATE resgates
                 SET status = 'cancelado', atualizado_em = NOW()
                 WHERE id = $1`,
                [resgate.id]
            );

            await client.query(
                `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao)
                 VALUES ($1, $2, 'entrada', $3)`,
                [
                    resgate.usuario_id,
                    resgate.pontos,
                    `Pontos devolvidos pelo cancelamento do resgate #${resgate.id}`
                ]
            );

            await client.query("COMMIT");

            cancelados.push({
                id: resgate.id,
                usuario_id: resgate.usuario_id,
                pontos: resgate.pontos
            });

        } catch (erro) {
            await client.query("ROLLBACK");
            console.log(`Erro ao cancelar resgate expirado #${linha.id}:`, erro.message);

        } finally {
            client.release();
        }
    }

    return cancelados;
}

let intervaloAtivo = null;

/**
 * Inicia a limpeza periódica em memória (mecanismo A da regra de negócio) —
 * roda uma vez imediatamente (cobre o caso do servidor ter ficado horas
 * parado) e depois a cada `intervaloMs`. Isto sozinho NÃO é suficiente
 * (é só um dos dois mecanismos exigidos): a verificação sob demanda em
 * redemption.controller.js/admin.controller.js (mecanismo B) é quem garante
 * que um cliente nunca veja um resgate expirado como "pendente" mesmo que
 * o servidor tenha acabado de subir e o primeiro tick ainda não tenha
 * rodado.
 *
 * Idempotente: chamar duas vezes não cria dois intervalos (relevante porque
 * server.js só deveria chamar isto uma vez, mas evita duplicar o cancelamento
 * caso algo chame de novo).
 */
function iniciarLimpezaPeriodica(intervaloMs) {
    if (intervaloAtivo) {
        return intervaloAtivo;
    }

    const intervalo = intervaloMs || 5 * 60 * 1000;

    cancelarResgatesExpirados().catch((erro) => {
        console.log("Erro na limpeza inicial de resgates expirados:", erro.message);
    });

    intervaloAtivo = setInterval(function () {
        cancelarResgatesExpirados().catch((erro) => {
            console.log("Erro na limpeza periódica de resgates expirados:", erro.message);
        });
    }, intervalo);

    // unref() evita que este timer sozinho impeça o processo de encerrar
    // (ex: em testes/scripts que sobem o server e depois saem) — não afeta
    // o funcionamento normal do servidor, que já fica de pé por causa do
    // app.listen().
    intervaloAtivo.unref();

    return intervaloAtivo;
}

module.exports = {
    cancelarResgatesExpirados,
    iniciarLimpezaPeriodica
};
