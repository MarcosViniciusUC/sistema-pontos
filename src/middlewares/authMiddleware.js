const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            mensagem: "Token não informado"
        });
    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
        return res.status(401).json({
            mensagem: "Token em formato inválido"
        });
    }

    const token = partes[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.usuario = decoded;

        next();

    } catch (erro) {
        return res.status(401).json({
            mensagem: "Token inválido ou expirado"
        });
    }
}

module.exports = authMiddleware;
