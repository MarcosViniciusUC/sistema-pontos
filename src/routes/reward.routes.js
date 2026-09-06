const express = require("express");
const rewardController = require("../controllers/reward.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateRewardCreate = require("../middlewares/validateRewardCreate");
const validateRewardUpdate = require("../middlewares/validateRewardUpdate");

const router = express.Router();

router.post(
    "/recompensas",
    authMiddleware,
    roleMiddleware("admin"),
    validateRewardCreate,
    rewardController.criar
);

router.get(
    "/recompensas",
    authMiddleware,
    rewardController.listar
);

// Listagem administrativa (ativas + inativas). Admin-only — cliente e
// funcionário continuam só com GET /recompensas (só ativas), inalterado.
router.get(
    "/recompensas/admin",
    authMiddleware,
    roleMiddleware("admin"),
    rewardController.listarAdmin
);

router.put(
    "/recompensas/:id",
    authMiddleware,
    roleMiddleware("admin"),
    validateRewardUpdate,
    rewardController.atualizar
);

router.delete(
    "/recompensas/:id",
    authMiddleware,
    roleMiddleware("admin"),
    rewardController.remover
);

// Soft-delete reverso: só religa ativo=true, nunca cria uma recompensa nova.
router.patch(
    "/recompensas/:id/reativar",
    authMiddleware,
    roleMiddleware("admin"),
    rewardController.reativar
);

module.exports = router;
