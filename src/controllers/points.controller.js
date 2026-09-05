const pool = require("../config/database");

async function entrada(req, res) {
    const { usuario_id, quantidade, descricao } = req.body;

    try {
        const resultado = await pool.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao)
             VALUES ($1, $2, 'entrada', $3)
             RETURNING id, usuario_id, quantidade, tipo, descricao, criado_em`,
            [usuario_id, quantidade, descricao]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        if (erro.code === "23503") {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.status(500).json({
            mensagem: "Erro ao registrar entrada de pontos"
        });
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

module.exports = {
    entrada,
    saida,
    saldo,
    historico
};
