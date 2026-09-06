const express = require("express");
const adminController = require("../controllers/admin.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// Só admin — nem funcionário, nem cliente. Reúne KPIs que hoje exigiriam
// combinar /usuarios, /recompensas/admin, /resgates e /pontos/resumo.
router.get(
    "/admin/dashboard",
    authMiddleware,
    roleMiddleware("admin"),
    adminController.dashboard
);

module.exports = router;
