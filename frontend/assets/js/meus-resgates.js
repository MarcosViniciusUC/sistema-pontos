/**
 * "Meus Resgates" — histórico dos próprios resgates do cliente, com acesso
 * ao código/QR Code de resgates ainda não utilizados.
 *
 * Segurança: GET /resgates/meus não aceita nenhum identificador de usuário
 * vindo do frontend — o backend usa só o id do próprio JWT (ver
 * redemption.controller.js:listarMeus). Aqui só exibimos o que a API
 * devolve; nenhuma decisão de status/pontos/código é feita no cliente.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const listaEl = document.getElementById("resgates-list");

    // Espelha HORAS_PARA_EXPIRAR de src/services/resgateExpiracao.service.js —
    // só para mostrar a contagem regressiva ao cliente. Quem decide de
    // verdade se um resgate expirou continua sendo o backend, comparando
    // criado_em com NOW() no Postgres a cada chamada (ver seção 9/20 da
    // documentação); esta conta aqui é só uma estimativa de exibição a
    // partir do mesmo criado_em que a API já devolve.
    const HORAS_PARA_EXPIRAR_RESGATE = 5;

    // ==========================================================================
    // Contagem regressiva dos resgates "aguardando utilização" — recalculada
    // a partir de resgate.criado_em (dado real do backend), nunca guardada
    // isolada em memória: um reload sempre parte do mesmo criado_em e chega
    // no mesmo resultado, então não existe estado que possa ficar
    // inconsistente entre uma sessão e outra.
    //
    // Um único setInterval de página (não um por item) atualiza todos os
    // textos a cada 30s — criado uma vez em carregarResgates() e nunca
    // duplicado, porque a lista só é montada uma vez por carregamento de
    // página (sem essa garantia, recarregar a lista empilharia intervalos e
    // vazaria memória).
    // ==========================================================================

    let contadoresAtivos = [];
    let intervaloContagemId = null;

    function calcularExpiracao(resgate) {
        return new Date(new Date(resgate.criado_em).getTime() + HORAS_PARA_EXPIRAR_RESGATE * 60 * 60 * 1000);
    }

    function formatarContagemRegressiva(dataExpiracao) {
        const restanteMs = dataExpiracao.getTime() - Date.now();

        // Zero/negativo não significa necessariamente "já cancelado" agora
        // mesmo — o backend só reprocessa expiração no próximo acesso (ver
        // resgateExpiracao.service.js). Em vez de arriscar dizer "cancelado"
        // sem confirmar com a API, mostra um texto neutro.
        if (restanteMs <= 0) {
            return "Expira a qualquer momento";
        }

        const totalMinutos = Math.ceil(restanteMs / 60000);
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;

        if (horas === 0) {
            return "Expira em " + minutos + "min";
        }

        return "Expira em " + horas + "h" + String(minutos).padStart(2, "0") + "min";
    }

    function formatarHorarioExpiracao(dataExpiracao) {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }).format(dataExpiracao);
    }

    function atualizarContadores() {
        contadoresAtivos = contadoresAtivos.filter(function (contador) {
            if (!document.contains(contador.elemento)) {
                return false;
            }

            contador.elemento.textContent = formatarContagemRegressiva(contador.expiraEm);
            return true;
        });

        // Nada mais para contar (todos os itens visíveis já foram validados,
        // cancelados, ou a página não tem nenhum pendente) — libera o timer
        // em vez de deixá-lo rodando à toa a cada 30s pelo resto da sessão.
        if (contadoresAtivos.length === 0 && intervaloContagemId !== null) {
            clearInterval(intervaloContagemId);
            intervaloContagemId = null;
        }
    }

    function registrarContador(elemento, expiraEm) {
        contadoresAtivos.push({ elemento, expiraEm });

        if (intervaloContagemId === null) {
            intervaloContagemId = setInterval(atualizarContadores, 30000);
        }
    }

    // ==========================================================================
    // Saldo no cabeçalho — função isolada, sem nenhuma relação com a lógica
    // de resgates abaixo (não lê nem escreve nenhuma variável em comum, não
    // afeta o carregamento/erro/status da lista). Mesmo endpoint (GET
    // /pontos/saldo) e mesmo padrão de exibição já usados em
    // dashboard.js/recompensas.js — dá contexto de "quanto eu ainda tenho"
    // ao lado de "o que eu já resgatei".
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

    const ROTULO_STATUS = {
        pendente_validacao: "Aguardando utilização",
        utilizado: "Utilizado",
        cancelado: "Cancelado"
    };

    // Mesmo mapeamento de classes visuais já usado em admin-resgates.js —
    // reaproveita os 3 tratamentos de .status-badge (agora em components.css)
    // em vez de inventar um novo conjunto de cores.
    const CLASSE_BADGE = {
        pendente_validacao: "status-badge--pendente",
        utilizado: "status-badge--aprovado",
        cancelado: "status-badge--recusado"
    };

    // ---- Modal: código do resgate (código + QR Code) ----
    const modalCodigoRecompensaEl = document.getElementById("modal-codigo-recompensa");
    const modalCodigoPontosEl = document.getElementById("modal-codigo-pontos");
    const modalCodigoEmpresaRowEl = document.getElementById("modal-codigo-empresa-row");
    const modalCodigoEmpresaEl = document.getElementById("modal-codigo-empresa");
    const modalCodigoValorEl = document.getElementById("modal-codigo-valor");
    const modalCodigoQrEl = document.getElementById("modal-codigo-qrcode");

    const controladorCodigo = window.UI.criarControladorModal(
        document.getElementById("modal-codigo-overlay")
    );
    document.getElementById("modal-codigo-fechar").addEventListener("click", controladorCodigo.fechar);

    let qrCodeInstancia = null;

    function renderizarQrCode(texto) {
        // Mesma biblioteca (qrcodejs, via CDN) e mesma degradação usada em
        // recompensas.js: se não carregar, o código já aparece como texto.
        if (typeof QRCode === "undefined") {
            modalCodigoQrEl.textContent = "";
            return;
        }

        if (!qrCodeInstancia) {
            modalCodigoQrEl.innerHTML = "";
            qrCodeInstancia = new QRCode(modalCodigoQrEl, {
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

    function abrirModalCodigo(resgate, botaoOrigem) {
        modalCodigoRecompensaEl.textContent = resgate.recompensa_nome;
        modalCodigoPontosEl.textContent = window.UI.formatarNumero(resgate.pontos) + " pontos";

        // Resgates antigos podem não ter empresa definida — esconde a linha
        // inteira em vez de mostrar "null" (mesmo padrão dos cards de
        // recompensa e do modal de sucesso em recompensas.js).
        if (resgate.empresa_nome) {
            modalCodigoEmpresaEl.textContent = resgate.empresa_nome;
            modalCodigoEmpresaRowEl.hidden = false;
        } else {
            modalCodigoEmpresaRowEl.hidden = true;
        }

        modalCodigoValorEl.textContent = resgate.codigo;

        renderizarQrCode(resgate.codigo);

        controladorCodigo.abrir(botaoOrigem);
        document.getElementById("modal-codigo-fechar").focus();
    }

    function criarItemResgate(resgate) {
        const item = document.createElement("li");
        item.className = "resgate-item";

        const header = document.createElement("div");
        header.className = "resgate-item__header";

        const info = document.createElement("div");
        info.className = "resgate-item__info";

        const nome = document.createElement("p");
        nome.className = "resgate-item__nome";
        nome.textContent = resgate.recompensa_nome;
        info.appendChild(nome);

        // Pontos ganham elemento próprio (antes vinham concatenados na
        // mesma frase de data/empresa) para poder ter destaque visual
        // separado — mesmo dado, mesmo campo (resgate.pontos), só exibido
        // em outro lugar do DOM.
        const pontos = document.createElement("p");
        pontos.className = "resgate-item__pontos";
        pontos.textContent = window.UI.formatarNumero(resgate.pontos) + " pontos";
        info.appendChild(pontos);

        const meta = document.createElement("p");
        meta.className = "resgate-item__meta";
        meta.textContent = window.UI.formatarData(resgate.criado_em)
            + (resgate.empresa_nome ? " • " + resgate.empresa_nome : "");
        info.appendChild(meta);

        header.appendChild(info);

        const badge = document.createElement("span");
        badge.className = "status-badge " + (CLASSE_BADGE[resgate.status] || "");
        badge.textContent = ROTULO_STATUS[resgate.status] || resgate.status;
        header.appendChild(badge);

        item.appendChild(header);

        const codigo = document.createElement("p");
        codigo.className = "resgate-item__codigo";
        codigo.textContent = "Código: " + resgate.codigo;
        item.appendChild(codigo);

        // Resgate cancelado (sempre pela expiração automática de 5 horas —
        // não existe outro caminho que cancele um resgate hoje) sempre teve
        // os pontos devolvidos: ver resgateExpiracao.service.js, que nunca
        // cancela sem inserir a movimentação de entrada correspondente na
        // mesma transação. Deixa isso explícito aqui pro cliente não achar
        // que perdeu os pontos.
        if (resgate.status === "cancelado") {
            const nota = document.createElement("p");
            nota.className = "resgate-item__nota";
            nota.textContent = "Pontos devolvidos automaticamente após o prazo de validação (5 horas).";
            item.appendChild(nota);
        }

        if (resgate.status === "pendente_validacao") {
            const expiraEm = calcularExpiracao(resgate);

            const prazo = document.createElement("p");
            prazo.className = "resgate-item__nota";
            prazo.textContent = formatarContagemRegressiva(expiraEm);
            prazo.title = "Expira às " + formatarHorarioExpiracao(expiraEm);
            item.appendChild(prazo);

            registrarContador(prazo, expiraEm);

            const acao = document.createElement("div");
            acao.className = "resgate-item__action";

            const btnVerCodigo = document.createElement("button");
            btnVerCodigo.type = "button";
            btnVerCodigo.className = "btn btn--ghost";
            btnVerCodigo.textContent = "Ver QR Code";
            btnVerCodigo.addEventListener("click", function () {
                abrirModalCodigo(resgate, btnVerCodigo);
            });

            acao.appendChild(btnVerCodigo);
            item.appendChild(acao);
        }

        return item;
    }

    async function carregarResgates() {
        try {
            const resgates = await window.api("/resgates/meus");

            if (resgates.length === 0) {
                window.UI.definirPlaceholder(listaEl, "Você ainda não resgatou nenhuma recompensa.", "li");
                return;
            }

            listaEl.innerHTML = "";
            resgates.forEach(function (resgate) {
                listaEl.appendChild(criarItemResgate(resgate));
            });

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar seus resgates agora.");
            window.UI.definirPlaceholder(listaEl, mensagem, "li");
        }
    }

    carregarResgates();
    carregarSaldo();
})();
