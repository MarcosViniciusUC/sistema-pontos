const express = require("express");
const redemptionController = require("../controllers/redemption.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateRedemptionCreate = require("../middlewares/validateRedemptionCreate");
const validateResgateValidar = require("../middlewares/validateResgateValidar");

const router = express.Router();

router.post(
    "/resgates",
    authMiddleware,
    validateRedemptionCreate,
    redemptionController.criar
);

router.get(
    "/resgates",
    authMiddleware,
    roleMiddleware("admin"),
    redemptionController.listarAdmin
);

// Qualquer usuário autenticado pode consultar os PRÓPRIOS resgates — o
// filtro por usuario_id vem do token (ver listarMeus), nunca de parâmetro
// de rota/query, então não há como um cliente enxergar resgates de outro.
router.get(
    "/resgates/meus",
    authMiddleware,
    redemptionController.listarMeus
);

// Funcionário também valida resgates (é literalmente a tarefa dele no
// balcão) — a listagem administrativa completa (GET /resgates) continua
// só para admin.
router.post(
    "/resgates/validar",
    authMiddleware,
    roleMiddleware("admin", "funcionario"),
    validateResgateValidar,
    redemptionController.validar
);

// PUT /resgates/:id/aprovar e /recusar foram removidos: no novo fluxo os
// pontos já são descontados no momento da criação do resgate (POST
// /resgates), então não existe mais uma etapa de aprovação manual do
// admin para "liberar" o desconto.

module.exports = router;
