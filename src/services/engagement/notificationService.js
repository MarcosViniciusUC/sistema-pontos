/**
 * NotificationService — despacha para o provider do canal certo. Isolado de
 * propósito: nem eventDetector.js, nem automationRegistry.js, nem
 * engine.js sabem o que é "WhatsApp" ou "Email" — só conhecem a palavra do
 * `canal`. Adicionar um provider novo é só criar o arquivo em providers/
 * (mesma interface: `{ canal, enviar(destinatario, mensagem) }`) e
 * registrar aqui.
 *
 * Desde a etapa 2 do Bloco 3, este arquivo NÃO grava histórico — só executa
 * o envio bruto e devolve o resultado. Quem grava (dentro do lock que
 * protege a regra de 7 dias) é
 * notificationHistory.js:tentarEnviarComLimiteGlobal, que recebe esta
 * função como callback. Separar assim é o que permite conectar um provider
 * real no futuro sem tocar em nada da regra de frequência.
 *
 * NENHUMA automação real chama isto nesta etapa — engine.js:simular() nunca
 * invoca nada daqui; só engine.js:processarAutomacoes() chamaria, e mesmo
 * essa função não roda sozinha (não há cron/scheduler ligado a ela ainda).
 */
const whatsappProvider = require("./providers/whatsappProvider");
const emailProvider = require("./providers/emailProvider");

const PROVIDERS_POR_CANAL = {
    whatsapp: whatsappProvider,
    email: emailProvider
};

/**
 * Executa o envio de verdade e devolve `{ sucesso, identificadorExterno, erro }`
 * — nunca lança exceção por canal desconhecido ou falha do provider (isso
 * viraria um `status='falhou'` gravado pelo chamador, não um erro solto).
 */
async function enviarBruto(canal, destinatario, mensagem) {
    const provider = PROVIDERS_POR_CANAL[canal];

    if (!provider) {
        return { sucesso: false, identificadorExterno: null, erro: `Canal desconhecido: '${canal}'` };
    }

    return provider.enviar(destinatario, mensagem);
}

module.exports = { enviarBruto };
