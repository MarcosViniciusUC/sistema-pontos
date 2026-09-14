const express = require("express");
const engagementController = require("../controllers/engagement.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const authPlataformaMiddleware = require("../middlewares/authPlataformaMiddleware");
const exigirEscopoPlataforma = require("../middlewares/exigirEscopoPlataforma");

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

// Roda uma rodada do scheduler agora, sem esperar o intervalo automático —
// sempre em modo SIMULAÇÃO, mesma proteção contra sobreposição do
// intervalo automático (ver scheduler.js). Nunca envia nada real.
//
// ETAPA 3C-7.1 — esta rodada processa clientes de TODOS os tenants (ver
// scheduler.js/collectors.js), então NÃO pode ser admin-comum de tenant.
//
// ETAPA 3C-8 — `authPlataformaMiddleware` substitui `authMiddleware` nesta
// rota (nunca os dois juntos): `authMiddleware` exige `tenant_id` no token
// e REJEITARIA corretamente um JWT de plataforma por não ter esse campo —
// um admin de plataforma não tem tenant, então a rota nunca poderia usar a
// autenticação de tenant. `exigirEscopoPlataforma` continua depois, como
// segunda camada (ver o próprio middleware) — juntos, só um JWT de
// plataforma real (`{ id, escopo: "plataforma" }`, emitido por
// POST /plataforma/login) passa por aqui; um JWT de tenant é rejeitado já
// no primeiro middleware (401, formato inválido para este recurso), nunca
// chega a "não autorizado" por tipo/papel.
router.post(
    "/admin/engajamento/scheduler/executar",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    engagementController.executarSchedulerAgora
);

module.exports = router;
