// Mesmo formato de e-mail já usado em validateUser.js — reaproveitado de
// propósito, não uma regra nova. Rejeitar aqui um valor mal formatado
// (ex: "abc") é só validação de formato, não vaza se existe conta com
// aquele endereço — a mesma proteção que já existe hoje para "admin"/
// "funcio" no login por CPF (identificadores literais não são e-mail e
// nunca vão bater neste regex, então nunca chegam ao fluxo de recuperação
// por e-mail — ver auth.controller.js e identificadoresLegado.js).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForgotPassword(req, res, next) {
    const { email } = req.body;

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
            mensagem: "Campo 'email' é obrigatório e deve ter um formato válido"
        });
    }

    next();
}

module.exports = validateForgotPassword;
