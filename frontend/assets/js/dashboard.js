/**
 * Lógica do dashboard do cliente (V1).
 *
 * Segurança: o saldo/histórico são sempre do usuário do próprio token
 * (o backend decide isso via req.usuario.id) — este arquivo nunca envia
 * nem deixa o usuário escolher um usuario_id.
 *
 * Fase 2 (redesign visual): as duas chamadas de saldo e recompensas agora
 * são coordenadas (antes eram independentes) para que os cards de
 * recompensa em destaque possam mostrar o mesmo tratamento de
 * disponível/indisponível já usado em recompensas.html — puramente uma
 * questão de exibição, nenhum endpoint novo, nenhuma regra de negócio
 * nova. A comparação "saldo x pontos necessários" é só UX; a validação
 * que vale continua sendo feita pelo backend a cada resgate.
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

    let saldoAtual = 0;
    let saldoConhecido = false;

    // ==========================================================================
    // Atividade recente — mesmos campos de sempre (id, quantidade, tipo,
    // descricao, criado_em, vindos de GET /pontos/historico), só um
    // componente visual mais rico que o item genérico de historico.js
    // (window.UI.criarItemHistorico, que continua intacto para lá).
    // ==========================================================================

    function criarIconeAtividade(tipo) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("aria-hidden", "true");

        const path = document.createElementNS(NS, "path");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("d", tipo === "entrada" ? "M12 19V6M6 12l6-6 6 6" : "M12 5v13M6 12l6 6 6-6");
        svg.appendChild(path);
        return svg;
    }

    function criarItemAtividade(mov) {
        const item = document.createElement("li");
        item.className = "activity-item";

        const icone = document.createElement("span");
        icone.className = "activity-item__icon activity-item__icon--" + mov.tipo;
        icone.appendChild(criarIconeAtividade(mov.tipo));
        item.appendChild(icone);

        const info = document.createElement("div");
        info.className = "activity-item__info";

        const descricao = document.createElement("p");
        descricao.className = "activity-item__descricao";
        // A descrição vem exatamente como registrada pela API — não inventamos
        // uma origem quando a API não informa nenhuma.
        descricao.textContent = mov.descricao
            || (mov.tipo === "entrada" ? "Entrada de pontos" : "Saída de pontos");

        const data = document.createElement("p");
        data.className = "activity-item__data";
        data.textContent = window.UI.formatarData(mov.criado_em);

        info.appendChild(descricao);
        info.appendChild(data);
        item.appendChild(info);

        const quantidade = document.createElement("span");
        const sinal = mov.tipo === "entrada" ? "+" : "−";
        quantidade.className = "activity-item__quantidade activity-item__quantidade--" + mov.tipo;
        quantidade.textContent = sinal + window.UI.formatarNumero(mov.quantidade) + " pts";
        item.appendChild(quantidade);

        return item;
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
                historyListEl.appendChild(criarItemAtividade(mov));
            });

        } catch (erro) {
            window.UI.definirPlaceholder(historyListEl, "Não foi possível carregar seu histórico agora.", "li");
        }
    }

    // ==========================================================================
    // Recompensas em destaque — mesmo card rico usado em recompensas.html
    // (.reward-card--v2), sem o botão "Ver detalhes" e sem abrir o modal de
    // resgate (esse fluxo continua existindo só lá). Aqui o CTA sempre leva
    // para a tela de recompensas, que é onde o resgate de fato acontece.
    //
    // QUANTIDADE_VARIANTES_MEDIA precisa bater com o número de seletores
    // [data-variant="N"] definidos em dashboard.css (mesma regra usada por
    // recompensas.js).
    // ==========================================================================

    const QUANTIDADE_VARIANTES_MEDIA = 5;

    function obterVarianteMedia(texto) {
        let hash = 0;
        for (let i = 0; i < texto.length; i++) {
            hash = (hash * 31 + texto.charCodeAt(i)) % QUANTIDADE_VARIANTES_MEDIA;
        }
        return hash;
    }

    function obterMonogramaRecompensa(recompensa) {
        const base = (recompensa.empresa_nome || recompensa.nome || "").trim();
        return base ? base.charAt(0).toUpperCase() : "?";
    }

    function criarCardRecompensaDestaque(recompensa) {
        const disponivel = saldoConhecido && saldoAtual >= recompensa.pontos_necessarios;

        const card = document.createElement("article");
        card.className = "reward-card reward-card--v2" + (disponivel ? "" : " reward-card--indisponivel");

        // Imagem real quando a recompensa tem uma (ver reward.controller.js);
        // sem imagem, cai no mesmo placeholder de sempre — mesmo tratamento
        // de recompensas.js, duplicado aqui de propósito (mesmo princípio já
        // usado no resto do projeto).
        const media = document.createElement("div");
        media.className = "reward-card__media";
        media.setAttribute("aria-hidden", "true");

        if (recompensa.imagem) {
            const foto = document.createElement("img");
            foto.className = "reward-card__image";
            foto.src = recompensa.imagem;
            foto.alt = "";
            media.appendChild(foto);
        } else {
            media.dataset.variant = String(obterVarianteMedia(recompensa.empresa_nome || recompensa.nome || ""));

            const monograma = document.createElement("span");
            monograma.className = "reward-card__monogram";
            monograma.textContent = obterMonogramaRecompensa(recompensa);
            media.appendChild(monograma);
        }
        card.appendChild(media);

        const body = document.createElement("div");
        body.className = "reward-card__body";
        card.appendChild(body);

        // Recompensas cadastradas antes da estrutura de empresas ainda podem
        // não ter uma definida (ver migração) — nesse caso simplesmente não
        // mostra a linha, em vez de exibir algo como "null".
        if (recompensa.empresa_nome) {
            const empresa = document.createElement("span");
            empresa.className = "reward-card__badge";
            empresa.textContent = recompensa.empresa_nome;
            body.appendChild(empresa);
        }

        const nome = document.createElement("h3");
        nome.className = "reward-card__title";
        nome.textContent = recompensa.nome;
        body.appendChild(nome);

        const footer = document.createElement("div");
        footer.className = "reward-card__footer";

        const pontos = document.createElement("span");
        pontos.className = "reward-card__points";
        pontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        footer.appendChild(pontos);

        if (disponivel) {
            const btnResgatar = document.createElement("a");
            btnResgatar.href = "recompensas.html";
            btnResgatar.className = "btn btn--primary reward-card__cta";
            btnResgatar.textContent = "Resgatar";
            footer.appendChild(btnResgatar);
        } else if (saldoConhecido) {
            const diferenca = recompensa.pontos_necessarios - saldoAtual;
            const faltam = document.createElement("span");
            faltam.className = "reward-card__missing";
            faltam.textContent = `Faltam ${window.UI.formatarNumero(diferenca)} pontos`;
            footer.appendChild(faltam);
        } else {
            const btnVer = document.createElement("a");
            btnVer.href = "recompensas.html";
            btnVer.className = "btn btn--ghost reward-card__cta";
            btnVer.textContent = "Ver recompensa";
            footer.appendChild(btnVer);
        }

        body.appendChild(footer);
        return card;
    }

    async function carregarSaldoERecompensas() {
        // Promise.allSettled: uma falha em qualquer uma das duas chamadas não
        // apaga o que a outra já carregou com sucesso.
        const [saldoResultado, recompensasResultado] = await Promise.allSettled([
            window.api("/pontos/saldo"),
            window.api("/recompensas")
        ]);

        if (saldoResultado.status === "fulfilled") {
            saldoAtual = saldoResultado.value.saldo;
            saldoConhecido = true;
            balanceValueEl.textContent = window.UI.formatarNumero(saldoAtual);
        } else {
            balanceValueEl.textContent = "--";
            balanceErrorEl.textContent = "Não foi possível carregar seu saldo agora.";
            balanceErrorEl.hidden = false;
        }

        if (recompensasResultado.status === "rejected") {
            window.UI.definirPlaceholder(
                rewardsListEl,
                window.UI.mensagemDeErro(recompensasResultado.reason, "Não foi possível carregar as recompensas agora."),
                "p"
            );
            return;
        }

        const recompensas = recompensasResultado.value;

        if (recompensas.length === 0) {
            window.UI.definirPlaceholder(rewardsListEl, "Nenhuma recompensa disponível no momento.", "p");
            return;
        }

        rewardsListEl.innerHTML = "";

        recompensas.slice(0, 4).forEach(function (recompensa) {
            rewardsListEl.appendChild(criarCardRecompensaDestaque(recompensa));
        });
    }

    carregarSaldoERecompensas();
    carregarHistorico();
})();
