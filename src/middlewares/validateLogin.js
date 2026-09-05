const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLogin(req, res, next) {
    const { email, senha } = req.body;

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

    next();
}

module.exports = validateLogin;
