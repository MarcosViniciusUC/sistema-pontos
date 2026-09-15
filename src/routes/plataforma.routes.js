const express = require("express");
const rateLimit = require("express-rate-limit");
const plataformaController = require("../controllers/plataforma.controller");
const plataformaTenantController = require("../controllers/plataformaTenant.controller");
const validatePlataformaLogin = require("../middlewares/validatePlataformaLogin");
const validatePlataformaTenantCreate = require("../middlewares/validatePlataformaTenantCreate");
const validatePlataformaTenantStatus = require("../middlewares/validatePlataformaTenantStatus");
const validatePlataformaTenantEdit = require("../middlewares/validatePlataformaTenantEdit");
const validatePlataformaTenantAdmin = require("../middlewares/validatePlataformaTenantAdmin");
const validateOnboarding = require("../middlewares/validateOnboarding");
const authPlataformaMiddleware = require("../middlewares/authPlataformaMiddleware");
const exigirEscopoPlataforma = require("../middlewares/exigirEscopoPlataforma");
const { listarCatalogoDePlanos } = require("../services/planosFuncionalidades.service");

const router = express.Router();

// Mesmo mecanismo/padrão de rate limit do login de tenant (ver
// loginLimiter em auth.routes.js) — instância PRÓPRIA, nunca compartilhada:
// tentativas de login de plataforma não devem consumir nem ser afetadas
// pela cota de login de tenant, e vice-versa.
const LOGIN_PLATAFORMA_LIMITE_DEV = 1000;
const LOGIN_PLATAFORMA_LIMITE_PRODUCAO = 10;

const loginPlataformaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "development" ? LOGIN_PLATAFORMA_LIMITE_DEV : LOGIN_PLATAFORMA_LIMITE_PRODUCAO,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        mensagem: "Muitas tentativas de login. Tente novamente mais tarde."
    }
});

// Rota SEPARADA do login de tenant (POST /login, ver auth.routes.js) de
// propósito — nenhum resolverTenantMiddleware aqui, nenhuma noção de
// tenant/slug entra nesta rota. Consulta exclusivamente `admins_plataforma`
// (ver plataforma.controller.js).
router.post(
    "/plataforma/login",
    loginPlataformaLimiter,
    validatePlataformaLogin,
    plataformaController.login
);

// ETAPA 3C-9 — gestão de TENANTS, exclusiva da plataforma. Todas exigem
// authPlataformaMiddleware + exigirEscopoPlataforma (mesmo par usado em
// POST /admin/engajamento/scheduler/executar — ver engagement.routes.js):
// um JWT de tenant nunca passa da primeira dessas duas, seja qual for o
// `tipo`/papel do usuário autenticado. Nenhuma rota aqui embaixo lê
// req.usuario/req.tenantId — não existe contexto de tenant nestas rotas.
router.get(
    "/plataforma/tenants",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    plataformaTenantController.listar
);

router.get(
    "/plataforma/tenants/:id",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    plataformaTenantController.detalhar
);

router.post(
    "/plataforma/tenants",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    validatePlataformaTenantCreate,
    plataformaTenantController.criar
);

router.patch(
    "/plataforma/tenants/:id/status",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    validatePlataformaTenantStatus,
    plataformaTenantController.atualizarStatus
);

// MUDANÇA DE ARQUITETURA — "Editar tenant": nome/cor/telefone/whatsapp/
// plano/status passam a ser editáveis exclusivamente pela Maple Tech.
// Substitui `PATCH /tenant/config` (removido de tenant.routes.js), que
// deixava o próprio admin do tenant alterar essa identidade. `logoUrl`
// nunca faz parte da whitelist (ver validatePlataformaTenantEdit.js) — não
// é configurável por ninguém nesta fase. Coexiste sem conflito com
// `PATCH /plataforma/tenants/:id/status` acima (ação rápida dedicada de
// ativar/desativar, usada pelo botão da tela de detalhe) — os dois
// endpoints escrevem a mesma coluna `status`, nenhum invalida o outro.
router.patch(
    "/plataforma/tenants/:id",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    validatePlataformaTenantEdit,
    plataformaTenantController.atualizarConfiguracao
);

// Cria o primeiro admin do tenant — ver avaliação de escopo no relatório
// desta etapa. `tenant_id` vem sempre de `:id` (a URL), nunca do body.
router.post(
    "/plataforma/tenants/:id/admin",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    validatePlataformaTenantAdmin,
    plataformaTenantController.criarAdmin
);

// Catálogo de planos + funcionalidades — fonte central de verdade (ver
// planosFuncionalidades.service.js) para o onboarding renderizar a
// comparação de planos sem duplicar regras manualmente no frontend. Só
// leitura, sem nenhum dado de tenant específico envolvido.
router.get(
    "/plataforma/planos",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    async function (req, res) {
        try {
            const planos = await listarCatalogoDePlanos();
            res.json(planos);
        } catch (erro) {
            console.log(erro);
            res.status(500).json({ mensagem: "Erro ao listar planos" });
        }
    }
);

// Onboarding — cria tenant + administrador inicial + empresa/unidade
// inicial numa única transação (ver plataformaTenant.controller.js:onboarding).
// Substitui, para o fluxo de "novo cliente pronto para uso", a combinação
// manual de POST /plataforma/tenants + POST /plataforma/tenants/:id/admin
// (que continuam existindo, sem nenhuma mudança de comportamento, para
// quem precisar criar um tenant e adicionar o admin em momentos
// separados).
router.post(
    "/plataforma/onboarding",
    authPlataformaMiddleware,
    exigirEscopoPlataforma,
    validateOnboarding,
    plataformaTenantController.onboarding
);

module.exports = router;
