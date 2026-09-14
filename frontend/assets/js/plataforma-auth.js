/**
 * Sessão da PLATAFORMA (Maple Tech) — deliberadamente ISOLADA de auth.js
 * (sessão de tenant): chave própria no localStorage, funções próprias,
 * sem nenhuma referência a window.Auth. As duas sessões podem, inclusive,
 * existir ao mesmo tempo no mesmo navegador sem se misturar (ex: alguém
 * testando o login de um tenant numa aba e o painel da plataforma noutra).
 *
 * Mesmo princípio de segurança de auth.js: nada aqui substitui a validação
 * do backend (authPlataformaMiddleware, que revalida o token a cada
 * requisição) — isto só melhora a experiência (evitar mostrar telas para
 * quem não tem sessão de plataforma válida).
 */

const PLATAFORMA_TOKEN_KEY = "maple_plataforma_token";

function salvarSessao(token) {
    localStorage.setItem(PLATAFORMA_TOKEN_KEY, token);
}

function obterToken() {
    return localStorage.getItem(PLATAFORMA_TOKEN_KEY);
}

function removerSessao() {
    localStorage.removeItem(PLATAFORMA_TOKEN_KEY);
}

function possuiSessao() {
    return Boolean(obterToken());
}

// Mesma lógica de auth.js:decodificarToken — só lê o payload, nunca
// valida assinatura (isso é sempre do backend).
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
    window.location.href = "plataforma-login.html";
}

/**
 * Guarda de página — mesmo papel de UI.protegerPagina() (ui.js), mas para
 * a sessão de plataforma. Além de exigir token presente e não expirado,
 * confere que o payload decodificado tem `escopo === "plataforma"` — só
 * uma camada extra de UX (nunca é isto que impede um JWT de tenant de
 * acessar dado de verdade; quem faz isso é authPlataformaMiddleware no
 * backend, em toda chamada).
 */
function protegerPagina() {
    const token = obterToken();

    if (!token || tokenExpirado(token)) {
        removerSessao();
        window.location.href = "plataforma-login.html";
        return null;
    }

    const payload = decodificarToken(token);

    if (!payload || payload.escopo !== "plataforma") {
        removerSessao();
        window.location.href = "plataforma-login.html";
        return null;
    }

    return token;
}

// Liga o botão de logout de uma página de plataforma — equivalente
// isolado de UI.configurarSaudacaoELogout (ui.js), que é tenant-only
// (lê window.Auth.obterEmail()/logout()). Aqui não há saudação por email
// (admin de plataforma não tem esse dado exibido nesta etapa), só o botão.
function configurarLogout(logoutBtnId) {
    const logoutBtn = document.getElementById(logoutBtnId);

    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            logout();
        });
    }
}

window.PlataformaAuth = {
    salvarSessao,
    obterToken,
    removerSessao,
    possuiSessao,
    decodificarToken,
    tokenExpirado,
    logout,
    protegerPagina,
    configurarLogout
};
