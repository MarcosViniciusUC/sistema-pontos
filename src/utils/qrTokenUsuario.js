const crypto = require("crypto");

// 32 bytes (256 bits) de entropia, em hexadecimal (64 caracteres). Nunca é
// digitado à mão — só vira conteúdo de QR Code e parâmetro de URL — então,
// ao contrário do código de resgate, não precisa de um alfabeto restrito
// nem de tamanho curto.
const TAMANHO_EM_BYTES = 32;

/**
 * Gera o identificador do QR Code individual do cliente. Puramente
 * aleatório (crypto.randomBytes, não Math.random) e sem qualquer relação
 * com o id sequencial do usuário ou outro dado pessoal — não dá para
 * adivinhar o token de um cliente a partir do de outro.
 */
function gerarQrTokenUsuario() {
    return crypto.randomBytes(TAMANHO_EM_BYTES).toString("hex");
}

module.exports = { gerarQrTokenUsuario };
