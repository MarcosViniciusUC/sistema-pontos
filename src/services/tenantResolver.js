/**
 * Resolução de tenant — ETAPA 3A da fundação multi-tenant.
 *
 * Responsabilidade ÚNICA: dado um `req`, descobrir a qual tenant esta
 * requisição pertence, sempre validando contra o banco real — nunca
 * confiando no valor recebido além de usá-lo como filtro de busca. O
 * retorno reflete sempre a linha REAL da tabela `tenants`, nunca o texto
 * de entrada.
 *
 * SEGURANÇA — isto NUNCA concede autorização, só identifica contexto.
 * Quem autoriza continua sendo authMiddleware/roleMiddleware (e,
 * futuramente, o `tenant_id` já validado dentro do JWT). Um slug
 * arbitrário nunca "vira" um tenant válido por si só — se não bate com
 * nenhuma linha em `tenants`, o resultado é sempre NAO_ENCONTRADO,
 * mesmo que o texto pareça plausível.
 *
 * ESTRATÉGIA DESTA ETAPA (mínima complexidade — ver plano de migração
 * SaaS): o tenant é identificado por um "tenantSlug" explícito, vindo do
 * header `X-Tenant-Slug` ou do query param `?tenantSlug=` — SEM nenhuma
 * dependência de subdomínio ainda. Ausência de slug usa o fallback
 * 'movement' (único tenant real hoje), centralizado bem aqui — nenhum
 * controller precisa saber disso.
 *
 * COMO EVOLUIR PARA SUBDOMÍNIO DEPOIS: trocar só `obterSlugDaRequisicao`
 * para ler `req.hostname` em vez de header/query. Nenhum outro código
 * muda, porque tudo consome só o resultado já resolvido
 * (`req.tenantId`/`req.tenant`, ver resolverTenantMiddleware.js) — nunca
 * a forma como o slug chegou até aqui.
 *
 * Esta etapa NÃO altera nenhuma query de negócio existente — nenhum
 * controller atual chama isto ainda.
 */
const pool = require("../config/database");

const SLUG_FALLBACK = "movement";

/**
 * Extrai o slug explícito da requisição, se houver. Header tem
 * prioridade sobre query param (header é a forma mais comum de metadado
 * de contexto em APIs REST; query fica como forma alternativa/conveniente
 * para testes manuais). Nunca lê de `req.body` — o corpo da requisição é
 * dos controllers de negócio, não desta camada.
 */
function obterSlugDaRequisicao(req) {
    const doHeader = req.headers && req.headers["x-tenant-slug"];

    if (typeof doHeader === "string" && doHeader.trim().length > 0) {
        return doHeader.trim();
    }

    const doQuery = req.query && req.query.tenantSlug;

    if (typeof doQuery === "string" && doQuery.trim().length > 0) {
        return doQuery.trim();
    }

    return null;
}

/**
 * Resolve o tenant da requisição contra o banco real.
 *
 * Retorna sempre um dos dois formatos:
 *   { tenant: { id, nome, slug, status } }  — encontrado (qualquer status;
 *                                              esta função NÃO julga se o
 *                                              tenant está ativo — ver
 *                                              exigirTenantAtivoMiddleware.js,
 *                                              responsabilidade separada
 *                                              de propósito)
 *   { erro: "NAO_ENCONTRADO" }              — nenhum tenant com esse slug
 *
 * Nunca lança para um slug inválido — devolve o resultado estruturado
 * acima; quem decide a resposta HTTP é o middleware, não esta função (ela
 * é reutilizável fora de um contexto Express também, se precisar).
 */
async function resolverTenant(req) {
    const slugSolicitado = obterSlugDaRequisicao(req);
    const slugParaBuscar = slugSolicitado || SLUG_FALLBACK;

    const resultado = await pool.query(
        "SELECT id, nome, slug, status FROM tenants WHERE slug = $1",
        [slugParaBuscar]
    );

    if (resultado.rows.length === 0) {
        return { erro: "NAO_ENCONTRADO" };
    }

    return { tenant: resultado.rows[0] };
}

/**
 * Busca um tenant pelo `id` — usado pela ETAPA 3B por authMiddleware.js
 * para revalidar, a cada requisição autenticada, que o `tenant_id` já
 * confiado dentro de um JWT assinado ainda corresponde a um tenant real e
 * ativo (o JWT prova só que fomos nós que assinamos aquele tenant_id no
 * momento do login, nunca que ele continua válido AGORA — um tenant pode
 * ser desativado depois de tokens já emitidos, que continuam válidos por
 * até 1h por causa do expiresIn).
 *
 * Diferente de resolverTenant() (que busca por slug, vindo de fora, nunca
 * confiável sozinho): aqui o `tenantId` já veio de dentro de um JWT
 * validado — ele só precisa ser confirmado contra o banco, não
 * "descoberto". Retorna `null` se o id não existir (nunca lança).
 */
async function buscarTenantPorId(tenantId) {
    const resultado = await pool.query(
        "SELECT id, nome, slug, status FROM tenants WHERE id = $1",
        [tenantId]
    );

    return resultado.rows[0] || null;
}

module.exports = { resolverTenant, buscarTenantPorId, obterSlugDaRequisicao, SLUG_FALLBACK };
