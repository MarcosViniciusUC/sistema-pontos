const { validarCpf } = require("../utils/cpf");
const { ehIdentificadorLegado } = require("../utils/identificadoresLegado");

// Login normal é sempre por CPF. A única exceção é a lista fechada de 3
// contas legadas em identificadoresLegado.js (nenhuma delas tem CPF
// cadastrado, de propósito) — essas continuam entrando pelo identificador
// antigo (email). Não existe meio-termo: qualquer valor que não seja um CPF
// válido E não esteja na lista legada é rejeitado aqui, antes mesmo de
// consultar o banco.
function validateLogin(req, res, next) {
    const { cpf, senha } = req.body;

    const formatoValido = typeof cpf === "string"
        && (ehIdentificadorLegado(cpf) || validarCpf(cpf));

    if (!cpf || typeof cpf !== "string" || !formatoValido) {
        return res.status(400).json({
            mensagem: "Campo 'cpf' é obrigatório e deve ser um CPF válido"
        });
    }

    if (!senha || typeof senha !== "string" || senha.length < 6) {
        return res.status(400).json({
            mensagem: "Campo 'senha' é obrigatório e deve ter no mínimo 6 caracteres"
        });
    }

    next();
}

module.exports = validateLogin;
