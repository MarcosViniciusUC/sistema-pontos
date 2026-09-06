const express = require("express");
const pointsController = require("../controllers/points.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validatePointsEntrada = require("../middlewares/validatePointsEntrada");
const validatePointsSaida = require("../middlewares/validatePointsSaida");

const router = express.Router();

// Funcionário também pode lançar pontos (parte do atendimento no balcão),
// mas não pode remover pontos nem ver o resumo administrativo abaixo — só
// isso foi liberado para o papel novo, o resto continua admin-only.
router.post(
    "/pontos/entrada",
    authMiddleware,
    roleMiddleware("admin", "funcionario"),
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

router.get(
    "/pontos/resumo",
    authMiddleware,
    roleMiddleware("admin"),
    pointsController.resumoAdmin
);

module.exports = router;
