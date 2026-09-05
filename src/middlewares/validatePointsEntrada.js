function validatePointsEntrada(req, res, next) {
    const { usuario_id, quantidade, descricao } = req.body;

    if (usuario_id === undefined || !Number.isInteger(usuario_id)) {
        return res.status(400).json({
            mensagem: "Campo 'usuario_id' é obrigatório e deve ser um número inteiro"
        });
    }

    if (quantidade === undefined || !Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({
            mensagem: "Campo 'quantidade' é obrigatório e deve ser um número inteiro maior que 0"
        });
    }

    if (descricao !== undefined && typeof descricao !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'descricao' deve ser uma string"
        });
    }

    next();
}

module.exports = validatePointsEntrada;
