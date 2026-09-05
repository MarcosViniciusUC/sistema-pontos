const bcrypt = require("bcrypt");
const express = require("express");
const pool = require("./src/config/database");
const authRoutes = require("./src/routes/auth.routes");

const app = express();
app.use(express.json());

app.use(authRoutes);

app.post("/usuarios", async (req, res) => {
    const { nome, email, senha, telefone } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);

    try {
        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, telefone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nome, email, telefone`,
            [nome, email, senhaHash, telefone]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao cadastrar usuário"
        });
    }
});

app.get("/", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW()");

        res.json({
            mensagem: "API e banco funcionando!",
            horario: resultado.rows[0].now
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao conectar com o banco"
        });
    }
});

app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000");
});