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
 *
 * ETAPA de consolidação de empresas/tenant — todas as 7 consultas passam a
 * filtrar explicitamente por `tenant_id = req.usuario.tenant_id`. Isto
 * nunca foi um vazamento real em produção (a política RLS
 * `tenant_isolation`, ativa em usuarios/recompensas/resgates/
 * movimentacoes_pontos/empresas desde a Etapa 3C-13, já filtra essas
 * linhas de forma transparente mesmo sem WHERE nenhum no SQL — confirmado
 * empiricamente criando um tenant de teste com dados bem distintos e
 * conferindo que nunca apareciam aqui) — mas era a ÚNICA função do projeto
 * sem o filtro explícito de defesa em profundidade que todo outro
 * controller já tem, e que só funcionava "por acidente" da RLS nunca ter
 * sido desativada. Alinhado agora com o mesmo padrão do resto do projeto:
 * nunca depender só da RLS, sempre filtrar explicitamente também.
 */
async function dashboard(req, res) {
    const tenantId = req.usuario.tenant_id;

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
            pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE tipo = 'cliente' AND tenant_id = $1", [tenantId]),

            pool.query("SELECT COUNT(*)::int AS total FROM recompensas WHERE ativo = true AND tenant_id = $1", [tenantId]),

            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'pendente_validacao')::int AS pendentes,
                    COUNT(*) FILTER (WHERE status = 'utilizado')::int AS utilizados,
                    COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelados
                FROM resgates
                WHERE tenant_id = $1
            `, [tenantId]),

            pool.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0) AS pontos_concedidos,
                    COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0) AS pontos_utilizados
                FROM movimentacoes_pontos
                WHERE tenant_id = $1
            `, [tenantId]),

            // Pontos CONCEDIDOS (só entrada) por empresa. Vem da tabela
            // `empresas` — não é uma lista fixa — então uma empresa nova
            // aparece aqui automaticamente, sem mudar esta query. LEFT JOIN
            // pra empresa sem nenhum lançamento ainda aparecer com 0, não
            // sumir da lista. Isso é só concedido; utilizado por empresa
            // fica pra um indicador futuro. `mp.tenant_id = $1` no ON (não
            // só um WHERE depois do LEFT JOIN) — filtrar depois do JOIN
            // excluiria a linha inteira de uma empresa sem nenhum
            // lançamento PRÓPRIO do tenant; no ON, uma empresa sem
            // movimentação nenhuma ainda aparece com pontos_concedidos = 0.
            pool.query(`
                SELECT e.id, e.nome,
                    COALESCE(SUM(CASE WHEN mp.tipo = 'entrada' THEN mp.quantidade ELSE 0 END), 0) AS pontos_concedidos
                FROM empresas e
                LEFT JOIN movimentacoes_pontos mp ON mp.empresa_id = e.id AND mp.tenant_id = $1
                WHERE e.ativo = true AND e.tenant_id = $1
                GROUP BY e.id
                ORDER BY e.nome
            `, [tenantId]),

            // Top 5 clientes por saldo. LEFT JOIN + agregação numa única
            // consulta — cliente sem nenhuma movimentação entra com saldo 0
            // (mesmo padrão de user.controller.js:listar). Mesmo raciocínio
            // do `mp.tenant_id = $1` no ON da query de empresas acima.
            pool.query(`
                SELECT u.nome,
                    COALESCE(SUM(
                        CASE
                            WHEN mp.tipo = 'entrada' THEN mp.quantidade
                            WHEN mp.tipo = 'saida' THEN -mp.quantidade
                        END
                    ), 0) AS saldo
                FROM usuarios u
                LEFT JOIN movimentacoes_pontos mp ON mp.usuario_id = u.id AND mp.tenant_id = $1
                WHERE u.tipo = 'cliente' AND u.tenant_id = $1
                GROUP BY u.id
                ORDER BY saldo DESC
                LIMIT 5
            `, [tenantId]),

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
                WHERE r.tenant_id = $1
                ORDER BY r.criado_em DESC
                LIMIT 10
            `, [tenantId])
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
