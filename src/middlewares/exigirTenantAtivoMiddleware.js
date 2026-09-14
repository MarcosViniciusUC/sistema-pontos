/**
 * Middleware de validação de tenant ATIVO — ETAPA 3A. Responsabilidade
 * separada de propósito de resolverTenantMiddleware.js: um bloqueia por
 * "não existe", o outro por "existe, mas está desativado" — duas
 * respostas HTTP diferentes, duas razões diferentes, dois middlewares
 * diferentes, nunca uma função fazendo as duas coisas.
 *
 * Sempre usado DEPOIS de resolverTenantMiddleware na cadeia — depende de
 * `req.tenant` já estar preenchido. Se não estiver (erro de composição de
 * middlewares em algum uso futuro), falha de forma explícita em vez de
 * silenciosamente deixar passar.
 */
function exigirTenantAtivoMiddleware(req, res, next) {
    if (!req.tenant) {
        console.log("exigirTenantAtivoMiddleware chamado sem resolverTenantMiddleware antes — req.tenant ausente.");

        return res.status(500).json({
            mensagem: "Erro interno: tenant não foi resolvido antes desta checagem"
        });
    }

    if (req.tenant.status !== "ativo") {
        return res.status(403).json({
            mensagem: "Este tenant está inativo"
        });
    }

    next();
}

module.exports = exigirTenantAtivoMiddleware;
