const express = require("express");
const favoritoController = require("../controllers/favorito.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// Favorito é um conceito exclusivo de cliente (ver favorito.controller.js) —
// admin/funcionário não têm papel liberado em nenhuma destas três rotas.
// usuario_id nunca vem de parâmetro/body em nenhuma delas, sempre do JWT.

router.get(
    "/favoritos",
    authMiddleware,
    roleMiddleware("cliente"),
    favoritoController.listar
);

router.post(
    "/favoritos/:id",
    authMiddleware,
    roleMiddleware("cliente"),
    favoritoController.favoritar
);

router.delete(
    "/favoritos/:id",
    authMiddleware,
    roleMiddleware("cliente"),
    favoritoController.desfavoritar
);

module.exports = router;
