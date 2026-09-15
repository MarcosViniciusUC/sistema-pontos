// Mesmos dois valores da CHECK constraint de tenants.status no banco (ver
// scripts/migrate-tenants.js) — lista fechada, nunca um terceiro estado
// inventado aqui.
const STATUS_VALIDOS = ["ativo", "inativo"];

function validatePlataformaTenantStatus(req, res, next) {
    const { status } = req.body;

    if (!status || typeof status !== "string" || !STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({
            mensagem: `Campo 'status' é obrigatório e deve ser um de: ${STATUS_VALIDOS.join(", ")}`
        });
    }

    next();
}

// Mesmo padrão de validatePlataformaTenantCreate.PLANOS_VALIDOS — permite
// validatePlataformaTenantEdit.js reaproveitar a MESMA lista, em vez de
// duplicá-la.
validatePlataformaTenantStatus.STATUS_VALIDOS = STATUS_VALIDOS;

module.exports = validatePlataformaTenantStatus;
