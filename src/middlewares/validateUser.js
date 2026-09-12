const { normalizarCpf, validarCpf } = require("../utils/cpf");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUser(req, res, next) {
    const { nome, email, senha, telefone, cpf } = req.body;

    if (!nome || typeof nome !== "string" || nome.trim().length < 2) {
        return res.status(400).json({
            mensagem: "Campo 'nome' é obrigatório e deve ter no mínimo 2 caracteres"
        });
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
            mensagem: "Campo 'email' é obrigatório e deve ter um formato válido"
        });
    }

    if (!senha || typeof senha !== "string" || senha.length < 6) {
        return res.status(400).json({
            mensagem: "Campo 'senha' é obrigatório e deve ter no mínimo 6 caracteres"
        });
    }

    if (telefone !== undefined && typeof telefone !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'telefone' deve ser uma string"
        });
    }

    // CPF é obrigatório em todo cadastro novo (validação real de dígito
    // verificador, não só contagem de caracteres — ver src/utils/cpf.js).
    // Aceita com ou sem pontuação; o valor normalizado (só dígitos) é
    // gravado em req.body.cpf para o controller nunca precisar normalizar
    // de novo nem gravar a versão com pontuação por engano.
    if (!cpf || typeof cpf !== "string" || !validarCpf(cpf)) {
        return res.status(400).json({
            mensagem: "Campo 'cpf' é obrigatório e deve ser um CPF válido"
        });
    }

    req.body.cpf = normalizarCpf(cpf);

    next();
}

module.exports = validateUser;
