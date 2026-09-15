const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const validateLogin = require("../middlewares/validateLogin");
const validateForgotPassword = require("../middlewares/validateForgotPassword");
const validateResetPassword = require("../middlewares/validateResetPassword");
const resolverTenantMiddleware = require("../middlewares/resolverTenantMiddleware");
const exigirTenantAtivoMiddleware = require("../middlewares/exigirTenantAtivoMiddleware");

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

// ETAPA 3B — resolverTenantMiddleware roda ANTES do controller: resolve o
// tenant (header X-Tenant-Slug / query ?tenantSlug=, com fallback fixo
// 'movement' — ver src/services/tenantResolver.js) e bloqueia (404/403)
// antes mesmo de tocar na tabela `usuarios`. O frontend atual não manda
// nenhum slug, então continua caindo sempre no fallback Movement, sem
// precisar mudar nada na URL/chamada existente.
router.post(
    "/login",
    loginLimiter,
    validateLogin,
    resolverTenantMiddleware,
    exigirTenantAtivoMiddleware,
    authController.login
);

// Mesmo mecanismo de rate limit do login (express-rate-limit, mesmo padrão
// allow-list de NODE_ENV), instância PRÓPRIA — não a mesma de `loginLimiter`
// porque são ações diferentes (uma tentativa de login não deveria consumir
// a cota de pedidos de recuperação, e vice-versa), mas a MESMA ferramenta,
// nunca uma estratégia paralela. Mais restrita que o login porque este
// endpoint pode ser usado para mandar e-mail de spam para terceiros (o
// atacante não precisa saber a senha de ninguém pra abusar dele).
const ESQUECI_SENHA_LIMITE_DEV = 1000;
const ESQUECI_SENHA_LIMITE_PRODUCAO = 5;

const esqueciSenhaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "development" ? ESQUECI_SENHA_LIMITE_DEV : ESQUECI_SENHA_LIMITE_PRODUCAO,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        mensagem: "Muitas solicitações. Tente novamente mais tarde."
    }
});

// Mesmo motivo do /login: resolve o tenant (fallback Movement) antes de
// procurar o usuário pelo e-mail, para que "Tenant A + e-mail X" nunca
// encontre um usuário de outro tenant que por coincidência tenha o mesmo
// e-mail (email agora é único só POR TENANT, não mais globalmente).
router.post(
    "/login/esqueci-senha",
    esqueciSenhaLimiter,
    validateForgotPassword,
    resolverTenantMiddleware,
    exigirTenantAtivoMiddleware,
    authController.esqueciSenha
);

// /login/redefinir-senha NÃO precisa de resolverTenantMiddleware: o único
// credencial aqui é o próprio token de reset (256 bits, uso único), que já
// foi emitido para exatamente um `usuario_id` (e portanto exatamente um
// tenant) lá em esqueciSenha() — não há slug/identificador ambíguo para
// resolver nesta rota, então não há nada que um tenant "errado" pudesse
// fazer confundir com outro. Continua sem limiter dedicado pelo mesmo
// motivo de sempre (força bruta contra um token de 256 bits é inviável;
// globalLimiter da API já cobre esta rota).
router.post("/login/redefinir-senha", validateResetPassword, authController.redefinirSenha);

module.exports = router;
