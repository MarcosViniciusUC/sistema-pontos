/**
 * "Funcionalidades do plano" do frontend — camada única que sabe quais
 * recursos opcionais (favoritos, recompensas em destaque, gamificação/
 * progresso) e qual limite de empresas o tenant atual tem, via
 * GET /tenant/funcionalidades (autenticado — ver
 * src/services/planosFuncionalidades.service.js no backend, fonte real de
 * verdade).
 *
 * Isto é SÓ para decidir O QUE MOSTRAR. A autorização de verdade é sempre
 * o 403 de exigirFuncionalidadeMiddleware.js em cada endpoint real — esta
 * camada nunca é, nem pretende ser, uma segunda fonte de autorização;
 * mesmo que um usuário forçasse `Funcionalidades.habilitada` a devolver
 * `true` no console do navegador, a chamada real ao backend continuaria
 * negada.
 *
 * FAIL-CLOSED por padrão: antes da resposta chegar (ou se a chamada
 * falhar), toda funcionalidade opcional é tratada como DESLIGADA e o
 * limite de empresas como o mais restritivo (1) — nunca mostra algo que
 * pode não estar disponível. Um script que precise do valor confirmado
 * deve aguardar `await window.Funcionalidades.pronto`.
 */
(function () {
    const PADRAO_FAIL_CLOSED = {
        funcionalidades: { favoritos: false, recompensas_destaque: false, gamificacao_progresso: false },
        limiteEmpresas: 1
    };

    let estadoAtual = PADRAO_FAIL_CLOSED;

    /**
     * Só chama o endpoint com uma sessão de tenant válida — páginas
     * públicas (login, cadastro) nunca têm um tenant autenticado para
     * resolver, e chamar `/tenant/funcionalidades` sem token só geraria um
     * 401 tratado por api.js como sessão expirada (redirecionamento
     * indevido numa tela que nem exige login).
     */
    async function carregar() {
        if (!window.Auth || !window.Auth.possuiSessao() || window.Auth.tokenExpirado(window.Auth.obterToken())) {
            return;
        }

        try {
            const resposta = await window.api("/tenant/funcionalidades");
            estadoAtual = resposta;
        } catch (erroDeRede) {
            // Mantém PADRAO_FAIL_CLOSED — nunca mostra algo indisponível.
        }
    }

    function habilitada(chave) {
        return Boolean(estadoAtual.funcionalidades && estadoAtual.funcionalidades[chave]);
    }

    function limiteEmpresas() {
        return estadoAtual.limiteEmpresas;
    }

    /**
     * Esconde todo elemento com `data-funcionalidade="<chave>"` cuja chave
     * não estiver habilitada — mesma convenção usada por tenant.js
     * (marcador no HTML + uma função genérica), sem precisar de código
     * bespoke em cada página.
     */
    function aplicarNaPagina() {
        document.querySelectorAll("[data-funcionalidade]").forEach(function (el) {
            if (!habilitada(el.dataset.funcionalidade)) {
                el.hidden = true;
            }
        });
    }

    window.Funcionalidades = {
        habilitada: habilitada,
        limiteEmpresas: limiteEmpresas,
        aplicarNaPagina: aplicarNaPagina,
        pronto: null
    };

    const aoCarregarDom = document.readyState === "loading"
        ? new Promise(function (resolve) { document.addEventListener("DOMContentLoaded", resolve); })
        : Promise.resolve();

    window.Funcionalidades.pronto = aoCarregarDom.then(carregar).then(aplicarNaPagina);
})();
