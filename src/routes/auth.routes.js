const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const validateLogin = require("../middlewares/validateLogin");

const router = express.Router();

// Limite de tentativas de login: 10 a cada 15 minutos em QUALQUER ambiente,
// EXCETO quando NODE_ENV é explicitamente "development" — nesse caso (só
// desenvolvimento local, testando manualmente) o limite sobe bastante, só
// pra não travar quem está testando na própria máquina.
//
// De propósito uma allow-list (== "development"), não uma deny-list
// (!= "production"): se NODE_ENV vier vazio, indefinido, ou qualquer coisa
// diferente de "development" — inclusive se o Render não definir NODE_ENV
// nenhum, por exemplo — o limite continua o de produção (10). Só relaxa
// quando alguém pede isso de propósito. Em produção (Render), NODE_ENV
// nunca é setado como "development", então nada muda lá.
//
// windowMs continua os mesmos 15 minutos nos dois ambientes — só o número
// de tentativas permitidas nesse período muda.
const LOGIN_LIMITE_DEV = 1000;
const LOGIN_LIMITE_PRODUCAO = 10;

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "development" ? LOGIN_LIMITE_DEV : LOGIN_LIMITE_PRODUCAO,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        mensagem: "Muitas tentativas de login. Tente novamente mais tarde."
    }
});

router.post("/login", loginLimiter, validateLogin, authController.login);

module.exports = router;
