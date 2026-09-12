const express = require("express");
const engagementController = require("../controllers/engagement.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// Só admin — o Motor de Engajamento (Bloco 3) ainda não tem nenhuma
// automação ativa (ver automationRegistry.js) nem envia nada de verdade
// (ver providers/*.js, ambos stub). Esta rota só SIMULA a mensagem para um
// cliente específico, para revisão antes de qualquer decisão comercial.
router.post(
    "/admin/engajamento/simular",
    authMiddleware,
    roleMiddleware("admin"),
    engagementController.simular
);

module.exports = router;
