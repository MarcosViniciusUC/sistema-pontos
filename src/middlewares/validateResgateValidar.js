function validateResgateValidar(req, res, next) {
    const { codigo } = req.body;

    if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'codigo' é obrigatório"
        });
    }

    next();
}

module.exports = validateResgateValidar;
