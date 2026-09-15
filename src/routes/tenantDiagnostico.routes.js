const express = require("express");
const resolverTenantMiddleware = require("../middlewares/resolverTenantMiddleware");
const exigirTenantAtivoMiddleware = require("../middlewares/exigirTenantAtivoMiddleware");

const router = express.Router();

/**
 * Rota de DIAGNÓSTICO — ETAPA 3A. Único propósito: provar que a cadeia
 * resolverTenantMiddleware -> exigirTenantAtivoMiddleware funciona de
 * ponta a ponta, sem tocar em nenhuma rota de negócio existente. Não
 * requer autenticação de propósito (não está testando autorização, só
 * resolução de tenant) e não deve ser tratada como uma rota de produto —
 * candidata a remoção/evolução assim que rotas de negócio reais
 * começarem a consumir `req.tenantId`.
 *
 * Uso manual:
 *   GET /diagnostico/tenant                              -> fallback 'movement'
 *   GET /diagnostico/tenant?tenantSlug=movement           -> explícito
 *   GET /diagnostico/tenant -H "X-Tenant-Slug: movement"  -> via header
 */
router.get(
    "/diagnostico/tenant",
    resolverTenantMiddleware,
    exigirTenantAtivoMiddleware,
    function (req, res) {
        res.json({
            tenantId: req.tenantId,
            tenant: req.tenant
        });
    }
);

module.exports = router;
