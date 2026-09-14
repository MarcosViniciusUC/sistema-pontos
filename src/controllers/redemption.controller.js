const pool = require("../config/database");
const { gerarCodigoResgate } = require("../utils/codigoResgate");
const { cancelarResgatesExpirados } = require("../services/resgateExpiracao.service");

const MAX_TENTATIVAS_CODIGO = 5;

/**
 * Cria um resgate com desconto de pontos IMEDIATO (não há mais aprovação
 * manual do admin). Tudo roda em uma única transação:
 *   1. busca a recompensa e confere que está ativa;
 *   2. trava a linha do usuário (FOR UPDATE) para serializar operações
 *      concorrentes — é isso que impede dois resgates simultâneos de
 *      "gastarem" o mesmo saldo (ver pontos.controller.js:saida, mesmo
 *      padrão já usado no projeto);
 *   3. calcula o saldo real a partir de movimentacoes_pontos;
 *   4. se houver saldo, registra a saída e cria o resgate com um código
 *      de reserva único (retry em caso de colisão, usando SAVEPOINT para
 *      não invalidar a transação inteira a cada tentativa).
 *
 * Segurança: usuario_id vem só de req.usuario.id (JWT); pontos vêm só do
 * valor de recompensas.pontos_necessarios lido agora do banco; status e
 * código são sempre definidos pelo servidor. Nada disso é lido do body.
 *
 * ETAPA 3C-5 — `tenant_id` vem exclusivamente de `req.usuario.tenant_id`
 * (do JWT, nunca do body) e é gravado explicitamente tanto no `INSERT` de
 * `resgates` quanto no `INSERT` de saída em `movimentacoes_pontos`, sem
 * depender do DEFAULT temporário. A recompensa só é aceita se pertencer ao
 * MESMO tenant (`r.tenant_id = $2`) — uma recompensa de outro tenant cai
 * no mesmo 404 genérico "Recompensa não encontrada". `usuario_id` aqui
 * NUNCA vem do body/cliente (sempre `req.usuario.id`, já validado pelo
 * `authMiddleware` contra o tenant do próprio token), então não existe
 * vetor de "usuario_id de outro tenant" nesta rota por construção — o lock
 * do usuário ainda assim passa a exigir `tenant_id = $2`, por consistência
 * e defesa em profundidade. `empresa_id` também nunca vem do body aqui —
 * é sempre copiado de `recompensa.empresa_id` (já garantida do mesmo
 * tenant pela checagem acima e pela Etapa 3C-3, que só permite recompensas
 * apontarem para empresas do próprio tenant), nunca escolhido livremente.
 * Toda a checagem cruzada continua dentro da MESMA transação já existente.
 */
async function criar(req, res) {
    const usuario_id = req.usuario.id;
    const tenantId = req.usuario.tenant_id;
    const { recompensa_id } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);

        // LEFT JOIN pra também trazer o nome da empresa (exibido ao cliente
        // na confirmação do resgate) sem uma segunda consulta — recompensa
        // sem empresa definida (histórica) segue com empresa_nome = null.
        const recompensaResultado = await client.query(
            `SELECT r.id, r.nome, r.pontos_necessarios, r.ativo, r.empresa_id, e.nome AS empresa_nome
             FROM recompensas r
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE r.id = $1 AND r.tenant_id = $2`,
            [recompensa_id, tenantId]
        );

        if (recompensaResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        const recompensa = recompensaResultado.rows[0];

        if (!recompensa.ativo) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Recompensa não está disponível para resgate"
            });
        }

        const usuarioResultado = await client.query(
            "SELECT id FROM usuarios WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
            [usuario_id, tenantId]
        );

        if (usuarioResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        const saldoResultado = await client.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo = 'entrada' THEN quantidade
                    WHEN tipo = 'saida' THEN -quantidade
                END
            ), 0) AS saldo
             FROM movimentacoes_pontos
             WHERE usuario_id = $1 AND tenant_id = $2`,
            [usuario_id, tenantId]
        );

        const saldoAtual = Number(saldoResultado.rows[0].saldo);
        const pontosNecessarios = recompensa.pontos_necessarios;

        if (saldoAtual < pontosNecessarios) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Saldo de pontos insuficiente"
            });
        }

        let resgateCriado = null;

        for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CODIGO && !resgateCriado; tentativa++) {
            const codigo = gerarCodigoResgate();

            await client.query("SAVEPOINT tentativa_codigo");

            try {
                const resgateResultado = await client.query(
                    `INSERT INTO resgates (usuario_id, recompensa_id, pontos, codigo, status, empresa_id, tenant_id)
                     VALUES ($1, $2, $3, $4, 'pendente_validacao', $5, $6)
                     RETURNING id, usuario_id, recompensa_id, pontos, codigo, status, empresa_id, criado_em, atualizado_em`,
                    [usuario_id, recompensa_id, pontosNecessarios, codigo, recompensa.empresa_id, tenantId]
                );

                await client.query("RELEASE SAVEPOINT tentativa_codigo");
                resgateCriado = resgateResultado.rows[0];

            } catch (erroInsercao) {
                await client.query("ROLLBACK TO SAVEPOINT tentativa_codigo");

                const foiColisaoDeCodigo = erroInsercao.code === "23505"
                    && erroInsercao.constraint === "resgates_codigo_key";

                if (!foiColisaoDeCodigo) {
                    throw erroInsercao;
                }
                // colisão de código (extremamente improvável): tenta de novo
                // com um código novo, sem perder o restante da transação.
            }
        }

        if (!resgateCriado) {
            await client.query("ROLLBACK");
            return res.status(500).json({
                mensagem: "Não foi possível gerar um código de resgate único. Tente novamente."
            });
        }

        // Mesma empresa gravada no resgate (snapshot da recompensa no momento
        // do resgate) — não um JOIN ao vivo — pelo mesmo motivo: se a
        // recompensa mudar de empresa depois, essa saída já registrada não
        // deve mudar junto.
        await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao, empresa_id, tenant_id)
             VALUES ($1, $2, 'saida', $3, $4, $5)`,
            [usuario_id, pontosNecessarios, `Resgate de "${recompensa.nome}" (código ${resgateCriado.codigo})`, recompensa.empresa_id, tenantId]
        );

        await client.query("COMMIT");

        res.status(201).json({
            id: resgateCriado.id,
            usuario_id: resgateCriado.usuario_id,
            recompensa_id: resgateCriado.recompensa_id,
            recompensa_nome: recompensa.nome,
            pontos: resgateCriado.pontos,
            codigo: resgateCriado.codigo,
            status: resgateCriado.status,
            empresa_id: resgateCriado.empresa_id,
            empresa_nome: recompensa.empresa_nome,
            criado_em: resgateCriado.criado_em,
            atualizado_em: resgateCriado.atualizado_em
        });

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao solicitar resgate"
        });

    } finally {
        client.release();
    }
}

/**
 * Listagem administrativa. Inclui o código de reserva — o admin precisa
 * dele para ajudar um cliente ou conferir um resgate manualmente até a
 * validação por QR Code existir.
 *
 * empresa_nome vem de um LEFT JOIN (não INNER) porque resgates antigos
 * podem ter empresa_id NULL (a recompensa deles não tinha empresa definida
 * no momento do resgate) — continuam aparecendo normalmente, só com
 * empresa_nome = null, sem afetar o restante do registro.
 *
 * Verificação sob demanda (mecanismo B da expiração de 5h — ver
 * resgateExpiracao.service.js): processa qualquer resgate expirado ANTES de
 * montar a resposta, para o admin nunca ver um "pendente_validacao" que já
 * deveria estar cancelado.
 *
 * ETAPA 3C-5 — filtrado também por `r.tenant_id = req.usuario.tenant_id`.
 * Antes desta etapa não havia WHERE nenhum: um admin via resgates de TODOS
 * os tenants nesta listagem.
 */
async function listarAdmin(req, res) {
    try {
        await cancelarResgatesExpirados();

        const resultado = await pool.query(
            `SELECT
                r.id,
                r.usuario_id,
                u.nome AS usuario_nome,
                r.recompensa_id,
                rec.nome AS recompensa_nome,
                r.pontos,
                r.codigo,
                r.status,
                r.empresa_id,
                e.nome AS empresa_nome,
                r.criado_em,
                r.atualizado_em
             FROM resgates r
             JOIN usuarios u ON u.id = r.usuario_id
             JOIN recompensas rec ON rec.id = r.recompensa_id
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE r.tenant_id = $1
             ORDER BY r.criado_em DESC`,
            [req.usuario.tenant_id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar resgates"
        });
    }
}

/**
 * Lista os resgates do próprio usuário autenticado ("Meus Resgates").
 * usuario_id vem só de req.usuario.id (JWT) — nunca do body/query, então um
 * cliente não tem como pedir os resgates de outra pessoa.
 *
 * empresa_nome vem de um LEFT JOIN (não INNER) pelo mesmo motivo de
 * listarAdmin: resgates antigos podem ter empresa_id NULL.
 *
 * Mesma verificação sob demanda de listarAdmin: se o cliente ficou horas
 * sem abrir o app e algum resgate dele expirou nesse meio tempo, ele já
 * aparece como cancelado (com os pontos devolvidos) na primeira consulta
 * depois de voltar, sem depender só da limpeza periódica em memória.
 *
 * ETAPA 3C-5 — filtrado também por `r.tenant_id = req.usuario.tenant_id`.
 * Redundante em termos de resultado hoje (usuario_id já pertence a um
 * único tenant), mas deixa a query correta por si só, consistente com a
 * regra "toda leitura de resgates considera tenant_id".
 */
async function listarMeus(req, res) {
    try {
        await cancelarResgatesExpirados();

        const resultado = await pool.query(
            `SELECT
                r.id,
                r.recompensa_id,
                rec.nome AS recompensa_nome,
                r.pontos,
                r.codigo,
                r.status,
                r.empresa_id,
                e.nome AS empresa_nome,
                r.criado_em,
                r.atualizado_em
             FROM resgates r
             JOIN recompensas rec ON rec.id = r.recompensa_id
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE r.usuario_id = $1 AND r.tenant_id = $2
             ORDER BY r.criado_em DESC`,
            [req.usuario.id, req.usuario.tenant_id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar seus resgates"
        });
    }
}

/**
 * Valida um resgate pelo código (admin/funcionário confirma que o cliente
 * apresentou o código/QR no estabelecimento). Só muda o status de
 * "pendente_validacao" para "utilizado" — os pontos JÁ foram descontados
 * na criação do resgate (POST /resgates), então esta função nunca mexe em
 * movimentacoes_pontos.
 *
 * Concorrência: SELECT ... FOR UPDATE na linha do resgate (mesmo padrão de
 * lock já usado no restante do projeto) garante que, se o mesmo código for
 * validado duas vezes ao mesmo tempo, a segunda tentativa só prossegue
 * depois que a primeira já commitou — e nesse ponto o status já não é mais
 * "pendente_validacao", então ela recebe 409 em vez de validar de novo.
 *
 * Também roda a verificação sob demanda de resgates expirados antes de
 * buscar o código: um resgate que passou das 5 horas mas ainda não foi
 * varrido pela limpeza periódica não pode ser validado como "utilizado" no
 * balcão — precisa primeiro virar "cancelado" (com a devolução de pontos),
 * e só então cair no caminho de erro 409 já existente abaixo.
 *
 * ETAPA 3C-5 — `resgates.codigo` continua GLOBALMENTE único de propósito
 * (um scanner/funcionário não sabe o tenant a priori a partir só do
 * código). A busca em si continua global (`WHERE codigo = $1`), mas
 * código global NUNCA significa autorização global: depois de localizar a
 * linha, `resgate.tenant_id` é comparado contra `req.usuario.tenant_id` —
 * se não bater, a resposta é o MESMO 404 genérico "Código de resgate não
 * encontrado" usado para código inexistente, nunca revelando que aquele
 * código existe em outro tenant. O `UPDATE` final também passa a exigir
 * `tenant_id = $2` como segunda camada de defesa (mesmo já tendo
 * confirmado o tenant antes, dentro da mesma transação/lock).
 */
async function validar(req, res) {
    const codigo = req.body.codigo.trim().toUpperCase();

    await cancelarResgatesExpirados();

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config.
        // `codigo` é intencionalmente global (ver comentário acima), mas o
        // CONTEXTO de quem está validando é sempre o tenant autenticado —
        // isso não muda o resultado (um código de outro tenant já caía no
        // mesmo 404 pela checagem em JS logo abaixo), só torna a proteção
        // automática também no nível do banco.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(req.usuario.tenant_id)]);

        const resgateResultado = await client.query(
            `SELECT id, usuario_id, recompensa_id, pontos, codigo, status, tenant_id, criado_em, atualizado_em
             FROM resgates
             WHERE codigo = $1
             FOR UPDATE`,
            [codigo]
        );

        if (resgateResultado.rows.length === 0 || resgateResultado.rows[0].tenant_id !== req.usuario.tenant_id) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Código de resgate não encontrado"
            });
        }

        const resgate = resgateResultado.rows[0];

        if (resgate.status === "utilizado") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                mensagem: "Este resgate já foi utilizado"
            });
        }

        if (resgate.status === "cancelado") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                mensagem: "Este resgate foi cancelado e não pode ser utilizado"
            });
        }

        const atualizadoResultado = await client.query(
            `UPDATE resgates
             SET status = 'utilizado', atualizado_em = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING id, recompensa_id, pontos, codigo, status, criado_em, atualizado_em`,
            [resgate.id, req.usuario.tenant_id]
        );

        const recompensaResultado = await client.query(
            "SELECT nome FROM recompensas WHERE id = $1 AND tenant_id = $2",
            [resgate.recompensa_id, req.usuario.tenant_id]
        );

        await client.query("COMMIT");

        const atualizado = atualizadoResultado.rows[0];

        res.json({
            id: atualizado.id,
            recompensa_id: atualizado.recompensa_id,
            recompensa_nome: recompensaResultado.rows[0] ? recompensaResultado.rows[0].nome : null,
            pontos: atualizado.pontos,
            codigo: atualizado.codigo,
            status: atualizado.status,
            criado_em: atualizado.criado_em,
            atualizado_em: atualizado.atualizado_em
        });

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao validar resgate"
        });

    } finally {
        client.release();
    }
}

module.exports = {
    criar,
    listarAdmin,
    listarMeus,
    validar
};
