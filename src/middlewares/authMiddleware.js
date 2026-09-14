const jwt = require("jsonwebtoken");
const { buscarTenantPorId } = require("../services/tenantResolver");
const requestContext = require("../config/requestContext");

/**
 * ETAPA 3B — authMiddleware agora exige e revalida `tenant_id`.
 *
 * Formato de token de TENANT esperado a partir desta etapa:
 *   { id: number, tipo: string, tenant_id: number }
 *
 * Token de PLATAFORMA (Maple Tech, futuro) usará um formato diferente
 * ({ id, escopo: "plataforma" }, sem tipo/tenant_id) e nunca deve passar
 * por este middleware — nenhuma rota atual monta authMiddleware para esse
 * público, então não há confusão possível hoje. Quando o painel Maple
 * Tech existir, ele terá seu próprio middleware de plataforma, nunca este.
 *
 * TOKENS ANTIGOS (assinados antes desta etapa, sem `tenant_id`): são
 * REJEITADOS explicitamente (401), nunca aceitos com um tenant assumido
 * por padrão. Estratégia escolhida porque:
 *   - o token já expira em 1h (`expiresIn` no login) — o pior caso é pedir
 *     para todo mundo logar de novo uma única vez, dentro da primeira hora
 *     depois deste deploy, nunca "para sempre";
 *   - assumir tenant_id=1 para um token antigo reintroduziria exatamente o
 *     problema que esta etapa resolve (inferir tenant em vez de validar
 *     contra o que foi realmente emitido no login);
 *   - por já expirar sozinho, não existe "flag temporária para remover
 *     depois" aqui — a exigência de `tenant_id` é definitiva a partir de
 *     agora, não uma fase de transição.
 *
 * Depois de validar o formato, o tenant do token é sempre revalidado
 * contra o banco (nunca só confiado por a assinatura bater) — um tenant
 * pode ter sido desativado depois do login, e um token assinado antes
 * disso continua com assinatura válida até expirar. Um SELECT por PK
 * (`tenants.id`) é barato o bastante para rodar em toda requisição
 * autenticada; pular essa checagem para "economizar uma query" deixaria
 * usuários de um tenant desativado autenticados por até 1h a mais.
 *
 * ETAPA 3C-13 (RLS) — depois de validar tudo acima, `next()` roda dentro
 * de `requestContext.runAsTenant(tenant.id, ...)`: toda query feita pelo
 * resto da cadeia desta requisição passa a informar `app.tenant_id` ao
 * Postgres automaticamente (ver src/config/database.js), sem o controller
 * precisar saber disso. O valor vem sempre de `tenant.id` (a linha REAL
 * confirmada no banco acima, nunca `decoded.tenant_id` cru do token) —
 * mesmo princípio de nunca ecoar um dado não revalidado. Nunca bypass
 * aqui: esta é sempre uma requisição de TENANT, nunca de plataforma (ver
 * authPlataformaMiddleware.js para o outro caso).
 */
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            mensagem: "Token não informado"
        });
    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
        return res.status(401).json({
            mensagem: "Token em formato inválido"
        });
    }

    const token = partes[1];

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (erro) {
        return res.status(401).json({
            mensagem: "Token inválido ou expirado"
        });
    }

    const formatoValido = typeof decoded.id === "number"
        && typeof decoded.tipo === "string"
        && typeof decoded.tenant_id === "number";

    if (!formatoValido) {
        return res.status(401).json({
            mensagem: "Sessão expirada. Faça login novamente."
        });
    }

    try {
        const tenant = await buscarTenantPorId(decoded.tenant_id);

        if (!tenant) {
            return res.status(401).json({
                mensagem: "Sessão expirada. Faça login novamente."
            });
        }

        if (tenant.status !== "ativo") {
            return res.status(403).json({
                mensagem: "Este tenant está inativo"
            });
        }

        req.usuario = decoded;
        req.tenantId = tenant.id;
        req.tenant = tenant;

        requestContext.runAsTenant(tenant.id, next);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao validar tenant"
        });
    }
}

module.exports = authMiddleware;
