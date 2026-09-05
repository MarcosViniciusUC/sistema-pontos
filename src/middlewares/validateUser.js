const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUser(req, res, next) {
    const { nome, email, senha, telefone } = req.body;

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

    next();
}

module.exports = validateUser;
