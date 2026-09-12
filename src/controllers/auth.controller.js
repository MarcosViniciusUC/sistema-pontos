const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { normalizarCpf } = require("../utils/cpf");
const { ehIdentificadorLegado } = require("../utils/identificadoresLegado");

// Hash bcrypt fixo (mesmo custo de 10 rounds usado em todos os hashes reais —
// ver cadastrar() em user.controller.js), gerado uma única vez e nunca
// recalculado em tempo de execução. É só o hash de uma senha aleatória
// qualquer, que nunca autentica ninguém — existe unicamente para dar ao
// bcrypt.compare() um trabalho computacional para fazer quando o
// CPF/identificador não é encontrado.
//
// Por quê: sem isso, "identificador não existe" retornava 401 imediatamente
// após o SELECT, enquanto "identificador existe, senha errada" só retornava
// 401 depois do bcrypt.compare() (que é lento de propósito). Essa diferença
// de tempo (dezenas de ms, medida e confirmada na auditoria de segurança)
// permite descobrir quais CPFs estão cadastrados sem nunca ler o conteúdo da
// resposta — só cronometrando quanto tempo /login demorou. Rodar o mesmo
// bcrypt.compare() nos dois caminhos (CPF normal ou identificador legado)
// iguala o custo computacional de todas as respostas.
const HASH_DUMMY_PARA_IGUALAR_TEMPO = "$2b$10$bPBRitadSGg/sShKhd9qjuuPklzIsrV2NL9szJxHhPKX1RT5bZx4W";

async function login(req, res) {
    const { cpf, senha } = req.body;

    try {
        // Login normal é por CPF (coluna `cpf`, só dígitos). As 3 contas da
        // lista fechada em identificadoresLegado.js (nenhuma tem CPF
        // cadastrado, de propósito) continuam entrando pelo identificador
        // antigo, buscado por `email` — nunca as duas coisas ao mesmo tempo
        // para o mesmo valor, e nunca um fallback genérico "tenta CPF, se
        // não achar tenta email" para qualquer usuário fora dessa lista.
        const resultado = ehIdentificadorLegado(cpf)
            ? await pool.query("SELECT * FROM usuarios WHERE email = $1", [cpf])
            : await pool.query("SELECT * FROM usuarios WHERE cpf = $1", [normalizarCpf(cpf)]);

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
                mensagem: "CPF ou senha inválidos"
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
