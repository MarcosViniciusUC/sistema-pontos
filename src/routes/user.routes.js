const express = require("express");
const userController = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateUser = require("../middlewares/validateUser");
const validateUserUpdate = require("../middlewares/validateUserUpdate");
const resolverTenantMiddleware = require("../middlewares/resolverTenantMiddleware");
const exigirTenantAtivoMiddleware = require("../middlewares/exigirTenantAtivoMiddleware");

const router = express.Router();

// ETAPA 3B — cadastro é uma rota PÚBLICA (ainda não existe token/sessão
// nesse momento), então o tenant não pode vir do JWT como nas rotas
// autenticadas abaixo. Usa o mesmo mecanismo de login/esqueci-senha: slug
// explícito (header X-Tenant-Slug / query ?tenantSlug=) resolvido e
// validado ANTES do controller, com fallback fixo 'movement' — o frontend
// atual não manda slug nenhum, então continua criando contas em Movement
// sem precisar mudar nada na URL/chamada existente.
router.post(
    "/usuarios",
    resolverTenantMiddleware,
    exigirTenantAtivoMiddleware,
    validateUser,
    userController.cadastrar
);

// Dados do próprio usuário autenticado (qualquer papel) — nome, email,
// telefone e qr_token para a tela de Perfil do cliente exibir o cabeçalho
// e o próprio QR Code. Sempre filtrado por req.usuario.id (do token), nunca
// por um id vindo do cliente — mesmo padrão de segurança já usado em
// GET /pontos/saldo, GET /pontos/historico e GET /resgates/meus. Nunca
// inclui a coluna senha.
router.get(
    "/usuarios/me",
    authMiddleware,
    userController.meuPerfil
);

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
