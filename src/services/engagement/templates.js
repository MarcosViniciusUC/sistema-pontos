/**
 * Motor de templates — substitui `{variavel}` por valores reais de um
 * dicionário de contexto. Puramente texto: nunca executa nada do conteúdo
 * do template (sem `eval`, sem interpolação de código), então um template
 * cadastrado errado no máximo aparece com o texto errado, nunca é um risco
 * de segurança.
 *
 * Variáveis não reconhecidas (erro de digitação no template, ou uma
 * variável que este evento não fornece) ficam visíveis como
 * `{variavel:desconhecida}` em vez de sumir silenciosamente ou virar uma
 * string vazia — mais fácil de notar o erro ao revisar/simular uma
 * automação antes de ativá-la.
 */
const REGEX_VARIAVEL = /\{(\w+)\}/g;

function renderizarTemplate(template, contexto) {
    return template.replace(REGEX_VARIAVEL, function (correspondenciaCompleta, nomeVariavel) {
        if (!Object.prototype.hasOwnProperty.call(contexto, nomeVariavel) || contexto[nomeVariavel] === null || contexto[nomeVariavel] === undefined) {
            return `{${nomeVariavel}:desconhecida}`;
        }

        return String(contexto[nomeVariavel]);
    });
}

// Lista as variáveis {assim} usadas num template, sem renderizar — útil
// pra validar uma automação nova contra as variáveis que o evento dela
// realmente fornece (ver eventCatalog.js) antes de ativá-la.
function listarVariaveisUsadas(template) {
    const encontradas = new Set();
    let correspondencia;

    while ((correspondencia = REGEX_VARIAVEL.exec(template)) !== null) {
        encontradas.add(correspondencia[1]);
    }

    return Array.from(encontradas);
}

module.exports = { renderizarTemplate, listarVariaveisUsadas };
