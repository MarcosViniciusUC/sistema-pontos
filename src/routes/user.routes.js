const express = require("express");
const userController = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateUser = require("../middlewares/validateUser");
const validateUserUpdate = require("../middlewares/validateUserUpdate");

const router = express.Router();

router.post("/usuarios", validateUser, userController.cadastrar);

router.get(
    "/usuarios",
    authMiddleware,
    roleMiddleware("admin"),
    userController.listar
);

// Identifica um cliente pelo QR Code individual dele. Funcionário também
// usa isso no dia a dia (é o primeiro passo pra lançar pontos ou validar
// um resgate no balcão).
router.get(
    "/usuarios/qr/:qr_token",
    authMiddleware,
    roleMiddleware("admin", "funcionario"),
    userController.buscarPorQrToken
);

// Busca só o necessário para o funcionário identificar um cliente sem QR
// (fallback por nome/email) — bem mais restrita que GET /usuarios: nada de
// telefone/tipo/criado_em, e nunca outros funcionários/admins. GET /usuarios
// continua admin-only porque devolve a lista completa e dados administrativos
// de TODOS os usuários, o que o funcionário não precisa pra atender alguém.
router.get(
    "/usuarios/buscar-cliente",
    authMiddleware,
    roleMiddleware("admin", "funcionario"),
    userController.buscarCliente
);

router.put(
    "/usuarios/:id",
    authMiddleware,
    roleMiddleware("admin"),
    validateUserUpdate,
    userController.atualizar
);

module.exports = router;
