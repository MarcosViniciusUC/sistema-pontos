const pool = require("../config/database");

/**
 * Consulta do histórico/auditoria da Plataforma Maple — GET
 * /plataforma/auditoria (ver plataforma.routes.js: mesmo par
 * authPlataformaMiddleware + exigirEscopoPlataforma de toda rota de
 * plataforma). Só leitura — a gravação acontece exclusivamente dentro das
 * próprias operações administrativas (ver registrarAuditoria em
 * plataformaTenant.controller.js), nunca por aqui.
 *
 * Paginação simples (página + limite, nunca cursor) — mesmo padrão de
 * simplicidade do resto do painel administrativo, suficiente para o volume
 * de ações administrativas (não é dado de cliente final, sempre pequeno
 * comparado a `movimentacoes_pontos`).
 *
 * `tenantId` é o único filtro desta etapa — quando ausente, mostra o
 * histórico de TODOS os tenants (visão da plataforma inteira); quando
 * presente, filtra só aquele tenant. Nunca aceita nada além de um inteiro
 * (um valor não-numérico é tratado como "sem filtro", nunca um erro 400 —
 * mesmo espírito de nunca travar a tela por um parâmetro de URL mal
 * formado numa consulta só de leitura).
 *
 * JOIN com `admins_plataforma`/`tenants` só para os NOMES de exibição —
 * nunca nenhuma outra coluna dessas tabelas (nada de email/senha do admin,
 * nada de plano/status do tenant aqui: quem quiser esses dados já tem
 * GET /plataforma/tenants/:id para isso).
 */
const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 100;

async function listar(req, res) {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, parseInt(req.query.limite, 10) || LIMITE_PADRAO));
    const offset = (pagina - 1) * limite;

    const tenantIdBruto = Number(req.query.tenantId);
    const tenantId = Number.isInteger(tenantIdBruto) && tenantIdBruto > 0 ? tenantIdBruto : null;

    try {
        const [dadosResultado, totalResultado] = await Promise.all([
            pool.query(
                `SELECT
                    pa.id,
                    ap.nome AS admin_nome,
                    pa.tenant_id,
                    t.nome AS tenant_nome,
                    pa.acao,
                    pa.descricao,
                    pa.criado_em
                 FROM plataforma_auditoria pa
                 JOIN admins_plataforma ap ON ap.id = pa.admin_plataforma_id
                 LEFT JOIN tenants t ON t.id = pa.tenant_id
                 WHERE ($1::int IS NULL OR pa.tenant_id = $1)
                 ORDER BY pa.criado_em DESC
                 LIMIT $2 OFFSET $3`,
                [tenantId, limite, offset]
            ),
            pool.query(
                `SELECT count(*)::int AS total
                 FROM plataforma_auditoria
                 WHERE ($1::int IS NULL OR tenant_id = $1)`,
                [tenantId]
            )
        ]);

        res.json({
            dados: dadosResultado.rows.map(function (linha) {
                return {
                    id: linha.id,
                    adminNome: linha.admin_nome,
                    tenantId: linha.tenant_id,
                    tenantNome: linha.tenant_nome,
                    acao: linha.acao,
                    descricao: linha.descricao,
                    criadoEm: linha.criado_em
                };
            }),
            paginacao: {
                pagina: pagina,
                limite: limite,
                total: totalResultado.rows[0].total
            }
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar o histórico da plataforma"
        });
    }
}

module.exports = { listar };
