const pool = require("../config/database");

async function criar(req, res) {
    const { nome, descricao, pontos_necessarios } = req.body;

    try {
        const resultado = await pool.query(
            `INSERT INTO recompensas (nome, descricao, pontos_necessarios)
             VALUES ($1, $2, $3)
             RETURNING id, nome, descricao, pontos_necessarios, ativo, criado_em`,
            [nome, descricao ?? null, pontos_necessarios]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao cadastrar recompensa"
        });
    }
}

async function listar(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, descricao, pontos_necessarios, ativo, criado_em
             FROM recompensas
             WHERE ativo = true
             ORDER BY pontos_necessarios ASC`
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar recompensas"
        });
    }
}

async function atualizar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { nome, descricao, pontos_necessarios, ativo } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET nome = COALESCE($1, nome),
                 descricao = COALESCE($2, descricao),
                 pontos_necessarios = COALESCE($3, pontos_necessarios),
                 ativo = COALESCE($4, ativo)
             WHERE id = $5
             RETURNING id, nome, descricao, pontos_necessarios, ativo, criado_em`,
            [nome ?? null, descricao ?? null, pontos_necessarios ?? null, ativo ?? null, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar recompensa"
        });
    }
}

async function remover(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET ativo = false
             WHERE id = $1
             RETURNING id, nome, descricao, pontos_necessarios, ativo, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao remover recompensa"
        });
    }
}

module.exports = {
    criar,
    listar,
    atualizar,
    remover
};
