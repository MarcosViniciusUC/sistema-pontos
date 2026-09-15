/**
 * Token de recuperação de senha — mesmo princípio de qrTokenUsuario.js
 * (crypto.randomBytes, nunca Math.random): 256 bits de entropia,
 * hexadecimal. A diferença é que este token nunca é gravado no banco em
 * texto puro — só o hash (ver hashToken) é armazenado, exatamente como
 * nunca se guarda senha em texto puro. O token BRUTO só existe: (1) no
 * momento em que é gerado, (2) na URL do e-mail enviado ao usuário, e
 * (3) no request de POST /login/redefinir-senha — nunca em log, nunca no
 * banco.
 */
const crypto = require("crypto");

const TAMANHO_EM_BYTES = 32;

// Janela de validade do token — parâmetro de segurança (não comercial),
// mesmo espírito de HORAS_PARA_EXPIRAR em resgateExpiracao.service.js:
// hardcoded e documentado, não uma decisão de negócio a ser configurada
// externamente. 60 minutos está dentro da faixa sugerida (30-60min).
const MINUTOS_PARA_EXPIRAR = 60;

function gerarTokenBruto() {
    return crypto.randomBytes(TAMANHO_EM_BYTES).toString("hex");
}

// SHA-256, não bcrypt: o token já tem 256 bits de entropia própria (ao
// contrário de uma senha escolhida por humano), então não precisa do custo
// computacional propositalmente alto do bcrypt — precisa sim de um hash
// determinístico e rápido pra permitir buscar por `token_hash` no banco em
// O(1) (ver auth.controller.js:redefinirSenha).
function hashToken(tokenBruto) {
    return crypto.createHash("sha256").update(tokenBruto).digest("hex");
}

module.exports = { gerarTokenBruto, hashToken, MINUTOS_PARA_EXPIRAR };
