const { normalizarCpf, validarCpf } = require("../utils/cpf");

// Mesmo formato de e-mail já usado em validateUser.js — reaproveitado de
// propósito, não uma regra nova.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mesmas regras de validateUser.js (cadastro público de cliente) — CPF
 * real obrigatório, sem exceção: quem preenche este formulário é a própria
 * Maple Tech dando onboarding a um admin de tenant real, nunca uma conta
 * de teste/exceção como as 3 legadas do Movement.
 */
function validatePlataformaTenantAdmin(req, res, next) {
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

    if (!cpf || typeof cpf !== "string" || !validarCpf(cpf)) {
        return res.status(400).json({
            mensagem: "Campo 'cpf' é obrigatório e deve ser um CPF válido"
        });
    }

    req.body.cpf = normalizarCpf(cpf);

    next();
}

module.exports = validatePlataformaTenantAdmin;
