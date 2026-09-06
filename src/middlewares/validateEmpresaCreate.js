function validateEmpresaCreate(req, res, next) {
    const { nome, slug } = req.body;

    if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'nome' é obrigatório e não pode ser vazio"
        });
    }

    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'slug' é obrigatório e não pode ser vazio"
        });
    }

    next();
}

module.exports = validateEmpresaCreate;
