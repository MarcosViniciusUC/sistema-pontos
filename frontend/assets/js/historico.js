/**
 * Página de histórico completo de pontos do cliente.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const historyListEl = document.getElementById("history-list");

    async function carregarHistorico() {
        try {
            const movimentacoes = await window.api("/pontos/historico");

            if (movimentacoes.length === 0) {
                window.UI.definirPlaceholder(historyListEl, "Você ainda não tem movimentações.", "li");
                return;
            }

            historyListEl.innerHTML = "";
            movimentacoes.forEach(function (mov) {
                historyListEl.appendChild(window.UI.criarItemHistorico(mov));
            });

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar seu histórico agora.");
            window.UI.definirPlaceholder(historyListEl, mensagem, "li");
        }
    }

    carregarHistorico();
})();
