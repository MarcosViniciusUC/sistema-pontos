
 const pool = require("../config/database");
const { empresaAtivaNoTenant } = require("../utils/empresas");

/**
 * Registra uma entrada de pontos (usada tanto pela tela de clientes quanto
 * pelo lançamento de pontos após identificar um cliente pelo QR). Mesmo
 * padrão transacional de "saida" abaixo — trava a linha do usuário (FOR
 * UPDATE) antes de inserir e calcula o novo saldo dentro da mesma
 * transação, para a resposta refletir um estado consistente mesmo sob
 * lançamentos concorrentes para o mesmo cliente.
 *
 * Restrito a usuario_id de um cliente: pontos de fidelidade não existem
 * pra conta de admin/funcionário. Isso também fecha uma via que a UI já
 * não oferece (o fluxo de identificação só entrega ids de cliente — ver
 * buscarPorQrToken/buscarCliente), mas que continuaria disponível via
 * chamada direta à API sem essa checagem. Tratado como 404 (não 403) pra
 * não revelar se aquele id pertence a alguém que não é cliente.
 *
 * `origem` (coluna legada de movimentacoes_pontos) não é mais preenchida
 * aqui de propósito — motivo/categoria agora é texto livre em `descricao`,
 * e o campo estruturado obrigatório é `empresa_id`. A coluna continua
 * existindo (NOT NULL DEFAULT 'outro') só por compatibilidade com dados
 * antigos; o INSERT abaixo deixa o banco preenchê-la com o default.
 *
 * ETAPA 3C-4 — `tenant_id` vem exclusivamente de `req.usuario.tenant_id`
 * (do JWT do admin/funcionário autenticado, nunca de um campo do body) e é
 * gravado explicitamente no INSERT, sem depender do DEFAULT temporário
 * (Etapa 2). Duas validações cruzadas passam a considerar o tenant, dentro
 * da MESMA transação (nada foi transformado em consulta independente):
 *   - o lock do usuário (`FOR UPDATE`) agora exige `tenant_id = $2` além de
 *     `tipo = 'cliente'` — um `usuario_id` de outro tenant não bate com
 *     nenhuma linha e cai no mesmo 404 genérico de "Usuário não
 *     encontrado", nunca revelando que aquele id existe em outro tenant;
 *   - a checagem de empresa (`empresaAtivaNoTenant()`, ver src/utils/empresas.js)
 *     passa a considerar o tenant: uma empresa de outro tenant, mesmo que
 *     exista e esteja ativa, é tratada como "Empresa inválida".
 * O recálculo de saldo (ainda dentro da transação) também passa a filtrar
 * por `tenant_id`, por consistência com a regra "toda leitura de
 * movimentacoes_pontos considera tenant_id" — redundante em termos de
 * resultado (usuario_id já pertence a um único tenant, confirmado acima),
 * mas deixa a query correta por si só, sem depender de uma garantia
 * externa a ela.
 */
async function entrada(req, res) {
    const { usuario_id, quantidade, descricao, empresa_id } = req.body;
    const tenantId = req.usuario.tenant_id;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);

        const usuarioResultado = await client.query(
            "SELECT id FROM usuarios WHERE id = $1 AND tipo = 'cliente' AND tenant_id = $2 FOR UPDATE",
            [usuario_id, tenantId]
        );

        if (usuarioResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        if (!(await empresaAtivaNoTenant(client, empresa_id, tenantId))) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Empresa inválida"
            });
        }

        const resultado = await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao, empresa_id, tenant_id)
             VALUES ($1, $2, 'entrada', $3, $4, $5)
             RETURNING id, usuario_id, quantidade, tipo, descricao, empresa_id, criado_em`,
            [usuario_id, quantidade, descricao, empresa_id, tenantId]
        );

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

        await client.query("COMMIT");

        const movimentacao = resultado.rows[0];

        res.status(201).json({
            id: movimentacao.id,
            usuario_id: movimentacao.usuario_id,
            quantidade: movimentacao.quantidade,
            tipo: movimentacao.tipo,
            descricao: movimentacao.descricao,
            empresa_id: movimentacao.empresa_id,
            criado_em: movimentacao.criado_em,
            saldo: Number(saldoResultado.rows[0].saldo)
        });

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao registrar entrada de pontos"
        });

    } finally {
        client.release();
    }
}

/**
 * ETAPA 3C-4 — mesmo padrão de entrada(): `tenant_id` vem de
 * `req.usuario.tenant_id`, nunca do body. O lock do usuário passa a exigir
 * `tenant_id = $2` (sem alterar a ausência intencional do filtro
 * `tipo = 'cliente'` aqui — comportamento pré-existente, não é objeto desta
 * etapa); um `usuario_id` de outro tenant cai no mesmo 404 genérico. O
 * cálculo de saldo (usado para validar saldo suficiente, ainda dentro da
 * transação) e o INSERT final passam a considerar `tenant_id`, pelo mesmo
 * motivo de consistência de entrada().
 */
async function saida(req, res) {
    const { usuario_id, quantidade, descricao } = req.body;
    const tenantId = req.usuario.tenant_id;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);

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

        if (saldoAtual < quantidade) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Saldo de pontos insuficiente"
            });
        }

        const resultado = await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao, tenant_id)
             VALUES ($1, $2, 'saida', $3, $4)
             RETURNING id, usuario_id, quantidade, tipo, descricao, criado_em`,
            [usuario_id, quantidade, descricao, tenantId]
        );

        await client.query("COMMIT");

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao registrar saída de pontos"
        });
    } finally {
        client.release();
    }
}

// ETAPA 3C-4 — filtrado também por `tenant_id = req.usuario.tenant_id`.
async function saldo(req, res) {
    const usuario_id = req.usuario.id;

    try {
        const resultado = await pool.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo = 'entrada' THEN quantidade
                    WHEN tipo = 'saida' THEN -quantidade
                END
            ), 0) AS saldo
             FROM movimentacoes_pontos
             WHERE usuario_id = $1 AND tenant_id = $2`,
            [usuario_id, req.usuario.tenant_id]
        );

        res.json({
            saldo: Number(resultado.rows[0].saldo)
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar saldo de pontos"
        });
    }
}

// ETAPA 3C-4 — filtrado também por `tenant_id = req.usuario.tenant_id`.
async function historico(req, res) {
    const usuario_id = req.usuario.id;

    try {
        const resultado = await pool.query(
            `SELECT id, quantidade, tipo, descricao, criado_em
             FROM movimentacoes_pontos
             WHERE usuario_id = $1 AND tenant_id = $2
             ORDER BY criado_em DESC`,
            [usuario_id, req.usuario.tenant_id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar histórico de pontos"
        });
    }
}

/**
 * Resumo administrativo: total de pontos movimentados no sistema inteiro
 * (todos os usuários), a partir de movimentacoes_pontos.
 *
 * Definição: "pontos movimentados" é o volume total de atividade — soma de
 * TODAS as quantidades (entradas e saídas), não o saldo líquido e não a
 * contagem de registros. Uma entrada de 100 e uma saída de 100 contam como
 * 200 pontos movimentados, não como 0 (que seria o saldo) nem como 2 (que
 * seria só contar linhas).
 *
 * entradas_por_origem: distribuição das ENTRADAS (nunca saídas) pelas 5
 * origens possíveis (ver scripts/migrate-movimentacoes-origem.js). Uma só
 * consulta de agregação — cada origem é uma coluna somada com CASE WHEN em
 * cima da mesma linha, sem GROUP BY nem uma query por origem — garante que
 * as 5 sempre aparecem na resposta, mesmo com valor 0, já que são colunas
 * fixas do SELECT e não dependem de existir dado com aquele origem.
 *
 * ETAPA 3C-4 — filtrado também por `tenant_id = req.usuario.tenant_id`.
 * Antes desta etapa não havia WHERE nenhum: "o sistema inteiro" somava
 * movimentações de TODOS os tenants, não só do tenant do admin autenticado.
 */
async function resumoAdmin(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT
                COALESCE(SUM(quantidade), 0) AS total_pontos_movimentados,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0) AS total_entradas,
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0) AS total_saidas,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' AND origem = 'oficina' THEN quantidade ELSE 0 END), 0) AS entrada_oficina,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' AND origem = 'academia' THEN quantidade ELSE 0 END), 0) AS entrada_academia,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' AND origem = 'promocao' THEN quantidade ELSE 0 END), 0) AS entrada_promocao,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' AND origem = 'ajuste' THEN quantidade ELSE 0 END), 0) AS entrada_ajuste,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' AND origem = 'outro' THEN quantidade ELSE 0 END), 0) AS entrada_outro
             FROM movimentacoes_pontos
             WHERE tenant_id = $1`,
            [req.usuario.tenant_id]
        );

        const linha = resultado.rows[0];

        res.json({
            total_pontos_movimentados: Number(linha.total_pontos_movimentados),
            total_entradas: Number(linha.total_entradas),
            total_saidas: Number(linha.total_saidas),
            entradas_por_origem: {
                oficina: Number(linha.entrada_oficina),
                academia: Number(linha.entrada_academia),
                promocao: Number(linha.entrada_promocao),
                ajuste: Number(linha.entrada_ajuste),
                outro: Number(linha.entrada_outro)
            }
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar resumo de pontos"
        });
    }
}

module.exports = {
    entrada,
    saida,
    saldo,
    historico,
    resumoAdmin
};
