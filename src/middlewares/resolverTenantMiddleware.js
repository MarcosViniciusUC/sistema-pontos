const { resolverTenant } = require("../services/tenantResolver");

/**
 * Middleware de resolução de tenant — ETAPA 3A. Só descobre e disponibiliza
 * o contexto (`req.tenantId`/`req.tenant`); NÃO julga se o tenant está
 * ativo (ver exigirTenantAtivoMiddleware.js, próximo da cadeia quando
 * necessário) e NÃO concede nenhuma autorização — isso continua
 * inteiramente a cargo de authMiddleware/roleMiddleware.
 *
 * Ainda não usado por nenhuma rota de negócio existente nesta etapa — só
 * pela rota de diagnóstico criada para provar a camada (ver server.js).
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

        next();

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao resolver tenant"
        });
    }
}

module.exports = resolverTenantMiddleware;
