const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const validateLogin = require("../middlewares/validateLogin");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        mensagem: "Muitas tentativas de login. Tente novamente mais tarde."
    }
});

router.post("/login", loginLimiter, validateLogin, authController.login);

module.exports = router;
