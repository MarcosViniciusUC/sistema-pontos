// Mesma regra de senha já usada em validateUser.js (mínimo 6 caracteres) —
// reaproveitada, não uma regra nova/conflitante. `confirmar_senha` é
// exigido e comparado aqui (camada de validação), então o controller nunca
// precisa se preocupar com isso.
function validateResetPassword(req, res, next) {
    const { token, senha, confirmar_senha } = req.body;

    if (!token || typeof token !== "string" || token.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'token' é obrigatório"
        });
    }

    if (!senha || typeof senha !== "string" || senha.length < 6) {
        return res.status(400).json({
            mensagem: "Campo 'senha' é obrigatório e deve ter no mínimo 6 caracteres"
        });
    }

    if (confirmar_senha !== senha) {
        return res.status(400).json({
            mensagem: "Os campos 'senha' e 'confirmar_senha' devem ser iguais"
        });
    }

    next();
}

module.exports = validateResetPassword;
