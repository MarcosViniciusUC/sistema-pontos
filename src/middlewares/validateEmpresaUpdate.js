// "ativo" não é validado aqui de propósito: PUT não aceita esse campo —
// status muda só por PATCH /empresas/:id/ativar e /desativar (mesmo padrão
// já usado em recompensas, ver validateRewardUpdate.js).
function validateEmpresaUpdate(req, res, next) {
    const { nome, slug } = req.body;

    if (nome !== undefined && (typeof nome !== "string" || nome.trim().length === 0)) {
        return res.status(400).json({
            mensagem: "Campo 'nome' não pode ser vazio"
        });
    }

    if (slug !== undefined && (typeof slug !== "string" || slug.trim().length === 0)) {
        return res.status(400).json({
            mensagem: "Campo 'slug' não pode ser vazio"
        });
    }

    next();
}

module.exports = validateEmpresaUpdate;
