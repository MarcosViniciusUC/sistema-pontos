const pool = require("../config/database");

async function criar(req, res) {
    const usuario_id = req.usuario.id;
    const { recompensa_id } = req.body;

    try {
        const recompensaResultado = await pool.query(
            "SELECT id, pontos_necessarios, ativo FROM recompensas WHERE id = $1",
            [recompensa_id]
        );

        if (recompensaResultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        const recompensa = recompensaResultado.rows[0];

        if (!recompensa.ativo) {
            return res.status(400).json({
                mensagem: "Recompensa não está disponível para resgate"
            });
        }

        const resultado = await pool.query(
            `INSERT INTO resgates (usuario_id, recompensa_id, pontos, status)
             VALUES ($1, $2, $3, 'pendente')
             RETURNING id, usuario_id, recompensa_id, pontos, status, criado_em, atualizado_em`,
            [usuario_id, recompensa_id, recompensa.pontos_necessarios]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao solicitar resgate"
        });
    }
}

async function listarAdmin(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT
                r.id,
                r.usuario_id,
                u.nome AS usuario_nome,
                r.recompensa_id,
                rec.nome AS recompensa_nome,
                r.pontos,
                r.status,
                r.criado_em,
                r.atualizado_em
             FROM resgates r
             JOIN usuarios u ON u.id = r.usuario_id
             JOIN recompensas rec ON rec.id = r.recompensa_id
             ORDER BY r.criado_em DESC`
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar resgates"
        });
    }
}

async function aprovar(req, res) {
    const id = Number(req.params.id);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const resgateResultado = await client.query(
            "SELECT id, usuario_id, pontos, status FROM resgates WHERE id = $1 FOR UPDATE",
            [id]
        );

        if (resgateResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Resgate não encontrado"
            });
        }

        const resgate = resgateResultado.rows[0];

        if (resgate.status !== "pendente") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                mensagem: `Este resgate já foi ${resgate.status}`
            });
        }

        const usuarioResultado = await client.query(
            "SELECT id FROM usuarios WHERE id = $1 FOR UPDATE",
            [resgate.usuario_id]
        );

        if (usuarioResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Usuário do resgate não encontrado"
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
            [resgate.usuario_id]
        );

        const saldoAtual = Number(saldoResultado.rows[0].saldo);

        if (saldoAtual < resgate.pontos) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Usuário não possui saldo suficiente para aprovar este resgate"
            });
        }

        await client.query(
            `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao)
             VALUES ($1, $2, 'saida', $3)`,
            [resgate.usuario_id, resgate.pontos, `Resgate #${resgate.id} aprovado`]
        );

        const resgateAtualizado = await client.query(
            `UPDATE resgates
             SET status = 'aprovado', atualizado_em = NOW()
             WHERE id = $1
             RETURNING id, usuario_id, recompensa_id, pontos, status, criado_em, atualizado_em`,
            [id]
        );

        await client.query("COMMIT");

        res.json(resgateAtualizado.rows[0]);

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao aprovar resgate"
        });
    } finally {
        client.release();
    }
}

async function recusar(req, res) {
    const id = Number(req.params.id);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const resgateResultado = await client.query(
            "SELECT id, status FROM resgates WHERE id = $1 FOR UPDATE",
            [id]
        );

        if (resgateResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Resgate não encontrado"
            });
        }

        const resgate = resgateResultado.rows[0];

        if (resgate.status !== "pendente") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                mensagem: `Este resgate já foi ${resgate.status}`
            });
        }

        const resgateAtualizado = await client.query(
            `UPDATE resgates
             SET status = 'recusado', atualizado_em = NOW()
             WHERE id = $1
             RETURNING id, usuario_id, recompensa_id, pontos, status, criado_em, atualizado_em`,
            [id]
        );

        await client.query("COMMIT");

        res.json(resgateAtualizado.rows[0]);

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao recusar resgate"
        });
    } finally {
        client.release();
    }
}

module.exports = {
    criar,
    listarAdmin,
    aprovar,
    recusar
};
