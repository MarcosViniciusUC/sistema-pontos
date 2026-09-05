function validateRedemptionCreate(req, res, next) {
    const { recompensa_id } = req.body;

    if (recompensa_id === undefined || !Number.isInteger(recompensa_id)) {
        return res.status(400).json({
            mensagem: "Campo 'recompensa_id' é obrigatório e deve ser um número inteiro"
        });
    }

    next();
}

module.exports = validateRedemptionCreate;
