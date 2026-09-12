/**
 * Scheduler do Motor de Engajamento — MODO SIMULAÇÃO (única etapa
 * implementada até aqui). Roda periodicamente, busca clientes (nunca
 * admin/funcionário), avalia eventos/automações elegíveis para cada um, e
 * só SIMULA — nunca chama `notificationHistory.tentarEnviarComLimiteGlobal`
 * nem `notificationService` (ver engine.js:avaliarParaSimulacaoDeLote, a
 * única função que este arquivo usa para avaliar um cliente — ela é
 * fisicamente incapaz de disparar um envio real).
 *
 * DESLIGADO POR PADRÃO — ver schedulerConfig.js. `server.js` chama
 * `iniciar()` sempre, mas `iniciar()` só de fato agenda algo se
 * `ENGAGEMENT_SCHEDULER_ENABLED=true` estiver no ambiente.
 *
 * SOBREPOSIÇÃO: uma flag em memória (`emExecucao`) impede uma segunda
 * rodada de começar enquanto a anterior não terminou — a rodada nova é
 * simplesmente pulada (log claro), nunca enfileirada. Isso é suficiente
 * porque só existe UM processo rodando o scheduler nesta etapa (não há
 * ainda múltiplas instâncias do Render coordenando entre si — se isso vier
 * a existir, a proteção certa seria um advisory lock do Postgres, mesmo
 * mecanismo já usado em notificationHistory.js, só que travando por um
 * identificador fixo do scheduler em vez de por usuário).
 *
 * LOGS: nunca imprimem nome, email ou o texto da mensagem renderizada
 * (que contém o nome do cliente) — só o `id` numérico nas linhas de
 * progresso. O detalhe completo (nome, mensagem simulada) só existe no
 * valor de RETORNO desta função, que só chega a alguém autenticado como
 * admin (ver engagement.controller.js/engagement.routes.js).
 */
const collectors = require("./collectors");
const engine = require("./engine");
const { HORAS_PARA_EXPIRAR } = require("../resgateExpiracao.service");
const config = require("./schedulerConfig");

let emExecucao = false;
let intervaloAtivo = null;

function log(mensagem) {
    console.log(`[SCHEDULER] ${mensagem}`);
}

/**
 * Uma rodada completa: busca clientes -> coleta contexto em lote -> avalia
 * cada um em modo simulação -> retorna o resumo. Nunca lança para fora
 * (erros de um cliente específico não deveriam existir, já que
 * avaliarParaSimulacaoDeLote não lança, mas um erro de infraestrutura —
 * ex: banco fora do ar — é logado e devolvido em `erro`, nunca derruba o
 * processo).
 */
async function executarRodada(opcoes) {
    if (emExecucao) {
        log("execução anterior ainda em andamento — pulando esta rodada para evitar sobreposição");
        return { pulou: true, erro: null, resultados: [] };
    }

    emExecucao = true;
    log("início");

    try {
        const clientes = await collectors.coletarClientesElegiveis();
        log(`clientes encontrados: ${clientes.length}`);

        if (clientes.length === 0) {
            log("fim");
            return { pulou: false, erro: null, resultados: [] };
        }

        const usuarioIds = clientes.map(function (c) { return c.id; });
        const contextoPorUsuario = await collectors.coletarContextoEmLote(usuarioIds, HORAS_PARA_EXPIRAR);

        const resultados = [];

        for (const cliente of clientes) {
            log(`processando usuário #${cliente.id}`);

            const contexto = contextoPorUsuario.get(cliente.id);
            const resultado = await engine.avaliarParaSimulacaoDeLote(cliente, contexto, opcoes);

            if (resultado.status === "SIMULADO") {
                log(`automação selecionada para #${cliente.id}: ${resultado.automacao} (prioridade ${resultado.prioridade}) — SIMULADO`);
            } else if (resultado.status === "BLOQUEADO_LIMITE") {
                log(`#${cliente.id}: ${resultado.automacao} seria elegível, mas BLOQUEADO pelo limite global de 7 dias`);
            } else {
                log(`#${cliente.id}: nenhuma automação elegível`);
            }

            resultados.push(resultado);
        }

        log("simulação concluída");
        log("fim");

        return { pulou: false, erro: null, resultados };

    } catch (erro) {
        log(`ERRO na rodada: ${erro.message}`);
        return { pulou: false, erro: erro.message, resultados: [] };

    } finally {
        emExecucao = false;
    }
}

/**
 * Liga o scheduler periódico — só tem efeito se
 * ENGAGEMENT_SCHEDULER_ENABLED=true (ver schedulerConfig.js). Idempotente:
 * chamar duas vezes não cria dois intervalos, mesmo padrão de
 * resgateExpiracao.service.js:iniciarLimpezaPeriodica.
 */
function iniciar() {
    if (!config.ENABLED) {
        log("desabilitado (ENGAGEMENT_SCHEDULER_ENABLED != 'true') — nada foi agendado");
        return null;
    }

    if (intervaloAtivo) {
        return intervaloAtivo;
    }

    log(`habilitado — rodando a cada ${config.INTERVAL_MS}ms (valor técnico de desenvolvimento; frequência comercial ainda não decidida)`);

    executarRodada().catch(function (erro) {
        log(`erro na rodada inicial: ${erro.message}`);
    });

    intervaloAtivo = setInterval(function () {
        executarRodada().catch(function (erro) {
            log(`erro na rodada periódica: ${erro.message}`);
        });
    }, config.INTERVAL_MS);

    // unref(): o timer sozinho nunca impede o processo de encerrar (ex:
    // scripts/testes que sobem o server e depois saem) — mesmo princípio já
    // usado em resgateExpiracao.service.js.
    intervaloAtivo.unref();

    return intervaloAtivo;
}

function parar() {
    if (intervaloAtivo) {
        clearInterval(intervaloAtivo);
        intervaloAtivo = null;
        log("parado");
    }
}

/**
 * Execução sob demanda (requisito de observabilidade) — mesma função
 * `executarRodada`, mesma proteção contra sobreposição (se uma rodada
 * automática já estiver rodando, esta também é pulada, nunca as duas ao
 * mesmo tempo). Usada por POST /admin/engajamento/scheduler/executar.
 */
async function executarManualmente(opcoes) {
    log("execução manual solicitada");
    return executarRodada(opcoes);
}

function estaEmExecucao() {
    return emExecucao;
}

function estaAgendado() {
    return intervaloAtivo !== null;
}

module.exports = { iniciar, parar, executarManualmente, estaEmExecucao, estaAgendado };
