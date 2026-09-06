const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUserUpdate(req, res, next) {
    const { nome, email, telefone } = req.body;

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

    next();
}

module.exports = validateUserUpdate;
