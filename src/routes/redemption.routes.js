const express = require("express");
const redemptionController = require("../controllers/redemption.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateRedemptionCreate = require("../middlewares/validateRedemptionCreate");
const validateResgateId = require("../middlewares/validateResgateId");

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

router.put(
    "/resgates/:id/aprovar",
    authMiddleware,
    roleMiddleware("admin"),
    validateResgateId,
    redemptionController.aprovar
);

router.put(
    "/resgates/:id/recusar",
    authMiddleware,
    roleMiddleware("admin"),
    validateResgateId,
    redemptionController.recusar
);

module.exports = router;
