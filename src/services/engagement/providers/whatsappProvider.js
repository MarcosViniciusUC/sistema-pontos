/**
 * Provider de WhatsApp — STUB. Nenhuma chamada de rede, nenhuma credencial,
 * nenhum SDK de terceiro. Existe só para provar a interface que
 * notificationService.js espera de qualquer provider.
 *
 * Para conectar um provedor real no futuro (Twilio, Meta Cloud API, Zenvia
 * etc.): trocar o corpo de `enviar()` por uma chamada HTTP real, com o
 * token do provedor lido de variável de ambiente (nunca hardcoded — ver
 * seção 7 do relatório final) e mantendo a mesma assinatura de retorno
 * (`{ sucesso, identificadorExterno, erro }`), pra não precisar mudar
 * notificationService.js nem nada que o chama.
 */
async function enviar(destinatario, mensagem) {
    return {
        sucesso: false,
        identificadorExterno: null,
        erro: "Provider de WhatsApp não configurado — nenhum envio real acontece nesta etapa."
    };
}

module.exports = { canal: "whatsapp", enviar };
