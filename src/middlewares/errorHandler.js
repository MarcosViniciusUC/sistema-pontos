function errorHandler(err, req, res, next) {
    console.error(err);

    if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
        return res.status(400).json({
            mensagem: "JSON inválido no corpo da requisição"
        });
    }

    if (err.type === "entity.too.large") {
        return res.status(413).json({
            mensagem: "Corpo da requisição excede o tamanho permitido"
        });
    }

    res.status(500).json({
        mensagem: "Erro interno do servidor"
    });
}

module.exports = errorHandler;
