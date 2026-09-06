
 const pool = require("../config/database");
const { empresaAtivaExiste } = require("../utils/empresas");

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
 */
async function entrada(req, res) {
    const { usuario_id, quantidade, descricao, empresa_id } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const usuarioResultado = await client.query(
            "SELECT id FROM usuarios WHERE id = $1 AND tipo = 'cliente' FOR UPDATE",
            [usuario_id]
        );

        if (usuarioResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        if (!(await empresaAtivaExiste(client, empresa_id))) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Empresa inválida"
            });
        }

        const resultado = await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao, empresa_id)
             VALUES ($1, $2, 'entrada', $3, $4)
             RETURNING id, usuario_id, quantidade, tipo, descricao, empresa_id, criado_em`,
            [usuario_id, quantidade, descricao, empresa_id]
        );

        const saldoResultado = await client.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo = 'entrada' THEN quantidade
                    WHEN tipo = 'saida' THEN -quantidade
                END
            ), 0) AS saldo
             FROM movimentacoes_pontos
             WHERE usuario_id = $1`,
            [usuario_id]
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

async function saida(req, res) {
    const { usuario_id, quantidade, descricao } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const usuarioResultado = await client.query(
            "SELECT id FROM usuarios WHERE id = $1 FOR UPDATE",
            [usuario_id]
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
             WHERE usuario_id = $1`,
            [usuario_id]
        );

        const saldoAtual = Number(saldoResultado.rows[0].saldo);

        if (saldoAtual < quantidade) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Saldo de pontos insuficiente"
            });
        }

        const resultado = await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao)
             VALUES ($1, $2, 'saida', $3)
             RETURNING id, usuario_id, quantidade, tipo, descricao, criado_em`,
            [usuario_id, quantidade, descricao]
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
             WHERE usuario_id = $1`,
            [usuario_id]
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

async function historico(req, res) {
    const usuario_id = req.usuario.id;

    try {
        const resultado = await pool.query(
            `SELECT id, quantidade, tipo, descricao, criado_em
             FROM movimentacoes_pontos
             WHERE usuario_id = $1
             ORDER BY criado_em DESC`,
            [usuario_id]
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
             FROM movimentacoes_pontos`
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
