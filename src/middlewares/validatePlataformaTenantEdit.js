const { PLANOS_VALIDOS } = require("./validatePlataformaTenantCreate");
const { STATUS_VALIDOS } = require("./validatePlataformaTenantStatus");

// Mesma whitelist explícita de campos que validateTenantConfigUpdate.js
// usava (etapa anterior, admin do próprio tenant) — agora exclusiva da
// Maple Tech, com "plano" e "status" a mais (só a plataforma decide isso) e
// SEM "logoUrl": logo não é mais configurável por ninguém nesta fase (ver
// PATCH /plataforma/tenants/:id em plataforma.routes.js). "tenant_id"/"id"
// nunca aparecem aqui de propósito — qualquer chave fora desta lista
// (inclusive essas duas) é rejeitada antes de chegar ao controller.
const CAMPOS_PERMITIDOS = ["nome", "corPrimaria", "telefone", "whatsapp", "plano", "status"];

function validarCorPrimaria(valor) {
    if (typeof valor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(valor)) {
        return "Campo 'corPrimaria' deve ser um hexadecimal no formato #RRGGBB";
    }
    return null;
}

// Mesmo formato/tolerância de validateTenantConfigUpdate.js — sem país-alvo
// fixo, só recusa lixo óbvio.
function validarTelefone(valor, nomeCampo) {
    if (typeof valor !== "string" || !/^[0-9+()\-\s]{8,20}$/.test(valor)) {
        return `Campo '${nomeCampo}' deve conter entre 8 e 20 caracteres, usando apenas dígitos e os símbolos + ( ) -`;
    }
    return null;
}

/**
 * PATCH /plataforma/tenants/:id — edição de identidade/comercial pela
 * Maple Tech. Cada campo é OPCIONAL (PATCH parcial) — só valida o que foi
 * de fato enviado; pelo menos um campo é exigido. `plano`/`status` contra
 * as MESMAS listas fechadas já usadas em criação/ativação de tenant (nunca
 * duplicadas aqui).
 */
function validatePlataformaTenantEdit(req, res, next) {
    const camposDesconhecidos = Object.keys(req.body).filter(function (chave) {
        return !CAMPOS_PERMITIDOS.includes(chave);
    });

    if (camposDesconhecidos.length > 0) {
        return res.status(400).json({
            mensagem: `Campo(s) não reconhecido(s): ${camposDesconhecidos.join(", ")}`
        });
    }

    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({
            mensagem: "Envie ao menos um campo para atualizar (nome, corPrimaria, telefone, whatsapp, plano, status)"
        });
    }

    const { nome, corPrimaria, telefone, whatsapp, plano, status } = req.body;

    if (nome !== undefined && (typeof nome !== "string" || nome.trim().length === 0)) {
        return res.status(400).json({ mensagem: "Campo 'nome' não pode ser vazio" });
    }

    if (corPrimaria !== undefined && corPrimaria !== null) {
        const erro = validarCorPrimaria(corPrimaria);
        if (erro) return res.status(400).json({ mensagem: erro });
    }

    if (telefone !== undefined && telefone !== null) {
        const erro = validarTelefone(telefone, "telefone");
        if (erro) return res.status(400).json({ mensagem: erro });
    }

    if (whatsapp !== undefined && whatsapp !== null) {
        const erro = validarTelefone(whatsapp, "whatsapp");
        if (erro) return res.status(400).json({ mensagem: erro });
    }

    if (plano !== undefined && !PLANOS_VALIDOS.includes(plano)) {
        return res.status(400).json({
            mensagem: `Campo 'plano', quando enviado, deve ser um de: ${PLANOS_VALIDOS.join(", ")}`
        });
    }

    if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({
            mensagem: `Campo 'status', quando enviado, deve ser um de: ${STATUS_VALIDOS.join(", ")}`
        });
    }

    next();
}

module.exports = validatePlataformaTenantEdit;
