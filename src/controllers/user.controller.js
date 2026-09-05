const bcrypt = require("bcrypt");
const pool = require("../config/database");

async function cadastrar(req, res) {
    const { nome, email, senha, telefone } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);

    try {
        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, telefone, tipo)
             VALUES ($1, $2, $3, $4, 'cliente')
             RETURNING id, nome, email, telefone`,
            [nome, email, senhaHash, telefone]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        if (erro.code === "23505") {
            return res.status(409).json({
                mensagem: "Este email já está cadastrado"
            });
        }

        res.status(500).json({
            mensagem: "Erro ao cadastrar usuário"
        });
    }
}

module.exports = {
    cadastrar
};
