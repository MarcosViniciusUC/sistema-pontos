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
 *
 * ETAPA 3C-7 — o cliente é buscado PRIMEIRO (não mais em paralelo com o
 * resto): é dele que vem `tenant_id`, e `coletarRecompensasAtivas` agora
 * exige esse tenant explicitamente (nunca busca recompensas sem saber de
 * qual tenant) — ver collectors.js. Se o cliente não existir, retorna cedo
 * sem tentar coletar mais nada (mesmo formato de retorno de antes, com os
 * demais campos zerados).
 */
async function coletarContexto(usuarioId) {
    const cliente = await collectors.coletarDadosCliente(usuarioId);

    if (!cliente) {
        return { cliente: null, saldo: 0, recompensasAtivas: [], resgatesPendentes: [] };
    }

    const [saldo, recompensasAtivas, resgatesPendentes] = await Promise.all([
        collectors.coletarSaldo(usuarioId),
        collectors.coletarRecompensasAtivas(usuarioId, cliente.tenant_id),
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
 *
 * ETAPA 3C-7 — `tenantIdEsperado` é obrigatório e vem sempre de
 * `req.usuario.tenant_id` (ver engagement.controller.js), nunca de
 * body/query/params. `usuario_id` É lido do body por este endpoint (admin
 * simulando PARA um cliente — ver comentário em engagement.controller.js),
 * o que antes desta etapa permitia a um admin de um tenant simular
 * engajamento (e ver nome/saldo/recompensas) de um cliente de OUTRO
 * tenant. Agora, se o cliente encontrado não pertence a `tenantIdEsperado`,
 * a resposta é a MESMA "Usuário não encontrado" de um id inexistente —
 * nunca revela que aquele id pertence a outro tenant.
 */
async function simular(usuarioId, tenantIdEsperado, opcoes) {
    const contexto = await coletarContexto(usuarioId);

    if (!contexto.cliente || contexto.cliente.tenant_id !== tenantIdEsperado) {
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
 *
 * ETAPA 3C-7 — mesmo padrão de simular(): `tenantIdEsperado` obrigatório,
 * validado contra `contexto.cliente.tenant_id` antes de prosseguir (mesma
 * resposta genérica em caso de divergência). `tenantId` do cliente também é
 * repassado a `notificationHistory.tentarEnviarComLimiteGlobal` abaixo,
 * para o registro em `notificacoes_historico` gravar o tenant real do
 * cliente processado, nunca o DEFAULT temporário.
 */
async function processarAutomacoes(usuarioId, tenantIdEsperado, opcoes) {
    const contexto = await coletarContexto(usuarioId);

    if (!contexto.cliente || contexto.cliente.tenant_id !== tenantIdEsperado) {
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
        tenantId: contexto.cliente.tenant_id,
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

/**
 * SIMULAÇÃO EM LOTE (scheduler.js) — separada de propósito de
 * `processarAutomacoes()` acima: esta função NUNCA chama
 * `notificationHistory.tentarEnviarComLimiteGlobal` (que grava e, se
 * permitido, chamaria o provider de verdade) nem `notificationService`.
 * Só LÊ o limite global (`verificarBloqueioGlobal`, sem lock, sem gravar) —
 * é fisicamente impossível esta função disparar um envio real, mesmo que
 * uma automação esteja `ativa: true` (ver scheduler.js, que é quem chama
 * isto em toda rodada).
 *
 * Recebe `cliente` e `contexto` JÁ COLETADOS (ver
 * collectors.js:coletarContextoEmLote) — não faz nenhuma consulta própria,
 * para o scheduler poder processar N clientes com as mesmas 4 consultas em
 * lote, não 4×N.
 *
 * Retorna sempre um objeto com `status` em
 * 'SIMULADO' | 'BLOQUEADO_LIMITE' | 'SEM_AUTOMACAO_ELEGIVEL'.
 *
 * ETAPA 3C-7 — `tenantId: cliente.tenant_id` incluído em toda resposta:
 * `cliente` já vem com `tenant_id` (ver coletarClientesElegiveis()), então
 * cada resultado da rodada em lote (scheduler.js) fica auto-descritivo
 * sobre a qual tenant pertence — necessário para confirmar, numa execução
 * global com candidatos de vários tenants, que nenhum foi processado como
 * se fosse de outro.
 */
async function avaliarParaSimulacaoDeLote(cliente, contexto, opcoes) {
    const eventosDetectados = detectarEventos(contexto, opcoes);
    const tiposDetectados = new Set(eventosDetectados.map(function (e) { return e.tipo; }));

    const automacoesElegiveis = automationRegistry.listarAtivas()
        .filter(function (a) { return tiposDetectados.has(a.evento); });

    if (automacoesElegiveis.length === 0) {
        return {
            usuarioId: cliente.id,
            nome: cliente.nome,
            tenantId: cliente.tenant_id,
            status: "SEM_AUTOMACAO_ELEGIVEL",
            motivo: "Nenhuma automação ativa corresponde a um evento detectado para este cliente",
            evento: null,
            automacao: null,
            prioridade: null,
            mensagem: null
        };
    }

    const automacaoEscolhida = automationRegistry.escolherMaiorPrioridade(automacoesElegiveis);
    const eventoCorrespondente = eventosDetectados.find(function (e) { return e.tipo === automacaoEscolhida.evento; });
    const variaveis = montarContextoDeVariaveis(cliente, contexto.saldo, eventoCorrespondente.payload);
    const mensagem = renderizarTemplate(automacaoEscolhida.template, variaveis);

    // Só leitura — nunca grava, nunca usa o advisory lock (esse só existe
    // no caminho real de envio, dentro de tentarEnviarComLimiteGlobal).
    const statusLimiteGlobal = await notificationHistory.verificarBloqueioGlobal(cliente.id);

    if (statusLimiteGlobal.bloqueado) {
        return {
            usuarioId: cliente.id,
            nome: cliente.nome,
            tenantId: cliente.tenant_id,
            status: "BLOQUEADO_LIMITE",
            motivo: `Já recebeu uma mensagem em ${statusLimiteGlobal.ultimoEnvioEm.toISOString()} — dentro da janela de ${notificationHistory.LIMITE_GLOBAL_DIAS} dias`,
            evento: automacaoEscolhida.evento,
            automacao: automacaoEscolhida.nome,
            prioridade: typeof automacaoEscolhida.prioridade === "number" ? automacaoEscolhida.prioridade : null,
            mensagem: mensagem
        };
    }

    return {
        usuarioId: cliente.id,
        nome: cliente.nome,
        tenantId: cliente.tenant_id,
        status: "SIMULADO",
        motivo: "Permitido pelo limite global — em produção, isto seria enviado",
        evento: automacaoEscolhida.evento,
        automacao: automacaoEscolhida.nome,
        prioridade: typeof automacaoEscolhida.prioridade === "number" ? automacaoEscolhida.prioridade : null,
        mensagem: mensagem
    };
}

module.exports = {
    coletarContexto,
    detectarEventos,
    simular,
    processarAutomacoes,
    avaliarParaSimulacaoDeLote
};
