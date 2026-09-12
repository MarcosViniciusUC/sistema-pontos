/**
 * Provider de Email — STUB. Mesmo princípio de whatsappProvider.js: nenhuma
 * chamada de rede, nenhuma credencial. Prova que notificationService.js
 * consegue trocar de canal sem nenhuma mudança na lógica de detecção de
 * evento nem de template.
 */
async function enviar(destinatario, mensagem) {
    return {
        sucesso: false,
        identificadorExterno: null,
        erro: "Provider de Email não configurado — nenhum envio real acontece nesta etapa."
    };
}

module.exports = { canal: "email", enviar };
