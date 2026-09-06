function validatePointsEntrada(req, res, next) {
    const { usuario_id, quantidade, descricao, empresa_id } = req.body;

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

    // A existência real da empresa (e se está ativa) é conferida no
    // controller — aqui só o formato do campo.
    if (empresa_id === undefined || !Number.isInteger(empresa_id) || empresa_id <= 0) {
        return res.status(400).json({
            mensagem: "Campo 'empresa_id' é obrigatório e deve ser um número inteiro válido"
        });
    }

    next();
}

module.exports = validatePointsEntrada;
