/**
 * Histórico de notificações + regra global de frequência — Bloco 3, etapa 2.
 *
 * Persistido em Postgres (`notificacoes_historico` — ver
 * scripts/migrate-engajamento-historico.js) desde esta etapa: a regra de
 * frequência precisa sobreviver a restart de processo/deploy, e um array em
 * memória (implementação anterior deste arquivo) não sobrevive. A
 * INTERFACE pública continua sendo o único contrato que engine.js conhece —
 * trocar como isto é armazenado no futuro (ex: mover para outra tabela) não
 * deveria exigir mudar quem chama.
 *
 * REGRA ÚNICA AUTORIZADA NESTA ETAPA: no máximo 1 mensagem com
 * status='enviado' por usuário a cada LIMITE_GLOBAL_DIAS dias corridos —
 * vale para QUALQUER automação/evento, nunca por automação isolada. Uma
 * tentativa que falha (status='falhou') NUNCA conta para este limite.
 *
 * CONCORRÊNCIA: pg_advisory_xact_lock(usuario_id) — mutex lógico por
 * usuário, escopo de transação (libera sozinho no COMMIT/ROLLBACK, nunca
 * fica preso se o processo cair no meio). Duas chamadas concorrentes para
 * o MESMO usuário são inteiramente serializadas: a segunda só consegue o
 * lock depois que a primeira já deu COMMIT, e nesse momento já enxerga a
 * linha 'enviado' recém-gravada. Usuários diferentes nunca se bloqueiam
 * entre si (chaves de lock diferentes).
 *
 * O envio de verdade (chamada ao provider, via `enviarFn`) acontece DENTRO
 * da mesma transação/lock nesta etapa — aceitável porque os providers hoje
 * são stubs instantâneos (ver providers/*.js). Se um provider real e lento
 * for conectado no futuro, mover o envio para FORA do lock (reservando a
 * vaga com uma linha provisória e atualizando o status depois) é a evolução
 * natural — não muda a regra de 7 dias nem a interface exportada aqui.
 */
const pool = require("../../config/database");

const LIMITE_GLOBAL_DIAS = 7;

/**
 * Checagem informativa, SEM lock e SEM gravar nada — usada por
 * engine.js:simular() só para mostrar "isto seria bloqueado agora", nunca
 * para decidir um envio de verdade (quem decide é tentarEnviarComLimiteGlobal,
 * que faz a mesma checagem de novo, sob lock, no momento real do envio).
 */
async function verificarBloqueioGlobal(usuarioId) {
    const resultado = await pool.query(
        `SELECT criado_em FROM notificacoes_historico
         WHERE usuario_id = $1 AND status = 'enviado'
           AND criado_em >= NOW() - ($2 || ' days')::interval
         ORDER BY criado_em DESC
         LIMIT 1`,
        [usuarioId, LIMITE_GLOBAL_DIAS]
    );

    if (resultado.rows.length === 0) {
        return { bloqueado: false, ultimoEnvioEm: null };
    }

    return { bloqueado: true, ultimoEnvioEm: resultado.rows[0].criado_em };
}

/**
 * Único caminho real de envio do motor: checa o limite global E grava o
 * resultado numa única transação protegida por advisory lock (ver
 * comentário do arquivo). `enviarFn` é uma função assíncrona que executa o
 * envio de verdade (chama o provider) e retorna
 * `{ sucesso, identificadorExterno, erro }` — só é chamada se o limite
 * permitir.
 *
 * Retorna a linha gravada em notificacoes_historico (com o `status` final:
 * 'enviado', 'falhou' ou 'bloqueado_por_limite').
 */
async function tentarEnviarComLimiteGlobal({ usuarioId, evento, automacaoNome, canal, mensagem, enviarFn }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Trava lógica por usuário — nenhuma outra chamada para o MESMO
        // usuarioId passa daqui até esta transação terminar (COMMIT/ROLLBACK).
        await client.query("SELECT pg_advisory_xact_lock($1)", [usuarioId]);

        const bloqueio = await client.query(
            `SELECT 1 FROM notificacoes_historico
             WHERE usuario_id = $1 AND status = 'enviado'
               AND criado_em >= NOW() - ($2 || ' days')::interval
             LIMIT 1`,
            [usuarioId, LIMITE_GLOBAL_DIAS]
        );

        if (bloqueio.rows.length > 0) {
            const registroBloqueado = await client.query(
                `INSERT INTO notificacoes_historico (usuario_id, evento, automacao_nome, canal, status, mensagem)
                 VALUES ($1, $2, $3, $4, 'bloqueado_por_limite', $5)
                 RETURNING *`,
                [usuarioId, evento, automacaoNome || null, canal || null, mensagem || null]
            );

            await client.query("COMMIT");
            return registroBloqueado.rows[0];
        }

        // Ainda dentro do lock: só chega aqui se não houver 'enviado' nos
        // últimos LIMITE_GLOBAL_DIAS dias para este usuário.
        const resultadoEnvio = await enviarFn();

        const registro = await client.query(
            `INSERT INTO notificacoes_historico
                (usuario_id, evento, automacao_nome, canal, status, mensagem, erro, identificador_externo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                usuarioId,
                evento,
                automacaoNome || null,
                canal || null,
                resultadoEnvio.sucesso ? "enviado" : "falhou",
                mensagem || null,
                resultadoEnvio.erro || null,
                resultadoEnvio.identificadorExterno || null
            ]
        );

        await client.query("COMMIT");
        return registro.rows[0];

    } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;

    } finally {
        client.release();
    }
}

async function listarPorUsuario(usuarioId) {
    const resultado = await pool.query(
        `SELECT * FROM notificacoes_historico WHERE usuario_id = $1 ORDER BY criado_em DESC`,
        [usuarioId]
    );
    return resultado.rows;
}

// Utilitário SÓ para os testes desta etapa limparem o que criarem — nunca
// deve ser chamado por código de produção (não exportado com esse cuidado
// por acidente: o nome deixa isso explícito).
async function apagarHistoricoDeTesteParaUsuario(usuarioId) {
    await pool.query("DELETE FROM notificacoes_historico WHERE usuario_id = $1", [usuarioId]);
}

module.exports = {
    LIMITE_GLOBAL_DIAS,
    verificarBloqueioGlobal,
    tentarEnviarComLimiteGlobal,
    listarPorUsuario,
    apagarHistoricoDeTesteParaUsuario
};
