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
 */
async function empresaAtivaExiste(db, empresaId) {
    const resultado = await db.query(
        "SELECT id FROM empresas WHERE id = $1 AND ativo = true",
        [empresaId]
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

module.exports = { empresaAtivaExiste, normalizarSlug };
