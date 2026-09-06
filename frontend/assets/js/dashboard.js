/**
 * Lógica do dashboard do cliente (V1).
 *
 * Segurança: o saldo/histórico são sempre do usuário do próprio token
 * (o backend decide isso via req.usuario.id) — este arquivo nunca envia
 * nem deixa o usuário escolher um usuario_id.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const balanceValueEl = document.getElementById("balance-value");
    const balanceErrorEl = document.getElementById("balance-error");
    const historyListEl = document.getElementById("history-list");
    const rewardsListEl = document.getElementById("rewards-list");

    async function carregarSaldo() {
        try {
            const dados = await window.api("/pontos/saldo");
            balanceValueEl.textContent = window.UI.formatarNumero(dados.saldo);
        } catch (erro) {
            balanceValueEl.textContent = "--";
            balanceErrorEl.textContent = "Não foi possível carregar seu saldo agora.";
            balanceErrorEl.hidden = false;
        }
    }

    async function carregarHistorico() {
        try {
            const movimentacoes = await window.api("/pontos/historico");

            if (movimentacoes.length === 0) {
                window.UI.definirPlaceholder(historyListEl, "Você ainda não tem movimentações.", "li");
                return;
            }

            historyListEl.innerHTML = "";

            movimentacoes.slice(0, 5).forEach(function (mov) {
                historyListEl.appendChild(window.UI.criarItemHistorico(mov));
            });

        } catch (erro) {
            window.UI.definirPlaceholder(historyListEl, "Não foi possível carregar seu histórico agora.", "li");
        }
    }

    async function carregarRecompensas() {
        try {
            const recompensas = await window.api("/recompensas");

            if (recompensas.length === 0) {
                window.UI.definirPlaceholder(rewardsListEl, "Nenhuma recompensa disponível no momento.", "p");
                return;
            }

            rewardsListEl.innerHTML = "";

            recompensas.slice(0, 4).forEach(function (recompensa) {
                rewardsListEl.appendChild(criarCardRecompensaSimples(recompensa));
            });

        } catch (erro) {
            window.UI.definirPlaceholder(rewardsListEl, "Não foi possível carregar as recompensas agora.", "p");
        }
    }

    function criarCardRecompensaSimples(recompensa) {
        const card = document.createElement("article");
        card.className = "reward-card";

        const nome = document.createElement("h3");
        nome.className = "reward-card__nome";
        nome.textContent = recompensa.nome;
        card.appendChild(nome);

        // Recompensas cadastradas antes da estrutura de empresas ainda podem
        // não ter uma definida (ver migração) — nesse caso simplesmente não
        // mostra a linha, em vez de exibir algo como "null".
        if (recompensa.empresa_nome) {
            const empresa = document.createElement("p");
            empresa.className = "reward-card__empresa";
            empresa.textContent = recompensa.empresa_nome;
            card.appendChild(empresa);
        }

        const pontos = document.createElement("p");
        pontos.className = "reward-card__pontos";
        pontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        card.appendChild(pontos);

        return card;
    }

    carregarSaldo();
    carregarHistorico();
    carregarRecompensas();
})();
