/**
 * Página de recompensas + resgate.
 *
 * Fluxo atual (sem aprovação de admin): ao confirmar, o backend desconta
 * os pontos na hora e devolve um código de reserva único — é esse código
 * (e só ele) que vira o conteúdo do QR Code aqui. Nada de senha, token ou
 * dado pessoal entra no QR.
 *
 * Segurança: o único campo enviado em POST /resgates é recompensa_id.
 * usuario_id, pontos, status e código são decididos inteiramente pelo
 * backend (ver redemption.controller.js) — o frontend nunca envia nem
 * inventa nenhum desses valores.
 *
 * A comparação "saldo x pontos necessários" feita aqui é só UX (evita
 * mostrar como resgatável algo que hoje não dá pra pagar). A validação
 * que realmente vale continua sendo feita pelo backend a cada requisição.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const rewardsListEl = document.getElementById("rewards-list");
    const rewardsTitleEl = document.getElementById("rewards-title");
    const rewardsFiltersEl = document.getElementById("rewards-filters");
    const rewardsSearchInputEl = document.getElementById("rewards-search-input");
    const rewardsSearchClearEl = document.getElementById("rewards-search-clear");
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
        // QRCode vem de um script de CDN (qrcodejs) — se por algum motivo
        // não carregar (rede bloqueada, etc.), degrada graciosamente: o
        // código de reserva já aparece como texto de qualquer forma.
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

    // Estado do filtro por empresa. "todas" é o único valor especial; os
    // demais são sempre o empresa_id (número) de uma empresa que apareceu
    // em pelo menos uma recompensa carregada — nunca um nome fixo.
    let filtroAtual = "todas";
    let recompensasCarregadas = [];
    let empresasAtuais = [];

    // Termo de pesquisa atual (já normalizado — ver normalizarTexto). Some
    // no cliente sobre os dados já carregados; nunca dispara uma requisição
    // nova. Trocar de empresa ou recarregar a lista (ex: depois de um
    // resgate) não reseta a pesquisa — os dois filtros continuam
    // combinados com AND em renderizarListaFiltrada.
    let termoPesquisa = "";

    // ==========================================================================
    // Modal: confirmar resgate
    // ==========================================================================

    function abrirModalConfirmacao(recompensa, botaoOrigem) {
        recompensaSelecionada = recompensa;

        modalRewardName.textContent = recompensa.nome;
        modalRewardPoints.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        // Deixa explícito, com o número real, que o desconto acontece na
        // hora — os pontos já saem do saldo global ao confirmar, não é uma
        // reserva que pode ser cancelada depois.
        modalNoteEl.textContent = "Você vai utilizar " + window.UI.formatarNumero(recompensa.pontos_necessarios)
            + " pontos para resgatar " + recompensa.nome + ". Os pontos são descontados imediatamente"
            + " e um código de reserva será gerado para você apresentar no estabelecimento.";
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

            // Saldo e disponibilidade de todas as recompensas mudaram —
            // atualiza tudo a partir da API antes de comemorar o resgate.
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

        // Recompensas cadastradas antes da estrutura de empresas ainda podem
        // não ter uma definida — nesse caso a linha inteira fica escondida,
        // em vez de mostrar "null" (mesmo padrão dos cards de recompensa).
        if (resgate.empresa_nome) {
            modalSucessoEmpresaEl.textContent = resgate.empresa_nome;
            modalSucessoEmpresaRowEl.hidden = false;
        } else {
            modalSucessoEmpresaRowEl.hidden = true;
        }

        // Confirma explicitamente que o desconto já aconteceu — os pontos
        // não ficam "reservados", já saíram do saldo global nesse momento.
        modalSucessoNotaEl.textContent = window.UI.formatarNumero(resgate.pontos)
            + " pontos foram descontados do seu saldo. Apresente este código no estabelecimento para utilizar sua recompensa.";

        renderizarQrCode(resgate.codigo);

        // Ao fechar, o foco volta para o título da página (o botão que abriu
        // esta modal já não existe mais — a lista foi reconstruída pelo
        // carregarTudo() logo antes de chegarmos aqui).
        controladorSucesso.abrir(rewardsTitleEl);
        document.getElementById("modal-sucesso-fechar").focus();
    }

    // ==========================================================================
    // Filtro por empresa
    // ==========================================================================

    function criarChipFiltro(valor, rotulo) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "filter-chip" + (filtroAtual === valor ? " is-active" : "");
        chip.textContent = rotulo;
        chip.addEventListener("click", function () {
            selecionarFiltro(valor);
        });
        return chip;
    }

    /**
     * empresas vem sempre de GET /empresas (fonte de verdade: empresas
     * ATIVAS cadastradas no sistema) — nunca inferido a partir de quais
     * recompensas existem. Por isso uma empresa ativa sem nenhuma
     * recompensa ainda aparece aqui como filtro (renderizarListaFiltrada
     * mostra um estado vazio amigável nesse caso), e uma empresa
     * desativada some sozinha, sem precisar de nenhuma lógica extra aqui.
     */
    function renderizarFiltros(empresas) {
        // Se a empresa antes selecionada foi desativada nesse meio tempo,
        // volta pra "Todas" em vez de deixar o filtro apontando pra uma
        // opção que não existe mais.
        const filtroAindaExiste = filtroAtual === "todas"
            || empresas.some(function (empresa) { return empresa.id === filtroAtual; });

        if (!filtroAindaExiste) {
            filtroAtual = "todas";
        }

        rewardsFiltersEl.innerHTML = "";

        // "Todas" sempre aparece, independente de quantas empresas existem
        // — comportamento consistente e preparado pra crescer conforme
        // novas empresas forem cadastradas.
        rewardsFiltersEl.appendChild(criarChipFiltro("todas", "Todas"));
        empresas.forEach(function (empresa) {
            rewardsFiltersEl.appendChild(criarChipFiltro(empresa.id, empresa.nome));
        });
    }

    function selecionarFiltro(valor) {
        if (filtroAtual === valor) {
            return;
        }

        filtroAtual = valor;
        renderizarFiltros(empresasAtuais);
        renderizarListaFiltrada();
    }

    // ==========================================================================
    // Pesquisa por nome/descrição
    // ==========================================================================

    // Faixa Unicode das marcas diacríticas combinantes, montada a partir dos
    // code points em vez de caracteres literais (mesmo motivo de
    // src/utils/empresas.js no backend: evitar depender de bytes não-ASCII
    // neste arquivo).
    const REGEX_MARCAS_DIACRITICAS = new RegExp(
        "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
        "g"
    );

    /**
     * Minúsculo e sem acento, pra comparar "oleo"/"ÓLEO"/"óleo" como o
     * mesmo texto. Usada tanto no termo digitado quanto no nome/descrição
     * de cada recompensa antes de comparar — nunca uma comparação direta.
     */
    function normalizarTexto(texto) {
        return (texto || "")
            .normalize("NFD")
            .replace(REGEX_MARCAS_DIACRITICAS, "")
            .toLowerCase()
            .trim();
    }

    function atualizarBotaoLimpar() {
        rewardsSearchClearEl.hidden = rewardsSearchInputEl.value.length === 0;
    }

    rewardsSearchInputEl.addEventListener("input", function () {
        termoPesquisa = rewardsSearchInputEl.value;
        atualizarBotaoLimpar();
        renderizarListaFiltrada();
    });

    rewardsSearchClearEl.addEventListener("click", function () {
        rewardsSearchInputEl.value = "";
        termoPesquisa = "";
        atualizarBotaoLimpar();
        renderizarListaFiltrada();
        rewardsSearchInputEl.focus();
    });

    function renderizarListaFiltrada() {
        const filtradasPorEmpresa = filtroAtual === "todas"
            ? recompensasCarregadas
            : recompensasCarregadas.filter(function (recompensa) {
                return recompensa.empresa_id === filtroAtual;
            });

        // Empresa selecionada + termo pesquisado sempre combinados com AND
        // — a pesquisa nunca "escapa" da empresa escolhida.
        const termoNormalizado = normalizarTexto(termoPesquisa);
        const filtradas = termoNormalizado
            ? filtradasPorEmpresa.filter(function (recompensa) {
                return normalizarTexto(recompensa.nome).includes(termoNormalizado)
                    || normalizarTexto(recompensa.descricao).includes(termoNormalizado);
            })
            : filtradasPorEmpresa;

        if (filtradas.length === 0) {
            let mensagem;

            if (termoNormalizado) {
                mensagem = "Nenhuma recompensa encontrada.";
            } else if (filtroAtual === "todas") {
                mensagem = "Nenhuma recompensa disponível no momento.";
            } else {
                // Empresa ativa sem recompensa — estado vazio amigável em
                // vez de esconder a empresa do filtro.
                mensagem = "Nenhuma recompensa disponível nesta empresa no momento.";
            }

            window.UI.definirPlaceholder(rewardsListEl, mensagem, "p");
            return;
        }

        const ordenadas = ordenarRecompensas(filtradas, saldoConhecido);

        rewardsListEl.innerHTML = "";
        ordenadas.forEach(function (recompensa) {
            rewardsListEl.appendChild(criarCardRecompensa(recompensa, saldoConhecido));
        });
    }

    // ==========================================================================
    // Cards de recompensa
    // ==========================================================================

    // O backend ainda não tem um campo de imagem por recompensa. Enquanto
    // isso não existe, a "imagem" do card é um placeholder puramente visual
    // (gradiente + monograma), gerado no frontend a partir do nome da
    // empresa/recompensa — nunca uma URL inventada que possa quebrar.
    // QUANTIDADE_VARIANTES_MEDIA precisa bater com o número de seletores
    // [data-variant="N"] definidos em dashboard.css.
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

    function criarCardRecompensa(recompensa, saldoConhecido) {
        const disponivel = saldoConhecido && saldoAtual >= recompensa.pontos_necessarios;

        const card = document.createElement("article");
        card.className = "reward-card reward-card--v2" + (disponivel ? "" : " reward-card--indisponivel");

        // Imagem (placeholder) — ver comentário acima.
        const media = document.createElement("div");
        media.className = "reward-card__media";
        media.setAttribute("aria-hidden", "true");
        media.dataset.variant = String(obterVarianteMedia(recompensa.empresa_nome || recompensa.nome || ""));

        const monograma = document.createElement("span");
        monograma.className = "reward-card__monogram";
        monograma.textContent = obterMonogramaRecompensa(recompensa);
        media.appendChild(monograma);
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

        if (!saldoConhecido) {
            const aviso = document.createElement("p");
            aviso.className = "reward-card__falta";
            aviso.textContent = "Não foi possível verificar seu saldo agora";
            body.appendChild(aviso);
        }

        const footer = document.createElement("div");
        footer.className = "reward-card__footer";

        const pontos = document.createElement("span");
        pontos.className = "reward-card__points";
        pontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";
        footer.appendChild(pontos);

        if (disponivel) {
            const btnResgatar = document.createElement("button");
            btnResgatar.type = "button";
            btnResgatar.className = "btn btn--primary reward-card__cta";
            btnResgatar.textContent = "Resgatar";
            btnResgatar.addEventListener("click", function () {
                abrirModalConfirmacao(recompensa, btnResgatar);
            });
            footer.appendChild(btnResgatar);
        } else if (saldoConhecido) {
            const diferenca = recompensa.pontos_necessarios - saldoAtual;
            const faltam = document.createElement("span");
            faltam.className = "reward-card__missing";
            faltam.textContent = `Faltam ${window.UI.formatarNumero(diferenca)} pontos`;
            footer.appendChild(faltam);
        }

        body.appendChild(footer);

        return card;
    }

    /**
     * Disponíveis primeiro (crescente por pontos), depois indisponíveis
     * (também crescente por pontos). Nunca modifica o array recebido da
     * API — sempre ordena uma cópia.
     */
    function ordenarRecompensas(recompensas, saldoConhecido) {
        return recompensas.slice().sort(function (a, b) {
            const aDisponivel = saldoConhecido && saldoAtual >= a.pontos_necessarios;
            const bDisponivel = saldoConhecido && saldoAtual >= b.pontos_necessarios;

            if (aDisponivel !== bDisponivel) {
                return aDisponivel ? -1 : 1;
            }

            return a.pontos_necessarios - b.pontos_necessarios;
        });
    }

    async function carregarTudo() {
        // Promise.allSettled (em vez de Promise.all): uma falha em qualquer
        // uma dessas três chamadas não pode apagar o que as outras já
        // carregaram com sucesso — cada seção falha de forma independente.
        const [saldoResultado, recompensasResultado, empresasResultado] = await Promise.allSettled([
            window.api("/pontos/saldo"),
            window.api("/recompensas"),
            window.api("/empresas")
        ]);

        saldoConhecido = false;

        if (saldoResultado.status === "fulfilled") {
            saldoAtual = saldoResultado.value.saldo;
            saldoConhecido = true;
            balanceChipEl.textContent = window.UI.formatarNumero(saldoAtual);
        } else {
            balanceChipEl.textContent = "--";
        }

        if (recompensasResultado.status === "rejected") {
            const mensagem = window.UI.mensagemDeErro(recompensasResultado.reason, "Não foi possível carregar as recompensas agora.");
            rewardsFiltersEl.innerHTML = "";
            window.UI.definirPlaceholder(rewardsListEl, mensagem, "p");
            return;
        }

        recompensasCarregadas = recompensasResultado.value;

        // Empresas ATIVAS cadastradas no sistema são a fonte de verdade do
        // filtro (GET /empresas) — não as recompensas. Se essa chamada
        // falhar, degrada pra nenhum filtro em vez de quebrar a página; a
        // lista de recompensas (em "Todas") continua funcionando normalmente.
        empresasAtuais = empresasResultado.status === "fulfilled" ? empresasResultado.value : [];

        renderizarFiltros(empresasAtuais);
        renderizarListaFiltrada();
    }

    carregarTudo();
})();
