/**
 * Wrapper único para todas as chamadas à API.
 * Uso: api("/pontos/saldo") | api("/login", { method: "POST", body: { email, senha } })
 */
const API_BASE_URL = window.location.origin;

class ApiError extends Error {
    constructor(message, status, dados) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.dados = dados;
    }
}

async function api(caminho, opcoes = {}) {
    const token = window.Auth ? window.Auth.obterToken() : null;

    const headers = {
        "Content-Type": "application/json",
        ...(opcoes.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let resposta;

    try {
        resposta = await fetch(`${API_BASE_URL}${caminho}`, {
            method: opcoes.method || "GET",
            headers,
            body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
        });
    } catch (erroDeRede) {
        throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão.", 0, null);
    }

    let dados = null;
    try {
        dados = await resposta.json();
    } catch (erroDeParse) {
        dados = null;
    }

    if (resposta.status === 401 && window.Auth) {
        window.Auth.removerSessao();

        const estaNaTelaDeLogin = window.location.pathname.endsWith("index.html")
            || window.location.pathname === "/";

        if (!estaNaTelaDeLogin) {
            window.location.href = "index.html";
        }
    }

    if (!resposta.ok) {
        // 429 (rate limit) vem em texto puro, não em JSON — dados fica null
        // pelo catch acima, então precisa de uma mensagem própria em vez de
        // cair no fallback genérico.
        let mensagem;

        if (dados && dados.mensagem) {
            mensagem = dados.mensagem;
        } else if (resposta.status === 429) {
            mensagem = "Muitas solicitações foram feitas. Aguarde alguns minutos antes de tentar novamente.";
        } else {
            mensagem = "Não foi possível completar a solicitação.";
        }

        throw new ApiError(mensagem, resposta.status, dados);
    }

    return dados;
}

window.api = api;
window.ApiError = ApiError;
