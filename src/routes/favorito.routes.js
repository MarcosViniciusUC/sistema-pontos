const express = require("express");
const favoritoController = require("../controllers/favorito.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const exigirFuncionalidade = require("../middlewares/exigirFuncionalidadeMiddleware");

const router = express.Router();

// Favorito é um conceito exclusivo de cliente (ver favorito.controller.js) —
// admin/funcionário não têm papel liberado em nenhuma destas três rotas.
// usuario_id nunca vem de parâmetro/body em nenhuma delas, sempre do JWT.
//
// Funcionalidade opcional por plano (ver
// src/services/planosFuncionalidades.service.js) — nas três rotas, nunca só
// no frontend: um tenant sem "favoritos" no plano recebe 403 mesmo
// acertando o resto da requisição.

router.get(
    "/favoritos",
    authMiddleware,
    roleMiddleware("cliente"),
    exigirFuncionalidade("favoritos"),
    favoritoController.listar
);

router.post(
    "/favoritos/:id",
    authMiddleware,
    roleMiddleware("cliente"),
    exigirFuncionalidade("favoritos"),
    favoritoController.favoritar
);

router.delete(
    "/favoritos/:id",
    authMiddleware,
    roleMiddleware("cliente"),
    exigirFuncionalidade("favoritos"),
    favoritoController.desfavoritar
);

module.exports = router;
