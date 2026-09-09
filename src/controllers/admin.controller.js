const pool = require("../config/database");
const { cancelarResgatesExpirados } = require("../services/resgateExpiracao.service");

/**
 * Dashboard administrativo: reúne em poucas consultas de agregação os
 * números que hoje exigiriam abrir várias telas separadas (clientes,
 * recompensas, resgates, resumo de pontos). Só admin (ver roleMiddleware
 * na rota) — funcionário e cliente não têm acesso.
 *
 * 7 queries no total, todas de agregação sobre a tabela inteira (nenhuma
 * roda dentro de um loop por cliente/resgate) — não é N+1.
 *
 * Nenhum dado sensível: o ranking de clientes só traz nome+saldo, os
 * últimos resgates não incluem código nem qr_token, e saldo/pontos nunca
 * vêm de uma coluna fixa — sempre recalculados a partir de
 * movimentacoes_pontos (mesma regra usada em pontos.controller.js e
 * user.controller.js).
 */
async function dashboard(req, res) {
    try {
        // Verificação sob demanda (mesma de redemption.controller.js) — os
        // KPIs de resgates pendentes/cancelados abaixo devem refletir
        // resgates já expirados, mesmo que a limpeza periódica ainda não
        // tenha rodado desde o último reinício do servidor.
        await cancelarResgatesExpirados();

        const [
            clientesResultado,
            recompensasAtivasResultado,
            resgatesResumoResultado,
            pontosResultado,
            pontosPorEmpresaResultado,
            rankingResultado,
            ultimosResgatesResultado
        ] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE tipo = 'cliente'"),

            pool.query("SELECT COUNT(*)::int AS total FROM recompensas WHERE ativo = true"),

            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'pendente_validacao')::int AS pendentes,
                    COUNT(*) FILTER (WHERE status = 'utilizado')::int AS utilizados,
                    COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelados
                FROM resgates
            `),

            pool.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0) AS pontos_concedidos,
                    COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0) AS pontos_utilizados
                FROM movimentacoes_pontos
            `),

            // Pontos CONCEDIDOS (só entrada) por empresa. Vem da tabela
            // `empresas` — não é uma lista fixa — então uma empresa nova
            // aparece aqui automaticamente, sem mudar esta query. LEFT JOIN
            // pra empresa sem nenhum lançamento ainda aparecer com 0, não
            // sumir da lista. Isso é só concedido; utilizado por empresa
            // fica pra um indicador futuro.
            pool.query(`
                SELECT e.id, e.nome,
                    COALESCE(SUM(CASE WHEN mp.tipo = 'entrada' THEN mp.quantidade ELSE 0 END), 0) AS pontos_concedidos
                FROM empresas e
                LEFT JOIN movimentacoes_pontos mp ON mp.empresa_id = e.id
                WHERE e.ativo = true
                GROUP BY e.id
                ORDER BY e.nome
            `),

            // Top 5 clientes por saldo. LEFT JOIN + agregação numa única
            // consulta — cliente sem nenhuma movimentação entra com saldo 0
            // (mesmo padrão de user.controller.js:listar).
            pool.query(`
                SELECT u.nome,
                    COALESCE(SUM(
                        CASE
                            WHEN mp.tipo = 'entrada' THEN mp.quantidade
                            WHEN mp.tipo = 'saida' THEN -mp.quantidade
                        END
                    ), 0) AS saldo
                FROM usuarios u
                LEFT JOIN movimentacoes_pontos mp ON mp.usuario_id = u.id
                WHERE u.tipo = 'cliente'
                GROUP BY u.id
                ORDER BY saldo DESC
                LIMIT 5
            `),

            // Últimos 10 resgates. Nunca seleciona "codigo" — nem existe
            // caminho pra esse campo vazar por aqui.
            pool.query(`
                SELECT
                    u.nome AS cliente_nome,
                    rec.nome AS recompensa_nome,
                    r.pontos,
                    r.status,
                    r.criado_em
                FROM resgates r
                JOIN usuarios u ON u.id = r.usuario_id
                JOIN recompensas rec ON rec.id = r.recompensa_id
                ORDER BY r.criado_em DESC
                LIMIT 10
            `)
        ]);

        const pontosLinha = pontosResultado.rows[0];
        const pontosConcedidos = Number(pontosLinha.pontos_concedidos);

        const resgatesLinha = resgatesResumoResultado.rows[0];

        res.json({
            total_clientes: clientesResultado.rows[0].total,
            recompensas_ativas: recompensasAtivasResultado.rows[0].total,
            total_resgates: resgatesLinha.total,
            resgates_pendentes: resgatesLinha.pendentes,
            pontos_concedidos: pontosConcedidos,
            pontos_utilizados: Number(pontosLinha.pontos_utilizados),

            pontos_por_empresa: pontosPorEmpresaResultado.rows.map(function (linha) {
                const pontos = Number(linha.pontos_concedidos);
                const percentual = pontosConcedidos > 0
                    ? Number(((pontos / pontosConcedidos) * 100).toFixed(1))
                    : 0;

                return {
                    empresa_id: linha.id,
                    empresa_nome: linha.nome,
                    pontos: pontos,
                    percentual: percentual
                };
            }),

            resgates_por_status: {
                pendente_validacao: resgatesLinha.pendentes,
                utilizado: resgatesLinha.utilizados,
                cancelado: resgatesLinha.cancelados
            },

            ranking_clientes: rankingResultado.rows.map(function (linha) {
                return {
                    nome: linha.nome,
                    saldo: Number(linha.saldo)
                };
            }),

            ultimos_resgates: ultimosResgatesResultado.rows.map(function (linha) {
                return {
                    cliente_nome: linha.cliente_nome,
                    recompensa_nome: linha.recompensa_nome,
                    pontos: linha.pontos,
                    status: linha.status,
                    criado_em: linha.criado_em
                };
            })
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao carregar dashboard administrativo"
        });
    }
}

module.exports = { dashboard };
