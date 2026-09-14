/**
 * ETAPA 3C-7.1 — gate mínimo para ações de PLATAFORMA (Maple Tech).
 * ETAPA 3C-8 — atualizado para checar `req.adminPlataforma` (populado por
 * `authPlataformaMiddleware.js`, a autenticação de plataforma real
 * implementada nesta etapa), não mais `req.usuario` (esse é sempre do
 * modelo de TENANT — ver authMiddleware.js — e nunca deve ser confundido
 * com identidade de plataforma).
 *
 * Roda DEPOIS de `authPlataformaMiddleware` na cadeia da rota. Nesse ponto,
 * `req.adminPlataforma.escopo` já é sempre `"plataforma"` por construção
 * (authPlataformaMiddleware rejeita qualquer outro formato antes de
 * chegar aqui) — esta checagem é uma segunda camada, redundante em termos
 * de resultado, mas mantida de propósito pelo mesmo padrão de duas
 * responsabilidades separadas já usado no projeto (ver
 * resolverTenantMiddleware + exigirTenantAtivoMiddleware): uma
 * autentica/identifica, a outra autoriza — nunca a mesma função fazendo
 * as duas coisas.
 */
function exigirEscopoPlataforma(req, res, next) {
    if (!req.adminPlataforma || req.adminPlataforma.escopo !== "plataforma") {
        return res.status(403).json({
            mensagem: "Esta ação requer um administrador de plataforma"
        });
    }

    next();
}

module.exports = exigirEscopoPlataforma;
