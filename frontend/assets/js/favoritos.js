/**
 * Página "Favoritos" — recompensas que o próprio cliente marcou com a
 * estrela (ver favorito.controller.js). Conceito diferente do destaque
 * global (admin/funcionário, seção "Recompensas em destaque" da Início) —
 * aqui é sempre individual, só o que ESTE cliente escolheu.
 *
 * Card, modal de resgate e modal de sucesso são os mesmos de recompensas.js
 * (mesmos ids no HTML, mesmo comportamento) — duplicado aqui de propósito,
 * mesmo princípio já usado no resto do projeto (dashboard.js/recompensas.js
 * também duplicam a lógica de card em vez de compartilhar um módulo).
 *
 * Diferença central: GET /favoritos pode incluir recompensa com ativo=false
 * (a relação de favorito sobrevive à desativação — ver
 * favorito.controller.js:listar) — o card trata esse caso mostrando
 * "Indisponível no momento" e escondendo o botão de resgate, em vez de
 * escondida a recompensa da lista inteira.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    // Espelha HORAS_PARA_EXPIRAR de src/services/resgateExpiracao.service.js —
    // só para exibir a regra ao cliente antes/depois do resgate (mesmo valor
    // usado em recompensas.js). Não decide nada: a expiração de verdade
    // continua sendo calculada e aplicada inteiramente pelo backend.
    const HORAS_PARA_EXPIRAR_RESGATE = 5;

    const favoritosListEl = document.getElementById("favoritos-list");
    const favoritosTitleEl = document.getElementById("favoritos-title");
    const balanceChipEl = document.getElementById("balance-chip-value");

    // ---- Modal: confirmar resgate ----
    const modalRewardName = document.getElementById("modal-reward-name");
    const modalRewardPoints = document.getElementById("modal-reward-points");
    const modalNoteEl = document.getElementById("modal-note");
    const modalErrorEl = document.getElementById("modal-error");
    const modalCancelBtn = document.getElementById("modal-cancel");
    const modalConfirmBtn = document.getElementById("modal-confirm");
    const modalConfirmLabel = modalConfirmBtn.querySelector(".btn__label");

    const controladorConfirmacao = window.UI.criarControladorModal(
        document.getElementById("modal-overlay"),
        { podeFechar: function () { return !modalConfirmBtn.disabled; } }
    );
    modalCancelBtn.addEventListener("click", controladorConfirmacao.fechar);

    // ---- Modal: ver detalhes (descrição completa) ----
    const modalDetalhesTitleEl = document.getElementById("modal-detalhes-title");
    const modalDetalhesDescricaoEl = document.getElementById("modal-detalhes-descricao");

    const controladorDetalhes = window.UI.criarControladorModal(
        document.getElementById("modal-detalhes-overlay")
    );
    document.getElementById("modal-detalhes-fechar").addEventListener("click", controladorDetalhes.fechar);

    // ---- Modal: resgate realizado (código + QR Code) ----
    const modalSucessoRecompensaEl = document.getElementById("modal-sucesso-recompensa");
    const modalSucessoPontosEl = document.getElementById("modal-sucesso-pontos");
    const modalSucessoEmpresaRowEl = document.getElementById("modal-sucesso-empresa-row");
    const modalSucessoEmpresaEl = document.getElementById("modal-sucesso-empresa");
    const modalSucessoCodigoEl = document.getElementById("modal-sucesso-codigo");
    const modalSucessoNotaEl = document.getElementById("modal-sucesso-nota");
    const modalSucessoQrEl = document.getElementById("modal-sucesso-qrcode");

    const controladorSucesso = window.UI.criarControladorModal(
        document.getElementById("modal-sucesso-overlay")
    );
    document.getElementById("modal-sucesso-fechar").addEventListener("click", controladorSucesso.fechar);

    let qrCodeInstancia = null;

    function renderizarQrCode(texto) {
        if (typeof QRCode === "undefined") {
            modalSucessoQrEl.textContent = "";
            return;
        }

        if (!qrCodeInstancia) {
            modalSucessoQrEl.innerHTML = "";
            qrCodeInstancia = new QRCode(modalSucessoQrEl, {
                text: texto,
                width: 160,
                height: 160,
                colorDark: "#0B0D0F",
                colorLight: "#FFFFFF"
            });
        } else {
            qrCodeInstancia.makeCode(texto);
        }
    }

    let saldoAtual = 0;
    let saldoConhecido = false;
    let recompensaSelecionada = null;
    let favoritosCarregados = [];

    // ==========================================================================
    // Modal: confirmar resgate
    // ==========================================================================

    function abrirModalConfirmacao(recompensa, botaoOrigem) {
        recompensaSelecionada = recompensa;

        modalRewardName.textContent = recompensa.nome;
        modalRewardPoints.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        modalNoteEl.textContent = "Você vai utilizar " + window.UI.formatarNumero(recompensa.pontos_necessarios)
            + " pontos para resgatar " + recompensa.nome + ". Os pontos são descontados imediatamente"
            + " e um código de reserva será gerado para você apresentar no estabelecimento."
            + " Você terá " + HORAS_PARA_EXPIRAR_RESGATE + " horas para usar o código — se não for utilizado"
            + " nesse prazo, o resgate é cancelado e os pontos voltam automaticamente para o seu saldo.";
        modalErrorEl.hidden = true;
        modalErrorEl.textContent = "";

        controladorConfirmacao.abrir(botaoOrigem);
        modalConfirmBtn.focus();
    }

    modalConfirmBtn.addEventListener("click", async function () {
        if (!recompensaSelecionada) {
            return;
        }

        const recompensaDoResgate = recompensaSelecionada;

        modalConfirmBtn.disabled = true;
        modalConfirmBtn.classList.add("is-loading");
        modalConfirmLabel.textContent = "Enviando...";
        modalErrorEl.hidden = true;

        try {
            const resgate = await window.api("/resgates", {
                method: "POST",
                body: { recompensa_id: recompensaDoResgate.id }
            });

            recompensaSelecionada = null;
            controladorConfirmacao.fechar(true);

            await carregarTudo();

            abrirModalSucesso(resgate);

        } catch (erro) {
            modalErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível concluir o resgate agora.");
            modalErrorEl.hidden = false;

        } finally {
            modalConfirmBtn.disabled = false;
            modalConfirmBtn.classList.remove("is-loading");
            modalConfirmLabel.textContent = "Confirmar resgate";
        }
    });

    // ==========================================================================
    // Modal: ver detalhes
    // ==========================================================================

    function abrirModalDetalhes(recompensa, botaoOrigem) {
        modalDetalhesTitleEl.textContent = recompensa.nome;
        modalDetalhesDescricaoEl.textContent = recompensa.descricao
            || "Esta recompensa não possui uma descrição adicional.";

        controladorDetalhes.abrir(botaoOrigem);
        document.getElementById("modal-detalhes-fechar").focus();
    }

    // ==========================================================================
    // Modal: resgate realizado
    // ==========================================================================

    function abrirModalSucesso(resgate) {
        modalSucessoRecompensaEl.textContent = resgate.recompensa_nome;
        modalSucessoPontosEl.textContent = window.UI.formatarNumero(resgate.pontos) + " pontos";
        modalSucessoCodigoEl.textContent = resgate.codigo;

        if (resgate.empresa_nome) {
            modalSucessoEmpresaEl.textContent = resgate.empresa_nome;
            modalSucessoEmpresaRowEl.hidden = false;
        } else {
            modalSucessoEmpresaRowEl.hidden = true;
        }

        modalSucessoNotaEl.textContent = window.UI.formatarNumero(resgate.pontos)
            + " pontos foram descontados do seu saldo. Apresente este código no estabelecimento para utilizar sua recompensa."
            + " Use este código dentro de " + HORAS_PARA_EXPIRAR_RESGATE + " horas — depois disso ele expira"
            + " e os pontos voltam automaticamente para você.";

        renderizarQrCode(resgate.codigo);

        controladorSucesso.abrir(favoritosTitleEl);
        document.getElementById("modal-sucesso-fechar").focus();
    }

    // ==========================================================================
    // Estrela de favorito — aqui ela sempre começa marcada (só recompensas
    // favoritas aparecem nesta página); clicar remove dos favoritos E tira o
    // card da lista, já que ele deixou de pertencer a esta tela.
    // ==========================================================================

    function atualizarVisualFavorito(botao, favorita) {
        // ★/☆ (dingbat de texto, não emoji) — ver o mesmo comentário em
        // dashboard.js. Trocado de "⭐" para "★" para nunca ser confundido
        // com o selo de destaque (criarIconeDestaque), que não usa mais
        // nenhum símbolo de estrela.
        botao.textContent = favorita ? "★" : "☆";
        botao.classList.toggle("is-favorito", favorita);
        botao.setAttribute("aria-pressed", String(favorita));
        const rotulo = favorita ? "Remover dos favoritos" : "Adicionar aos favoritos";
        botao.setAttribute("aria-label", rotulo);
        botao.title = rotulo;
    }

    // ==========================================================================
    // Selo "Destaque" — ver comentário completo em dashboard.js. Ícone de
    // chama (não é mais um símbolo de estrela) para não competir visualmente
    // com a estrela de favorito do próprio cliente, que aparece no mesmo
    // card.
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

    function criarBotaoFavorito(recompensa, cardEl) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "reward-card__favorite";
        atualizarVisualFavorito(botao, recompensa.favorita);

        botao.addEventListener("click", async function (evento) {
            evento.stopPropagation();

            botao.disabled = true;

            try {
                await window.api("/favoritos/" + recompensa.id, { method: "DELETE" });

                // Sai da lista em memória e da tela — esta página só mostra
                // favoritos, então desfavoritar aqui sempre remove o card.
                favoritosCarregados = favoritosCarregados.filter(function (r) {
                    return r.id !== recompensa.id;
                });
                cardEl.remove();

                if (favoritosCarregados.length === 0) {
                    mostrarVazio();
                }

            } catch (erro) {
                botao.disabled = false;
            }
        });

        return botao;
    }

    // ==========================================================================
    // Cards de recompensa — mesmo visual de recompensas.js/dashboard.js
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

    function criarCardFavorito(recompensa) {
        // Indisponível por dois motivos possíveis, tratados de forma
        // diferente no rodapé abaixo: a recompensa foi desativada (ativo
        // === false — a relação de favorito continua existindo, ver
        // favorito.controller.js:listar) ou o saldo não alcança o preço.
        const desativada = !recompensa.ativo;
        const disponivelPorSaldo = saldoConhecido && saldoAtual >= recompensa.pontos_necessarios;
        const disponivel = !desativada && disponivelPorSaldo;

        const card = document.createElement("article");
        card.className = "reward-card reward-card--v2" + (disponivel ? "" : " reward-card--indisponivel");

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

        if (recompensa.destacada) {
            const seloDestaque = document.createElement("span");
            seloDestaque.className = "status-badge status-badge--aprovado reward-card__featured";
            seloDestaque.appendChild(criarIconeDestaque());
            seloDestaque.appendChild(document.createTextNode("Destaque"));
            media.appendChild(seloDestaque);
        }

        media.appendChild(criarBotaoFavorito(recompensa, card));

        card.appendChild(media);

        const body = document.createElement("div");
        body.className = "reward-card__body";
        card.appendChild(body);

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

        if (recompensa.descricao) {
            const descricao = document.createElement("p");
            descricao.className = "reward-card__desc";
            descricao.textContent = recompensa.descricao;
            body.appendChild(descricao);
        }

        const btnDetalhes = document.createElement("button");
        btnDetalhes.type = "button";
        btnDetalhes.className = "reward-card__details";
        btnDetalhes.textContent = "Ver detalhes";
        btnDetalhes.addEventListener("click", function () {
            abrirModalDetalhes(recompensa, btnDetalhes);
        });
        body.appendChild(btnDetalhes);

        if (desativada) {
            const aviso = document.createElement("p");
            aviso.className = "reward-card__falta";
            aviso.textContent = "Esta recompensa está indisponível no momento.";
            body.appendChild(aviso);
        } else if (!saldoConhecido) {
            const aviso = document.createElement("p");
            aviso.className = "reward-card__falta";
            aviso.textContent = "Não foi possível verificar seu saldo agora";
            body.appendChild(aviso);
        } else {
            // Progresso individual deste favorito (Bloco 1 da V2) — nunca
            // calculado para uma recompensa desativada (ela não pode ser
            // resgatada de qualquer forma, então "faltam X pontos" não faria
            // sentido ali; ver ramo `desativada` acima). Mesmo cálculo puro
            // de dashboard.js (window.UI.calcularProgresso), individual por
            // favorito.
            body.appendChild(criarBlocoProgresso(recompensa));
        }

        const footer = document.createElement("div");
        footer.className = "reward-card__footer";

        const pontos = document.createElement("span");
        pontos.className = "reward-card__points";
        pontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        footer.appendChild(pontos);

        if (desativada) {
            const indisponivel = document.createElement("span");
            indisponivel.className = "reward-card__missing";
            indisponivel.textContent = "Indisponível no momento";
            footer.appendChild(indisponivel);
        } else if (disponivel) {
            const btnResgatar = document.createElement("button");
            btnResgatar.type = "button";
            btnResgatar.className = "btn btn--primary reward-card__cta";
            btnResgatar.textContent = "Resgatar";
            btnResgatar.addEventListener("click", function () {
                abrirModalConfirmacao(recompensa, btnResgatar);
            });
            footer.appendChild(btnResgatar);
        }
        // Quando indisponível só por saldo (não desativada), o bloco de
        // progresso acima já mostra "Faltam X pontos" — repetir a mesma
        // informação de novo aqui, sem a barra, seria só ruído.

        body.appendChild(footer);

        return card;
    }

    /**
     * "X / Y pontos" + barra + "Faltam Z pontos" (ou "🔥 Está quase!"), ou
     * "🎁 Você já pode resgatar" quando o saldo já cobre o custo — nunca
     * "faltam 0 pontos" nesse caso (ver requisito do Bloco 1).
     */
    function criarBlocoProgresso(recompensa) {
        const progresso = window.UI.calcularProgresso(saldoAtual, recompensa.pontos_necessarios);

        const bloco = document.createElement("div");
        bloco.className = "reward-card__progress";

        if (progresso.disponivel) {
            const disponivelTexto = document.createElement("p");
            disponivelTexto.className = "reward-card__progress-disponivel";
            disponivelTexto.textContent = "🎁 Você já pode resgatar";
            bloco.appendChild(disponivelTexto);
            return bloco;
        }

        const numeros = document.createElement("p");
        numeros.className = "reward-card__progress-numbers";
        numeros.textContent = `${window.UI.formatarNumero(saldoAtual)} / `
            + `${window.UI.formatarNumero(recompensa.pontos_necessarios)} pontos`;
        bloco.appendChild(numeros);

        const rotuloAcessivel = `${window.UI.formatarNumero(saldoAtual)} de `
            + `${window.UI.formatarNumero(recompensa.pontos_necessarios)} pontos para ${recompensa.nome}`;
        bloco.appendChild(window.UI.criarBarraProgresso(progresso.percentual, rotuloAcessivel));

        const faltamTexto = document.createElement("p");
        faltamTexto.className = "reward-card__progress-missing" + (progresso.quaseLa ? " is-quase-la" : "");
        faltamTexto.textContent = progresso.quaseLa
            ? `🔥 Está quase! Faltam apenas ${window.UI.formatarNumero(progresso.faltam)} pontos`
            : `Faltam ${window.UI.formatarNumero(progresso.faltam)} pontos`;
        bloco.appendChild(faltamTexto);

        return bloco;
    }

    function mostrarVazio() {
        window.UI.definirPlaceholder(
            favoritosListEl,
            "Você ainda não tem favoritos.",
            "p"
        );
        const dica = document.createElement("p");
        dica.className = "dash-section__placeholder";
        dica.textContent = "Toque na estrela de uma recompensa para adicioná-la aqui.";
        favoritosListEl.appendChild(dica);
    }

    function renderizarLista() {
        if (favoritosCarregados.length === 0) {
            mostrarVazio();
            return;
        }

        favoritosListEl.innerHTML = "";
        favoritosCarregados.forEach(function (recompensa) {
            favoritosListEl.appendChild(criarCardFavorito(recompensa));
        });
    }

    async function carregarTudo() {
        const [saldoResultado, favoritosResultado] = await Promise.allSettled([
            window.api("/pontos/saldo"),
            window.api("/favoritos")
        ]);

        saldoConhecido = false;

        if (saldoResultado.status === "fulfilled") {
            saldoAtual = saldoResultado.value.saldo;
            saldoConhecido = true;
            balanceChipEl.textContent = window.UI.formatarNumero(saldoAtual);
        } else {
            balanceChipEl.textContent = "--";
        }

        if (favoritosResultado.status === "rejected") {
            const mensagem = window.UI.mensagemDeErro(favoritosResultado.reason, "Não foi possível carregar seus favoritos agora.");
            window.UI.definirPlaceholder(favoritosListEl, mensagem, "p");
            return;
        }

        favoritosCarregados = favoritosResultado.value;
        renderizarLista();
    }

    carregarTudo();
})();
