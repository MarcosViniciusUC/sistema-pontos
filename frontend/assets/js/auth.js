/**
 * Gerenciamento de sessão do usuário (token JWT).
 *
 * IMPORTANTE: nada aqui substitui a segurança da API. O backend
 * (authMiddleware / roleMiddleware) já valida token e permissão em toda
 * rota protegida — este arquivo só existe para melhorar a experiência
 * no frontend (evitar mostrar telas para quem não está logado, saber
 * que tipo de menu exibir, etc).
 */

const TOKEN_KEY = "movement_token";
const TIPO_KEY = "movement_tipo";
const EMAIL_KEY = "movement_email";

function salvarSessao(token, tipo) {
    localStorage.setItem(TOKEN_KEY, token);

    if (tipo) {
        localStorage.setItem(TIPO_KEY, tipo);
    }
}

/**
 * Guarda um email real (vindo de GET /usuarios/me, chamado por app.js logo
 * após o login) apenas para exibição (ex: "Olá, ..."). Nunca o valor
 * digitado no campo de login — desde que o login passou a ser por CPF, esse
 * valor pode ser um CPF (dado pessoal) ou um identificador legado, nenhum
 * dos dois apropriado para aparecer solto na tela.
 */
function salvarEmail(email) {
    if (email) {
        localStorage.setItem(EMAIL_KEY, email);
    }
}

function obterEmail() {
    return localStorage.getItem(EMAIL_KEY);
}

function obterToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function obterTipoUsuario() {
    return localStorage.getItem(TIPO_KEY);
}

function removerSessao() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TIPO_KEY);
    localStorage.removeItem(EMAIL_KEY);
}

function possuiSessao() {
    return Boolean(obterToken());
}

/**
 * Lê o payload do JWT (id, tipo, exp...) sem validar a assinatura —
 * isso é responsabilidade exclusiva do backend. Serve só para decidir
 * o que mostrar na tela.
 */
function decodificarToken(token) {
    try {
        const payloadBase64 = token.split(".")[1];
        const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(payloadJson);
    } catch (erro) {
        return null;
    }
}

function tokenExpirado(token) {
    const payload = decodificarToken(token);

    if (!payload || !payload.exp) {
        return true;
    }

    const agoraEmSegundos = Date.now() / 1000;
    return payload.exp < agoraEmSegundos;
}

function logout() {
    removerSessao();
    window.location.href = "index.html";
}

window.Auth = {
    salvarSessao,
    salvarEmail,
    obterEmail,
    obterToken,
    obterTipoUsuario,
    removerSessao,
    possuiSessao,
    decodificarToken,
    tokenExpirado,
    logout
};
