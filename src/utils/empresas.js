/**
 * Regras compartilhadas sobre a tabela `empresas`, usadas por qualquer
 * controller que precise validar uma empresa antes de gravar algo que
 * referencia ela (pontos, recompensas). Existir centralizado aqui evita a
 * mesma checagem duplicada divergir com o tempo entre os controllers.
 */

/**
 * `db` é quem executa a query — pode ser o pool direto (fora de transação)
 * ou um client já dentro de uma transação (ex: pontos.controller.js:entrada,
 * que precisa ver o estado dentro da própria transação). Por isso não tem
 * um default silencioso: cada chamador decide explicitamente qual usar.
 *
 * ATENÇÃO (ETAPA 3C-2) — esta checagem NÃO valida `tenant_id`, de
 * propósito: os domínios que a chamam hoje (pontos, recompensas) ainda não
 * foram isolados por tenant (etapas futuras separadas), e mudar a
 * assinatura aqui exigiria também alterar esses controllers, fora do
 * escopo desta etapa. Ou seja: `empresa_id` identifica UMA empresa, mas
 * **não substitui** `tenant_id` — um `empresa_id` de outro tenant passa
 * despercebido por esta função até que pontos/recompensas recebam sua
 * própria etapa de isolamento (quando esta função deve passar a receber e
 * checar `tenant_id` também).
 */
async function empresaAtivaExiste(db, empresaId) {
    const resultado = await db.query(
        "SELECT id FROM empresas WHERE id = $1 AND ativo = true",
        [empresaId]
    );

    return resultado.rows.length > 0;
}

/**
 * ETAPA 3C-3 — versão tenant-aware de empresaAtivaExiste(), criada como
 * função NOVA (em vez de alterar a assinatura da existente) de propósito:
 * mudar empresaAtivaExiste() afetaria também points.controller.js, cujo
 * domínio ainda não foi isolado por tenant (etapa futura separada) —
 * alterá-la agora deixaria esse chamador quebrado ou com um comportamento
 * parcialmente adaptado, exatamente o que se quer evitar. Usada só por
 * reward.controller.js a partir desta etapa: além de existir e estar
 * ativa, a empresa precisa pertencer ao MESMO tenant do usuário
 * autenticado — um `empresa_id` de outro tenant (mesmo que exista e esteja
 * ativo) é tratado como inválido, nunca aceito.
 */
async function empresaAtivaNoTenant(db, empresaId, tenantId) {
    const resultado = await db.query(
        "SELECT id FROM empresas WHERE id = $1 AND ativo = true AND tenant_id = $2",
        [empresaId, tenantId]
    );

    return resultado.rows.length > 0;
}

/**
 * Normaliza um slug pro formato usado como identificador estável (nunca
 * exibido como o "nome" da empresa): minúsculo, sem acento, só
 * letras/números separados por hífen simples, sem hífen nas pontas.
 * "Barbearia Top!" -> "barbearia-top". Pode resultar em string vazia se o
 * valor de entrada não tiver nenhum caractere alfanumérico — quem chama
 * precisa validar isso antes de gravar.
 */
// Faixa Unicode das marcas diacríticas combinantes (acentos separados pelo
// NFD abaixo) — montada a partir dos code points (0x0300-0x036F) em vez de
// caracteres literais, pra não depender de bytes não-ASCII neste arquivo.
const INICIO_MARCAS_DIACRITICAS = 0x0300;
const FIM_MARCAS_DIACRITICAS = 0x036f;
const REGEX_MARCAS_DIACRITICAS = new RegExp(
    "[" + String.fromCharCode(INICIO_MARCAS_DIACRITICAS) + "-" + String.fromCharCode(FIM_MARCAS_DIACRITICAS) + "]",
    "g"
);

function normalizarSlug(slug) {
    return slug
        .normalize("NFD")
        .replace(REGEX_MARCAS_DIACRITICAS, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

module.exports = { empresaAtivaExiste, empresaAtivaNoTenant, normalizarSlug };
