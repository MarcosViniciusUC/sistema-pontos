const express = require("express");
const pointsController = require("../controllers/points.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validatePointsEntrada = require("../middlewares/validatePointsEntrada");
const validatePointsSaida = require("../middlewares/validatePointsSaida");

const router = express.Router();

router.post(
    "/pontos/entrada",
    authMiddleware,
    roleMiddleware("admin"),
    validatePointsEntrada,
    pointsController.entrada
);

router.post(
    "/pontos/saida",
    authMiddleware,
    roleMiddleware("admin"),
    validatePointsSaida,
    pointsController.saida
);

router.get(
    "/pontos/saldo",
    authMiddleware,
    pointsController.saldo
);

router.get(
    "/pontos/historico",
    authMiddleware,
    pointsController.historico
);

module.exports = router;
