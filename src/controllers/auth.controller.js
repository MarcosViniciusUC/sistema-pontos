const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/database");

// Hash bcrypt fixo (mesmo custo de 10 rounds usado em todos os hashes reais —
// ver cadastrar() em user.controller.js), gerado uma única vez e nunca
// recalculado em tempo de execução. É só o hash de uma senha aleatória
// qualquer, que nunca autentica ninguém — existe unicamente para dar ao
// bcrypt.compare() um trabalho computacional para fazer quando o email não
// é encontrado.
//
// Por quê: sem isso, "email não existe" retornava 401 imediatamente após o
// SELECT, enquanto "email existe, senha errada" só retornava 401 depois do
// bcrypt.compare() (que é lento de propósito). Essa diferença de tempo
// (dezenas de ms, medida e confirmada na auditoria de segurança) permite
// descobrir quais emails estão cadastrados sem nunca ler o conteúdo da
// resposta — só cronometrando quanto tempo /login demorou. Rodar o mesmo
// bcrypt.compare() nos dois caminhos iguala o custo computacional das duas
// respostas.
const HASH_DUMMY_PARA_IGUALAR_TEMPO = "$2b$10$bPBRitadSGg/sShKhd9qjuuPklzIsrV2NL9szJxHhPKX1RT5bZx4W";

async function login(req, res) {
    const { email, senha } = req.body;

    try {
        const resultado = await pool.query(
            "SELECT * FROM usuarios WHERE email = $1",
            [email]
        );

        const usuario = resultado.rows[0];

        // Sempre roda bcrypt.compare(), exista ou não o usuário — contra o
        // hash real quando existe, contra o hash dummy fixo quando não
        // existe. O resultado desse compare no ramo "sem usuário" nunca pode
        // dar match (a senha dummy não é conhecida por ninguém), então ele só
        // serve para consumir o mesmo tempo, nunca para autenticar.
        const hashParaComparar = usuario ? usuario.senha : HASH_DUMMY_PARA_IGUALAR_TEMPO;
        const senhaCorreta = await bcrypt.compare(senha, hashParaComparar);

        if (!usuario || !senhaCorreta) {
            return res.status(401).json({
                mensagem: "Email ou senha inválidos"
            });
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                tipo: usuario.tipo
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.json({
            mensagem: "Login realizado com sucesso",
            token: token
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao realizar login"
        });
    }
}

module.exports = {
    login
};
