const { normalizarCpf, validarCpf } = require("../utils/cpf");
const { normalizarSlug } = require("../utils/empresas");
const PLANOS_VALIDOS = require("./validatePlataformaTenantCreate").PLANOS_VALIDOS;

// Mesmo formato já usado em validateUser.js/validatePlataformaTenantAdmin.js —
// reaproveitado de propósito, não uma regra nova.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida o corpo de POST /plataforma/onboarding — as MESMAS regras já
 * aplicadas separadamente por validatePlataformaTenantCreate.js
 * (nome/slug do tenant) e validatePlataformaTenantAdmin.js (dados do
 * admin), reaproveitadas aqui (nunca reescritas) porque o onboarding cria
 * as duas coisas numa única chamada.
 *
 * Diferença deliberada de validatePlataformaTenantCreate.js: `plano` é
 * OBRIGATÓRIO aqui (lá continua opcional, para não alterar o comportamento
 * do endpoint já existente `POST /plataforma/tenants`) — o onboarding
 * existe justamente para "escolher plano", não faria sentido permitir
 * pular essa escolha por este fluxo.
 *
 * Normaliza `slug`/`cpf` (mesmo formato gravado no banco) antes de passar
 * adiante, para o controller nunca precisar normalizar de novo.
 */
function validateOnboarding(req, res, next) {
    const { tenant, admin, empresa } = req.body;

    if (!tenant || typeof tenant !== "object") {
        return res.status(400).json({ mensagem: "Campo 'tenant' é obrigatório" });
    }

    if (!admin || typeof admin !== "object") {
        return res.status(400).json({ mensagem: "Campo 'admin' é obrigatório" });
    }

    if (!empresa || typeof empresa !== "object") {
        return res.status(400).json({ mensagem: "Campo 'empresa' é obrigatório" });
    }

    // ---- tenant ----
    if (!tenant.nome || typeof tenant.nome !== "string" || tenant.nome.trim().length === 0) {
        return res.status(400).json({ mensagem: "Campo 'tenant.nome' é obrigatório e não pode ser vazio" });
    }

    if (!tenant.slug || typeof tenant.slug !== "string") {
        return res.status(400).json({ mensagem: "Campo 'tenant.slug' é obrigatório" });
    }

    const slugTenantNormalizado = normalizarSlug(tenant.slug);

    if (slugTenantNormalizado.length === 0) {
        return res.status(400).json({ mensagem: "Campo 'tenant.slug' inválido — use letras, números e hífen" });
    }

    if (!tenant.plano || typeof tenant.plano !== "string" || !PLANOS_VALIDOS.includes(tenant.plano)) {
        return res.status(400).json({ mensagem: `Campo 'tenant.plano' é obrigatório e deve ser um de: ${PLANOS_VALIDOS.join(", ")}` });
    }

    // ---- admin ----
    if (!admin.nome || typeof admin.nome !== "string" || admin.nome.trim().length < 2) {
        return res.status(400).json({ mensagem: "Campo 'admin.nome' é obrigatório e deve ter no mínimo 2 caracteres" });
    }

    if (!admin.email || typeof admin.email !== "string" || !EMAIL_REGEX.test(admin.email)) {
        return res.status(400).json({ mensagem: "Campo 'admin.email' é obrigatório e deve ter um formato válido" });
    }

    if (!admin.senha || typeof admin.senha !== "string" || admin.senha.length < 6) {
        return res.status(400).json({ mensagem: "Campo 'admin.senha' é obrigatório e deve ter no mínimo 6 caracteres" });
    }

    if (admin.telefone !== undefined && admin.telefone !== null && typeof admin.telefone !== "string") {
        return res.status(400).json({ mensagem: "Campo 'admin.telefone' deve ser uma string" });
    }

    if (!admin.cpf || typeof admin.cpf !== "string" || !validarCpf(admin.cpf)) {
        return res.status(400).json({ mensagem: "Campo 'admin.cpf' é obrigatório e deve ser um CPF válido" });
    }

    // ---- empresa ----
    if (!empresa.nome || typeof empresa.nome !== "string" || empresa.nome.trim().length === 0) {
        return res.status(400).json({ mensagem: "Campo 'empresa.nome' é obrigatório e não pode ser vazio" });
    }

    const slugEmpresaNormalizado = normalizarSlug(empresa.slug || empresa.nome);

    if (slugEmpresaNormalizado.length === 0) {
        return res.status(400).json({ mensagem: "Campo 'empresa.slug' inválido — use letras, números e hífen" });
    }

    req.body.tenant = { nome: tenant.nome.trim(), slug: slugTenantNormalizado, plano: tenant.plano };
    req.body.admin = {
        nome: admin.nome.trim(),
        email: admin.email.trim(),
        senha: admin.senha,
        telefone: admin.telefone ? admin.telefone.trim() : null,
        cpf: normalizarCpf(admin.cpf)
    };
    req.body.empresa = { nome: empresa.nome.trim(), slug: slugEmpresaNormalizado };

    next();
}

module.exports = validateOnboarding;
