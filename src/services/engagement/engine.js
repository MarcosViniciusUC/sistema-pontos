/**
 * Motor de Engajamento — orquestrador central (Bloco 3).
 *
 * Este é o ÚNICO lugar que combina coleta de dados + detecção de eventos +
 * templates — nenhum controller deve reimplementar nada disto (ver seção
 * 12 do relatório final: "lógica de automação espalhada em controllers
 * diferentes" era exatamente o que se queria evitar).
 *
 * SEGURANÇA: toda função pública aqui exige `usuarioId` explícito. Nada
 * neste arquivo lê `req.body`/`req.query` — quem faz essa ponte (e decide
 * se quem está pedindo TEM PERMISSÃO de ver os dados daquele usuarioId) é
 * sempre o controller (ver engagement.controller.js). O motor em si nunca
 * dispara nada de verdade: `simular()` só monta texto, nunca chama
 * notificationService.enviar().
 */
const { HORAS_PARA_EXPIRAR } = require("../resgateExpiracao.service");
const collectors = require("./collectors");
const { detectarEventosDeRecompensa, detectarResgatesProximosDeExpirar } = require("./eventDetector");
const { renderizarTemplate } = require("./templates");
const automationRegistry = require("./automationRegistry");
const { EVENTOS } = require("./eventCatalog");
const notificationHistory = require("./notificationHistory");
const notificationService = require("./notificationService");

/**
 * Coleta tudo que os detectores precisam para UM cliente, numa só chamada
 * (4 consultas fixas — ver collectors.js para a nota de performance sobre
 * uso em lote).
 */
async function coletarContexto(usuarioId) {
    const [cliente, saldo, recompensasAtivas, resgatesPendentes] = await Promise.all([
        collectors.coletarDadosCliente(usuarioId),
        collectors.coletarSaldo(usuarioId),
        collectors.coletarRecompensasAtivas(usuarioId),
        collectors.coletarResgatesPendentes(usuarioId, HORAS_PARA_EXPIRAR)
    ]);

    return { cliente, saldo, recompensasAtivas, resgatesPendentes };
}

/**
 * Roda todos os detectores "suportados hoje" (ver eventCatalog.js) contra o
 * contexto de um cliente. `horasParaAvisarExpiracao` é opcional e explícito
 * — sem ele, RESGATE_PROXIMO_DE_EXPIRAR nunca é gerado (ver
 * eventDetector.js: o motor não inventa esse número).
 */
function detectarEventos(contexto, opcoes) {
    const eventos = [];

    eventos.push(...detectarEventosDeRecompensa(contexto.saldo, contexto.recompensasAtivas, false));
    eventos.push(...detectarEventosDeRecompensa(contexto.saldo, contexto.recompensasAtivas, true));

    if (opcoes && opcoes.horasParaAvisarExpiracao) {
        eventos.push(...detectarResgatesProximosDeExpirar(contexto.resgatesPendentes, opcoes.horasParaAvisarExpiracao));
    }

    return eventos;
}

function montarContextoDeVariaveis(cliente, saldo, payloadEvento) {
    return {
        nome: cliente ? cliente.nome : null,
        saldo: saldo,
        ...payloadEvento
    };
}

/**
 * SIMULAÇÃO (requisito 8) — para cada evento detectado, monta a mensagem
 * renderizada de toda automação cadastrada para aquele evento (ativa ou
 * não: simular serve justamente para revisar ANTES de ativar). Nunca envia
 * nada — nem chama notificationService, nem grava histórico de "enviado".
 *
 * Retorna também os eventos detectados sem nenhuma automação correspondente
 * ainda (útil para o admin ver "isto já poderia disparar, mas não existe
 * automação configurada para isto").
 */
async function simular(usuarioId, opcoes) {
    const contexto = await coletarContexto(usuarioId);

    if (!contexto.cliente) {
        return { erro: "Usuário não encontrado", eventos: [] };
    }

    const eventosDetectados = detectarEventos(contexto, opcoes);
    const todasAutomacoes = automationRegistry.listarTodas();

    // Só leitura (ver notificationHistory.js:verificarBloqueioGlobal) — nunca
    // grava nada. Mostra na simulação se o limite global de 7 dias JÁ
    // bloquearia um envio de verdade agora, sem que simular() precise
    // executar (nem passar perto de) o caminho real de envio.
    const statusLimiteGlobal = await notificationHistory.verificarBloqueioGlobal(usuarioId);

    const eventos = eventosDetectados.map(function (evento) {
        const variaveis = montarContextoDeVariaveis(contexto.cliente, contexto.saldo, evento.payload);
        const automacoesDoEvento = todasAutomacoes.filter(function (a) { return a.evento === evento.tipo; });

        const mensagensPossiveis = automacoesDoEvento.map(function (automacao) {
            const errosValidacao = automationRegistry.validarAutomacao(automacao);

            return {
                automacao: automacao.nome,
                canal: automacao.canal,
                ativa: automacao.ativa,
                prioridade: typeof automacao.prioridade === "number" ? automacao.prioridade : null,
                mensagem: renderizarTemplate(automacao.template, variaveis),
                errosValidacao: errosValidacao,
                seriaBloqueadaPorLimiteGlobal: statusLimiteGlobal.bloqueado
            };
        });

        return {
            tipo: evento.tipo,
            descricao: EVENTOS[evento.tipo] ? EVENTOS[evento.tipo].descricao : null,
            variaveisDisponiveis: variaveis,
            mensagensPossiveis: mensagensPossiveis
        };
    });

    return {
        erro: null,
        cliente: { id: contexto.cliente.id, nome: contexto.cliente.nome },
        limiteGlobal: statusLimiteGlobal,
        eventos
    };
}

/**
 * Fluxo real de disparo (ainda nunca chamado por nenhuma rota/cron nesta
 * etapa — só testado diretamente): coleta -> detecta -> filtra automações
 * ATIVAS elegíveis -> escolhe UMA pela prioridade -> tenta enviar sob o
 * limite global de 7 dias (checagem + gravação atômica, ver
 * notificationHistory.js). Hoje `automationRegistry.listarAtivas()` sempre
 * devolve vazio (nenhuma automação real está ativa), então esta função
 * sempre retorna `{ automacaoEscolhida: null, ... }` em uso normal — só
 * dispara de verdade se/quando uma automação for explicitamente ativada.
 *
 * `destinatarioPorCanal` deixa o chamador decidir qual dado do cliente vira
 * o "destinatário" (email, telefone, etc.) — este arquivo não assume isso
 * por conta própria, já que não há canal real configurado ainda.
 */
async function processarAutomacoes(usuarioId, opcoes) {
    const contexto = await coletarContexto(usuarioId);

    if (!contexto.cliente) {
        return { erro: "Usuário não encontrado", automacaoEscolhida: null, resultado: null };
    }

    const eventosDetectados = detectarEventos(contexto, opcoes);
    const tiposDetectados = new Set(eventosDetectados.map(function (e) { return e.tipo; }));

    const automacoesElegiveis = automationRegistry.listarAtivas()
        .filter(function (a) { return tiposDetectados.has(a.evento); });

    if (automacoesElegiveis.length === 0) {
        return { erro: null, automacaoEscolhida: null, resultado: null, motivo: "nenhuma automação ativa elegível" };
    }

    const automacaoEscolhida = automationRegistry.escolherMaiorPrioridade(automacoesElegiveis);
    const eventoCorrespondente = eventosDetectados.find(function (e) { return e.tipo === automacaoEscolhida.evento; });
    const variaveis = montarContextoDeVariaveis(contexto.cliente, contexto.saldo, eventoCorrespondente.payload);
    const mensagem = renderizarTemplate(automacaoEscolhida.template, variaveis);

    const destinatario = (opcoes && opcoes.resolverDestinatario)
        ? opcoes.resolverDestinatario(contexto.cliente, automacaoEscolhida.canal)
        : contexto.cliente.email;

    const registro = await notificationHistory.tentarEnviarComLimiteGlobal({
        usuarioId,
        evento: automacaoEscolhida.evento,
        automacaoNome: automacaoEscolhida.nome,
        canal: automacaoEscolhida.canal,
        mensagem,
        enviarFn: function () {
            return notificationService.enviarBruto(automacaoEscolhida.canal, destinatario, mensagem);
        }
    });

    return { erro: null, automacaoEscolhida: automacaoEscolhida.nome, resultado: registro };
}

module.exports = { coletarContexto, detectarEventos, simular, processarAutomacoes };
