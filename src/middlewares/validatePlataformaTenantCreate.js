// Catálogo comercial real da Maple Tech (ver planos.codigo, criada em
// scripts/migrate-planos-funcionalidades.js — mesma fonte de verdade que
// src/services/planosFuncionalidades.service.js usa para resolver
// funcionalidades). Qualquer outro valor é rejeitado aqui, antes de chegar
// ao banco. Substituiu a lista provisória anterior
// (founder/essencial/pro/rede, de uma etapa em que `plano` ainda não tinha
// nenhuma regra associada) — nenhum tenant real chegou a usar aqueles
// valores.
const PLANOS_VALIDOS = ["essencial", "profissional", "premium"];

function validatePlataformaTenantCreate(req, res, next) {
    const { nome, slug, plano } = req.body;

    if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'nome' é obrigatório e não pode ser vazio"
        });
    }

    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'slug' é obrigatório e não pode ser vazio"
        });
    }

    if (plano !== undefined && plano !== null && !PLANOS_VALIDOS.includes(plano)) {
        return res.status(400).json({
            mensagem: `Campo 'plano', quando enviado, deve ser um de: ${PLANOS_VALIDOS.join(", ")}`
        });
    }

    next();
}

// Exposto como propriedade da própria função (nunca um segundo export
// nomeado, pra não mudar a forma como este módulo já é importado em
// plataforma.routes.js) — permite que validateOnboarding.js reaproveite a
// MESMA lista, em vez de duplicá-la.
validatePlataformaTenantCreate.PLANOS_VALIDOS = PLANOS_VALIDOS;

module.exports = validatePlataformaTenantCreate;
