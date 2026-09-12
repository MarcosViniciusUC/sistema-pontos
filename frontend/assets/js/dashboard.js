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
    const progressAreaEl = document.getElementById("progress-area");

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

    // ==========================================================================
    // Estrela de favorito (individual do cliente) — mesmo endpoint e mesmo
    // padrão otimista (troca visual antes da resposta, reverte se falhar) já
    // usados em recompensas.js/favoritos.js. Conceito diferente do selo
    // estático "Em destaque" logo abaixo, que é global e nunca clicável pelo
    // cliente (ver comentário em dashboard.css:.reward-card__featured).
    // ==========================================================================

    function atualizarVisualFavorito(botao, favorita) {
        // ★/☆ (dingbat de texto, não emoji) — mesmo par de glifos em toda
        // tela que tem favorito. Antes o estado marcado usava o emoji "⭐",
        // que muda de desenho conforme o sistema operacional de quem olha;
        // trocado por "★" (mesma família de caractere do "☆" já usado no
        // estado desmarcado) para o botão ficar visualmente estável e,
        // principalmente, para nunca ser confundido com o selo de destaque
        // logo ao lado (ver criarIconeDestaque), que agora não usa mais
        // nenhum símbolo de estrela.
        botao.textContent = favorita ? "★" : "☆";
        botao.classList.toggle("is-favorito", favorita);
        botao.setAttribute("aria-pressed", String(favorita));
        const rotulo = favorita ? "Remover dos favoritos" : "Adicionar aos favoritos";
        botao.setAttribute("aria-label", rotulo);
        botao.title = rotulo;
    }

    // ==========================================================================
    // Selo "Destaque" — destaque GLOBAL (admin/funcionário), conceito
    // diferente do favorito pessoal do cliente acima. Antes usava o mesmo
    // símbolo de estrela do botão de favorito ("⭐ Destaque"), o que podia
    // confundir os dois conceitos num card que mostra as duas coisas ao
    // mesmo tempo. O ícone de chama não é clicável (aria-hidden) — só o
    // texto "Destaque" carrega o significado para leitor de tela.
    // ==========================================================================

    function criarIconeDestaque() {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "reward-card__featured-icon");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("aria-hidden", "true");

        const path = document.createElementNS(NS, "path");
        path.setAttribute(
            "d",
            "M12 3c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-.4-1.8-.9-2.2.3 1.7-1 2.6-1.9 1.1-.6-1.1.4-1.9.5-3.4C13.9 7.4 15 9.6 15 12a5.5 5.5 0 0 1-11 0c0-4.5 3.6-6.2 4.1-9z"
        );
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.6");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);

        return svg;
    }

    function criarBotaoFavorito(recompensa) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "reward-card__favorite";
        atualizarVisualFavorito(botao, recompensa.favorita);

        botao.addEventListener("click", async function (evento) {
            // O card em si não tem nenhum clique próprio nesta tela (o CTA
            // sempre é o link/botão do rodapé), mas a estrela fica sobre a
            // mídia — impedir a propagação é uma proteção defensiva contra
            // qualquer clique-through acidental, mesmo sem um listener no
            // card hoje.
            evento.stopPropagation();

            const novoValor = !recompensa.favorita;

            recompensa.favorita = novoValor;
            atualizarVisualFavorito(botao, novoValor);
            botao.disabled = true;

            try {
                const metodo = novoValor ? "POST" : "DELETE";
                await window.api("/favoritos/" + recompensa.id, { method: metodo });

            } catch (erro) {
                recompensa.favorita = !novoValor;
                atualizarVisualFavorito(botao, !novoValor);

            } finally {
                botao.disabled = false;
            }
        });

        return botao;
    }

    function criarCardRecompensaDestaque(recompensa) {
        const disponivel = saldoConhecido && saldoAtual >= recompensa.pontos_necessarios;

        const card = document.createElement("article");
        card.className = "reward-card reward-card--v2" + (disponivel ? "" : " reward-card--indisponivel");

        // Imagem real quando a recompensa tem uma (ver reward.controller.js);
        // sem imagem, cai no mesmo placeholder de sempre — mesmo tratamento
        // de recompensas.js, duplicado aqui de propósito (mesmo princípio já
        // usado no resto do projeto).
        //
        // Sem aria-hidden aqui (diferente de antes): a partir de agora esta
        // caixa também contém a estrela de favorito, um controle real —
        // escondê-la de leitores de tela deixaria um botão focável, porém
        // invisível para quem usa AT.
        const media = document.createElement("div");
        media.className = "reward-card__media";

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
            monograma.setAttribute("aria-hidden", "true");
            monograma.textContent = obterMonogramaRecompensa(recompensa);
            media.appendChild(monograma);
        }

        // Toda recompensa desta seção já é destacada por definição (é o que
        // GET /recompensas + o filtro abaixo garantem) — o selo confirma
        // isso visualmente sem precisar de mais uma chamada à API.
        const seloDestaque = document.createElement("span");
        seloDestaque.className = "status-badge status-badge--aprovado reward-card__featured";
        seloDestaque.appendChild(criarIconeDestaque());
        seloDestaque.appendChild(document.createTextNode("Destaque"));
        media.appendChild(seloDestaque);

        media.appendChild(criarBotaoFavorito(recompensa));

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

    // ==========================================================================
    // Área de progresso (Bloco 1 da V2) — transforma o saldo cru numa
    // sensação de progresso: quanto falta para a próxima recompensa, ou o
    // aviso de que já dá pra resgatar. Cálculo inteiro em
    // window.UI.calcularProgresso/encontrarProximaRecompensa/
    // encontrarRecompensasDesbloqueadas (src/assets/js/ui.js), reaproveitando
    // saldoAtual e a mesma lista de recompensas já carregada acima — nenhuma
    // chamada nova à API só para isto. Puramente apresentação: quem decide
    // de verdade se um resgate é permitido continua sendo o backend, a cada
    // requisição de POST /resgates.
    // ==========================================================================

    function renderizarProgressoDesbloqueado(desbloqueadas) {
        const maisBarata = desbloqueadas[0];

        const titulo = document.createElement("p");
        titulo.className = "balance-card__progress-title";
        titulo.textContent = desbloqueadas.length === 1
            ? "🎁 Você já desbloqueou uma recompensa!"
            : `🎁 Você já desbloqueou ${desbloqueadas.length} recompensas!`;
        progressAreaEl.appendChild(titulo);

        const texto = document.createElement("p");
        texto.className = "balance-card__progress-text";

        const negrito = document.createElement("strong");
        negrito.textContent = maisBarata.nome;

        texto.append("Você tem pontos suficientes para resgatar: ", negrito);

        if (desbloqueadas.length > 1) {
            texto.append(` (e mais ${desbloqueadas.length - 1})`);
        }

        progressAreaEl.appendChild(texto);
    }

    function renderizarProgressoEmAndamento(proxima) {
        const progresso = window.UI.calcularProgresso(saldoAtual, proxima.pontos_necessarios);

        const rotuloAcessivel = `${window.UI.formatarNumero(saldoAtual)} de `
            + `${window.UI.formatarNumero(proxima.pontos_necessarios)} pontos para ${proxima.nome}`;

        progressAreaEl.appendChild(window.UI.criarBarraProgresso(progresso.percentual, rotuloAcessivel));

        const numeros = document.createElement("p");
        numeros.className = "balance-card__progress-numbers";
        numeros.textContent = `${window.UI.formatarNumero(saldoAtual)} / `
            + `${window.UI.formatarNumero(proxima.pontos_necessarios)} pontos`;
        progressAreaEl.appendChild(numeros);

        const proximaTexto = document.createElement("p");
        proximaTexto.className = "balance-card__progress-text";
        const negrito = document.createElement("strong");
        negrito.textContent = proxima.nome;
        proximaTexto.append("Próxima recompensa: ", negrito);
        progressAreaEl.appendChild(proximaTexto);

        const faltamTexto = document.createElement("p");
        faltamTexto.className = "balance-card__progress-missing" + (progresso.quaseLa ? " is-quase-la" : "");
        faltamTexto.textContent = progresso.quaseLa
            ? `🔥 Está quase! Faltam apenas ${window.UI.formatarNumero(progresso.faltam)} pontos`
            : `Faltam ${window.UI.formatarNumero(progresso.faltam)} pontos`;
        progressAreaEl.appendChild(faltamTexto);
    }

    function atualizarAreaProgresso(recompensas) {
        progressAreaEl.innerHTML = "";

        const ativas = recompensas.filter(function (r) { return r.ativo; });

        if (ativas.length === 0) {
            const vazio = document.createElement("p");
            vazio.className = "balance-card__progress-text";
            vazio.textContent = "Nenhuma recompensa disponível no momento.";
            progressAreaEl.appendChild(vazio);
            progressAreaEl.hidden = false;
            return;
        }

        // Se o saldo já cobre uma ou mais recompensas, essa é sempre a
        // informação principal — nunca mostrar "faltam X pontos" como se
        // nada tivesse sido desbloqueado ainda (mesmo quando ainda existe
        // uma recompensa mais cara acima do saldo).
        const desbloqueadas = window.UI.encontrarRecompensasDesbloqueadas(ativas, saldoAtual);

        if (desbloqueadas.length > 0) {
            renderizarProgressoDesbloqueado(desbloqueadas);
        } else {
            const proxima = window.UI.encontrarProximaRecompensa(ativas, saldoAtual);
            // proxima só é null aqui se `ativas` estivesse vazio, já tratado
            // acima — mas a checagem defensiva evita depender só disso.
            if (proxima) {
                renderizarProgressoEmAndamento(proxima);
            }
        }

        progressAreaEl.hidden = false;
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

        // Sem saldo conhecido não há progresso pra calcular — a área fica
        // escondida (mesmo padrão de "degradar sem quebrar" já usado no
        // resto da tela: o erro do saldo já apareceu acima, em balanceErrorEl).
        if (saldoConhecido) {
            atualizarAreaProgresso(recompensasResultado.value);
        }

        // "Recompensas em destaque" mostra só o que admin/funcionário
        // marcaram com destacada=true (ver reward.controller.js:destacar) —
        // nunca as primeiras N recompensas da lista. Sem recompensa nenhuma
        // destacada no momento, mostra um vazio elegante em vez de inventar
        // conteúdo ou esconder a seção inteira.
        const destacadas = recompensasResultado.value.filter(function (recompensa) {
            return recompensa.destacada;
        });

        if (destacadas.length === 0) {
            window.UI.definirPlaceholder(rewardsListEl, "Nenhuma recompensa em destaque no momento.", "p");
            return;
        }

        rewardsListEl.innerHTML = "";

        destacadas.forEach(function (recompensa) {
            rewardsListEl.appendChild(criarCardRecompensaDestaque(recompensa));
        });
    }

    carregarSaldoERecompensas();
    carregarHistorico();
})();
