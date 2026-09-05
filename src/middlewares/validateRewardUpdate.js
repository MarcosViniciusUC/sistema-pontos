function validateRewardUpdate(req, res, next) {
    const { nome, descricao, pontos_necessarios, ativo } = req.body;

    if (nome !== undefined && (typeof nome !== "string" || nome.trim().length === 0)) {
        return res.status(400).json({
            mensagem: "Campo 'nome' não pode ser vazio"
        });
    }

    if (descricao !== undefined && typeof descricao !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'descricao' deve ser uma string"
        });
    }

    if (
        pontos_necessarios !== undefined &&
        (!Number.isInteger(pontos_necessarios) || pontos_necessarios <= 0)
    ) {
        return res.status(400).json({
            mensagem: "Campo 'pontos_necessarios' deve ser um número inteiro maior que 0"
        });
    }

    if (ativo !== undefined && typeof ativo !== "boolean") {
        return res.status(400).json({
            mensagem: "Campo 'ativo' deve ser um valor booleano"
        });
    }

    next();
}

module.exports = validateRewardUpdate;
