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

    // ==========================================================================
    // Saldo no cabeçalho — função isolada, sem relação com a lógica de
    // histórico abaixo (mesmo padrão já usado em meus-resgates.js na Fase 4).
    // Mesmo endpoint (GET /pontos/saldo) já usado em outras telas do cliente.
    // ==========================================================================

    const balanceValueEl = document.getElementById("balance-chip-value");

    async function carregarSaldo() {
        try {
            const dados = await window.api("/pontos/saldo");
            balanceValueEl.textContent = window.UI.formatarNumero(dados.saldo);
        } catch (erro) {
            balanceValueEl.textContent = "--";
        }
    }

    // ==========================================================================
    // Agrupamento visual por data — a API já devolve as movimentações
    // ordenadas por criado_em DESC (ver points.controller.js), então basta
    // detectar quando a data muda de um item para o próximo e inserir um
    // cabeçalho antes dele. Nenhum dado novo é buscado, nenhuma
    // movimentação é filtrada, ordenada de novo ou reagrupada por regra de
    // negócio — é só uma marcação visual sobre a mesma lista que a API já
    // devolve. window.UI.criarItemHistorico (ui.js) não foi alterado.
    // ==========================================================================

    function formatarGrupoData(isoString) {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        }).format(new Date(isoString));
    }

    function criarCabecalhoGrupo(rotulo) {
        const cabecalho = document.createElement("li");
        cabecalho.className = "history-group-header";
        cabecalho.textContent = rotulo;
        return cabecalho;
    }

    async function carregarHistorico() {
        try {
            const movimentacoes = await window.api("/pontos/historico");

            if (movimentacoes.length === 0) {
                window.UI.definirPlaceholder(historyListEl, "Você ainda não tem movimentações.", "li");
                return;
            }

            historyListEl.innerHTML = "";

            let grupoAtual = null;
            movimentacoes.forEach(function (mov) {
                const grupo = formatarGrupoData(mov.criado_em);

                if (grupo !== grupoAtual) {
                    grupoAtual = grupo;
                    historyListEl.appendChild(criarCabecalhoGrupo(grupo));
                }

                historyListEl.appendChild(window.UI.criarItemHistorico(mov));
            });

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar seu histórico agora.");
            window.UI.definirPlaceholder(historyListEl, mensagem, "li");
        }
    }

    carregarHistorico();
    carregarSaldo();
})();
