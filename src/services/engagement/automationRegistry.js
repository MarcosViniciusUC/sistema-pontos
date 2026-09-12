/**
 * Estrutura de AUTOMAÇÃO — Bloco 3.
 *
 * Isto é a FORMA (shape) de uma automação, não uma decisão de produto. As
 * duas entradas abaixo são EXEMPLOS DE FORMATO — cada uma com `ativa:
 * false` e nenhum limite/frequência comercial definido (`limitePorPeriodo`/
 * `periodoLimiteHoras` ficam `null`, nunca um número inventado). Nenhuma
 * automação real deve rodar a partir deste arquivo até o negócio revisar e
 * decidir os valores; até lá, `listarAtivas()` sempre devolve uma lista
 * vazia, então o motor (engine.js) nunca dispara nada de verdade nesta
 * etapa mesmo se chamado.
 *
 * Guardado em memória por enquanto (reinicia com o processo, de propósito)
 * — ver a proposta de tabela `automacoes` no relatório final para quando
 * isto precisar ser editável pelo admin sem reiniciar o servidor.
 *
 * Forma de uma automação:
 *   - nome: identificador legível (não usado ainda para nada além de log).
 *   - evento: uma das chaves de eventCatalog.js (EVENTOS).
 *   - canal: "whatsapp" | "email" | outro que um provider futuro suportar
 *     (ver notificationService.js) — nunca decidido aqui qual é o padrão.
 *   - template: texto com variáveis {chave} — ver templates.js. As
 *     variáveis usadas DEVEM existir em EVENTOS[evento].variaveis (validado
 *     por validarAutomacao() abaixo).
 *   - ativa: boolean — false até o negócio aprovar.
 *   - condicoes: objeto livre para regras extras futuras (ex: "só clientes
 *     de uma empresa específica") — não interpretado por nada ainda.
 *   - limitePorPeriodo / periodoLimiteHoras: um limite ADICIONAL, por
 *     automação específica, que poderia empilhar sobre a regra GLOBAL de
 *     7 dias (ver notificationHistory.js:LIMITE_GLOBAL_DIAS — essa sim já
 *     em vigor). `null` = sem limite extra definido ainda; não decidido
 *     nesta etapa, e não é preciso decidir: o limite global já garante que
 *     nenhum usuário recebe mais de 1 mensagem a cada 7 dias, não importa
 *     a automação.
 *   - prioridade: número usado só para DESEMPATAR quando mais de uma
 *     automação está elegível para o mesmo usuário ao mesmo tempo — maior
 *     número vence (ver escolherMaiorPrioridade abaixo). `null`/`undefined`
 *     é tratado como a prioridade mais baixa possível. Os valores 10/5 nos
 *     exemplos abaixo são só para PROVAR que o mecanismo de desempate
 *     funciona — não são uma hierarquia de negócio decidida.
 */
const { EVENTOS } = require("./eventCatalog");
const { listarVariaveisUsadas } = require("./templates");

const AUTOMACOES_EXEMPLO = Object.freeze([
    {
        nome: "exemplo-recompensa-quase-desbloqueada",
        evento: "RECOMPENSA_QUASE_DESBLOQUEADA",
        canal: "whatsapp",
        template: "Olá, {nome}! Faltam {pontos_faltantes} pontos para você resgatar {recompensa}.",
        ativa: false,
        condicoes: {},
        limitePorPeriodo: null,
        periodoLimiteHoras: null,
        prioridade: 5
    },
    {
        nome: "exemplo-resgate-proximo-de-expirar",
        evento: "RESGATE_PROXIMO_DE_EXPIRAR",
        canal: "whatsapp",
        template: "Olá, {nome}! Seu código de resgate para {recompensa} expira em {horas_restantes}h.",
        ativa: false,
        condicoes: {},
        limitePorPeriodo: null,
        periodoLimiteHoras: null,
        prioridade: 10
    }
]);

/**
 * Escolhe UMA automação entre as elegíveis — maior `prioridade` vence;
 * `null`/`undefined` conta como a menor prioridade possível. Empate real
 * (mesma prioridade, ou nenhuma automação tem prioridade definida) é
 * resolvido pela ordem em que apareceram na lista recebida — determinístico,
 * mas não é uma hierarquia de negócio, só evita que o resultado varie à toa
 * entre chamadas. Retorna `null` se a lista vier vazia.
 */
function escolherMaiorPrioridade(automacoesElegiveis) {
    if (automacoesElegiveis.length === 0) {
        return null;
    }

    return automacoesElegiveis.reduce(function (melhor, atual) {
        const prioridadeMelhor = typeof melhor.prioridade === "number" ? melhor.prioridade : -Infinity;
        const prioridadeAtual = typeof atual.prioridade === "number" ? atual.prioridade : -Infinity;
        return prioridadeAtual > prioridadeMelhor ? atual : melhor;
    });
}

/**
 * Confere que o `evento` existe no catálogo e que todas as variáveis do
 * `template` são fornecidas por aquele evento — pega erro de digitação ou
 * uma automação pedindo uma variável que o evento não tem antes dela ser
 * ativada, não depois.
 */
function validarAutomacao(automacao) {
    const erros = [];
    const definicaoEvento = EVENTOS[automacao.evento];

    if (!definicaoEvento) {
        erros.push(`Evento desconhecido: '${automacao.evento}'`);
        return erros;
    }

    const variaveisUsadas = listarVariaveisUsadas(automacao.template);
    const variaveisPermitidas = new Set(definicaoEvento.variaveis || []);

    variaveisUsadas.forEach(function (variavel) {
        if (!variaveisPermitidas.has(variavel)) {
            erros.push(`Template usa '{${variavel}}', mas o evento '${automacao.evento}' não fornece essa variável.`);
        }
    });

    return erros;
}

// Só automações com `ativa: true` — hoje sempre vazio, de propósito (ver
// comentário no topo do arquivo).
function listarAtivas() {
    return AUTOMACOES_EXEMPLO.filter(function (a) { return a.ativa; });
}

function listarTodas() {
    return AUTOMACOES_EXEMPLO;
}

module.exports = { listarAtivas, listarTodas, validarAutomacao, escolherMaiorPrioridade };
