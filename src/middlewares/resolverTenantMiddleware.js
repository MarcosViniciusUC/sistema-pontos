const { resolverTenant } = require("../services/tenantResolver");
const requestContext = require("../config/requestContext");

/**
 * Middleware de resolução de tenant — ETAPA 3A. Só descobre e disponibiliza
 * o contexto (`req.tenantId`/`req.tenant`); NÃO julga se o tenant está
 * ativo (ver exigirTenantAtivoMiddleware.js, próximo da cadeia quando
 * necessário) e NÃO concede nenhuma autorização — isso continua
 * inteiramente a cargo de authMiddleware/roleMiddleware.
 *
 * Usado pelas rotas públicas que ainda não têm JWT (login, cadastro,
 * esqueci-senha) e pela rota de diagnóstico (ver server.js).
 *
 * ETAPA 3C-13 (RLS) — a partir daqui, `next()` roda dentro de
 * `requestContext.runAsTenant(resultado.tenant.id, ...)`. Sem isto,
 * `auth.controller.js:login()` (que consulta `usuarios` ANTES de emitir
 * qualquer JWT) ficaria bloqueado pela política RLS mesmo já sabendo o
 * tenant certo — o `WHERE tenant_id = $2` da query é só um filtro de SQL;
 * quem decide o que a política RLS deixa passar é a variável de sessão
 * `app.tenant_id`, nunca o texto da query. `req.tenant` já foi resolvido
 * por slug (nunca por dado que precise de autenticação prévia) e ainda vai
 * passar por `exigirTenantAtivoMiddleware` logo em seguida — se o tenant
 * estiver inativo, a requisição é rejeitada ali, antes de qualquer query
 * de negócio rodar; setar o contexto aqui não antecipa nenhuma
 * autorização, só torna esse tenant (já identificado publicamente pelo
 * slug) visível para as próprias queries dele.
 */
async function resolverTenantMiddleware(req, res, next) {
    try {
        const resultado = await resolverTenant(req);

        if (resultado.erro === "NAO_ENCONTRADO") {
            return res.status(404).json({
                mensagem: "Tenant não encontrado"
            });
        }

        req.tenant = resultado.tenant;
        req.tenantId = resultado.tenant.id;

        requestContext.runAsTenant(resultado.tenant.id, next);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao resolver tenant"
        });
    }
}

module.exports = resolverTenantMiddleware;
