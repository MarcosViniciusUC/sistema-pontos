// Lista fechada de valores conhecidos para `plano` — informação
// administrativa, nunca um mecanismo de cobrança (ver
// plataformaTenant.controller.js:criar). Qualquer outro valor é rejeitado
// aqui, antes de chegar ao banco.
const PLANOS_VALIDOS = ["founder", "essencial", "pro", "rede"];

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

module.exports = validatePlataformaTenantCreate;
