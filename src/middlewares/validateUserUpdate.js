const { normalizarCpf, validarCpf } = require("../utils/cpf");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUserUpdate(req, res, next) {
    const { nome, email, telefone, cpf } = req.body;

    if (nome !== undefined && (typeof nome !== "string" || nome.trim().length < 2)) {
        return res.status(400).json({
            mensagem: "Campo 'nome' deve ter no mínimo 2 caracteres"
        });
    }

    if (email !== undefined && (typeof email !== "string" || !EMAIL_REGEX.test(email))) {
        return res.status(400).json({
            mensagem: "Campo 'email' deve ter um formato válido"
        });
    }

    if (telefone !== undefined && typeof telefone !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'telefone' deve ser uma string"
        });
    }

    // CPF continua opcional nesta rota (edição admin de conta já existente
    // — contas antigas ainda podem não ter CPF cadastrado), mas se vier,
    // precisa ser um CPF real, nunca só 11 caracteres quaisquer.
    if (cpf !== undefined && (typeof cpf !== "string" || !validarCpf(cpf))) {
        return res.status(400).json({
            mensagem: "Campo 'cpf' deve ser um CPF válido"
        });
    }

    if (cpf !== undefined) {
        req.body.cpf = normalizarCpf(cpf);
    }

    next();
}

module.exports = validateUserUpdate;
