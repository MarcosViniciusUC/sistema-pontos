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

module.exports = router;
