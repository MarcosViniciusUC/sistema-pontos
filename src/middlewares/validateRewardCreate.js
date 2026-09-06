function validateRewardCreate(req, res, next) {
    const { nome, descricao, pontos_necessarios, empresa_id } = req.body;

    if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'nome' é obrigatório e não pode ser vazio"
        });
    }

    if (descricao !== undefined && typeof descricao !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'descricao' deve ser uma string"
        });
    }

    if (
        pontos_necessarios === undefined ||
        !Number.isInteger(pontos_necessarios) ||
        pontos_necessarios <= 0
    ) {
        return res.status(400).json({
            mensagem: "Campo 'pontos_necessarios' é obrigatório e deve ser um número inteiro maior que 0"
        });
    }

    // Toda recompensa nova pertence a uma empresa (Oficina, Academia, e
    // futuros parceiros) — a existência real da empresa é conferida no
    // controller, aqui só o formato do campo.
    if (empresa_id === undefined || !Number.isInteger(empresa_id) || empresa_id <= 0) {
        return res.status(400).json({
            mensagem: "Campo 'empresa_id' é obrigatório e deve ser um número inteiro válido"
        });
    }

    next();
}

module.exports = validateRewardCreate;
