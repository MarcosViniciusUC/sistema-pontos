/**
 * Configuração do Scheduler do Motor de Engajamento — centralizada aqui de
 * propósito (ver pedido: "não espalhar números mágicos pelo código").
 *
 * ENGAGEMENT_SCHEDULER_ENABLED
 *   Allow-list (`=== "true"`), mesmo padrão já usado pelo projeto para
 *   `NODE_ENV === "development"` em src/routes/auth.routes.js — qualquer
 *   valor ausente ou diferente de "true" mantém o scheduler DESLIGADO por
 *   padrão, inclusive se o Render nunca definir essa variável. Nesta etapa,
 *   o default seguro é sempre desligado; ninguém deve precisar lembrar de
 *   desligar antes de um deploy.
 *
 * ENGAGEMENT_SCHEDULER_INTERVAL_MS
 *   Intervalo entre rodadas automáticas. O valor default abaixo (60000ms =
 *   1 minuto) é SÓ TÉCNICO, para dar para observar o scheduler rodando
 *   durante desenvolvimento/teste sem esperar muito — NÃO é uma decisão de
 *   frequência comercial (isso ainda não foi definido pelo negócio; ver
 *   eventCatalog.js sobre CLIENTE_INATIVO/RESUMO_PERIODICO, que têm o
 *   mesmo tipo de pendência). Configurável via variável de ambiente
 *   exatamente para poder mudar isso depois sem tocar em código.
 */
const ENABLED = process.env.ENGAGEMENT_SCHEDULER_ENABLED === "true";

const INTERVAL_MS_DEFAULT_DEV = 60 * 1000;
const INTERVAL_MS = Number(process.env.ENGAGEMENT_SCHEDULER_INTERVAL_MS) > 0
    ? Number(process.env.ENGAGEMENT_SCHEDULER_INTERVAL_MS)
    : INTERVAL_MS_DEFAULT_DEV;

module.exports = { ENABLED, INTERVAL_MS };
