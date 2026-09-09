const express = require("express");
const empresaController = require("../controllers/empresa.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateEmpresaCreate = require("../middlewares/validateEmpresaCreate");
const validateEmpresaUpdate = require("../middlewares/validateEmpresaUpdate");

const router = express.Router();

router.post(
    "/empresas",
    authMiddleware,
    roleMiddleware("admin"),
    validateEmpresaCreate,
    empresaController.criar
);

// Admin e funcionário usam isso pra popular o select de empresa (criar
// recompensa, editar recompensa, lançar entrada de pontos). Cliente também
// tem acesso — usa pra montar o filtro por empresa em Recompensas — porque
// a resposta já é só {id, nome, slug} de empresas ativas, sem nenhum dado
// administrativo (nada de inativas, criado_em, etc.), então não há
// exposição indevida em liberar esse mesmo endpoint pro cliente autenticado.
router.get(
    "/empresas",
    authMiddleware,
    roleMiddleware("admin", "funcionario", "cliente"),
    empresaController.listar
);

// Listagem administrativa (ativas + inativas). Admin-only — os selects de
// pontos/recompensas continuam só em GET /empresas (só ativas), inalterado.
router.get(
    "/empresas/admin",
    authMiddleware,
    roleMiddleware("admin"),
    empresaController.listarAdmin
);

// "Ver mais" (admin) — análise da participação da empresa no programa de
// pontos. Admin-only, mesmo padrão de GET /empresas/admin.
router.get(
    "/empresas/:id/detalhes",
    authMiddleware,
    roleMiddleware("admin"),
    empresaController.detalhar
);

router.put(
    "/empresas/:id",
    authMiddleware,
    roleMiddleware("admin"),
    validateEmpresaUpdate,
    empresaController.atualizar
);

router.patch(
    "/empresas/:id/ativar",
    authMiddleware,
    roleMiddleware("admin"),
    empresaController.ativar
);

router.patch(
    "/empresas/:id/desativar",
    authMiddleware,
    roleMiddleware("admin"),
    empresaController.desativar
);

module.exports = router;
