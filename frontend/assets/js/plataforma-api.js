/**
 * Wrapper de chamadas à API — SOMENTE para as rotas /plataforma/*.
 * Deliberadamente separado de api.js (que usa window.Auth/token de
 * tenant): usa window.PlataformaAuth e nunca compartilha nada com a
 * sessão de tenant. Uso: plataformaApi("/plataforma/tenants").
 */
const PLATAFORMA_API_BASE_URL = window.location.origin;

class PlataformaApiError extends Error {
    constructor(message, status, dados) {
        super(message);
        this.name = "PlataformaApiError";
        this.status = status;
        this.dados = dados;
    }
}

async function plataformaApi(caminho, opcoes = {}) {
    const token = window.PlataformaAuth ? window.PlataformaAuth.obterToken() : null;

    const headers = {
        "Content-Type": "application/json",
        ...(opcoes.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let resposta;

    try {
        resposta = await fetch(`${PLATAFORMA_API_BASE_URL}${caminho}`, {
            method: opcoes.method || "GET",
            headers,
            body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
        });
    } catch (erroDeRede) {
        throw new PlataformaApiError("Não foi possível conectar ao servidor. Verifique sua conexão.", 0, null);
    }

    let dados = null;
    try {
        dados = await resposta.json();
    } catch (erroDeParse) {
        dados = null;
    }

    // authPlataformaMiddleware responde 401 (token ausente/inválido/expirado)
    // ou 403 (token válido, mas não é de plataforma — ver o próprio
    // middleware) — os dois casos significam a mesma coisa aqui: esta
    // sessão de plataforma não é mais válida para continuar navegando.
    if ((resposta.status === 401 || resposta.status === 403) && window.PlataformaAuth) {
        const estaNaTelaDeLogin = window.location.pathname.endsWith("plataforma-login.html");

        if (!estaNaTelaDeLogin) {
            window.PlataformaAuth.removerSessao();
            window.location.href = "plataforma-login.html";
        }
    }

    if (!resposta.ok) {
        let mensagem;

        if (dados && dados.mensagem) {
            mensagem = dados.mensagem;
        } else if (resposta.status === 429) {
            mensagem = "Muitas solicitações foram feitas. Aguarde alguns minutos antes de tentar novamente.";
        } else {
            mensagem = "Não foi possível completar a solicitação.";
        }

        throw new PlataformaApiError(mensagem, resposta.status, dados);
    }

    return dados;
}

// Equivalente isolado de UI.mensagemDeErro (ui.js), que só reconhece
// window.ApiError (erro de tenant) — nunca alterado aqui de propósito
// (zero risco para as páginas de tenant). Esta versão reconhece
// PlataformaApiError.
function plataformaMensagemDeErro(erro, mensagemPadrao) {
    return erro instanceof PlataformaApiError
        ? erro.message
        : (mensagemPadrao || "Não foi possível conectar ao servidor. Tente novamente.");
}

window.plataformaApi = plataformaApi;
window.PlataformaApiError = PlataformaApiError;
window.plataformaMensagemDeErro = plataformaMensagemDeErro;
