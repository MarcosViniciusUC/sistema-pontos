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

        const nome = document.createElement("p");
        nome.className = "resgate-item__nome";
        nome.textContent = resgate.recompensa_nome;
        info.appendChild(nome);

        const meta = document.createElement("p");
        meta.className = "resgate-item__meta";
        meta.textContent = window.UI.formatarData(resgate.criado_em) + " • " + window.UI.formatarNumero(resgate.pontos) + " pontos"
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

        if (resgate.status === "pendente_validacao") {
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
})();
