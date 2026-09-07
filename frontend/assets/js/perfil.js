/**
 * Perfil do cliente.
 *
 * Dados do cabeçalho e QR Code vêm de GET /usuarios/me (novo endpoint,
 * mínimo necessário: nome/email/telefone/qr_token do próprio usuário
 * autenticado — antes desta tela não existia nenhuma forma do cliente obter
 * esses dados depois do login, já que o JWT só carrega id e tipo). O QR
 * Code usa exatamente o mesmo qr_token e a mesma lógica qrcodejs já usadas
 * pelo fluxo de identificação de cliente (admin-clientes.js "Ver QR Code") —
 * nenhum identificador novo é gerado aqui.
 *
 * Resumo da conta e atividade recente vêm inteiramente de endpoints que já
 * existiam (GET /pontos/saldo, GET /pontos/historico, GET /resgates/meus) —
 * não foi criado nenhum endpoint de agregação; os totais de pontos
 * recebidos/utilizados são somados aqui a partir da lista completa do
 * histórico, e a quantidade de resgates é o tamanho da lista de
 * GET /resgates/meus.
 *
 * Segurança: todos os endpoints usados aqui já filtram pelo próprio usuário
 * via req.usuario.id no backend — este arquivo nunca envia nem inventa
 * nenhum id de usuário, e a resposta de /usuarios/me nunca inclui senha.
 */
(function () {
    if (!window.UI.protegerPagina()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const nomeEl = document.getElementById("perfil-nome");
    const emailEl = document.getElementById("perfil-email");
    const telefoneEl = document.getElementById("perfil-telefone");

    const qrcodeEl = document.getElementById("perfil-qrcode");
    const codigoEl = document.getElementById("perfil-codigo");
    const copiarBtn = document.getElementById("copiar-codigo-btn");

    const resumoSaldoEl = document.getElementById("resumo-saldo");
    const resumoRecebidosEl = document.getElementById("resumo-recebidos");
    const resumoUtilizadosEl = document.getElementById("resumo-utilizados");
    const resumoResgatesEl = document.getElementById("resumo-resgates");

    const atividadeListEl = document.getElementById("atividade-list");

    // ==========================================================================
    // Cabeçalho + QR Code pessoal
    // ==========================================================================

    let qrCodeInstancia = null;
    let qrTokenAtual = "";

    // Mesma chamada new QRCode(...)/makeCode(...) de admin-clientes.js,
    // recompensas.js e meus-resgates.js — só o tamanho muda (220 em vez de
    // 160, ver .qrcode-container--lg em dashboard.css), pensado para ser
    // escaneado com facilidade pelo funcionário/admin no balcão.
    function renderizarQrCode(texto) {
        if (!qrCodeInstancia) {
            qrcodeEl.innerHTML = "";
            qrCodeInstancia = new QRCode(qrcodeEl, {
                text: texto,
                width: 220,
                height: 220,
                colorDark: "#0B0D0F",
                colorLight: "#FFFFFF"
            });
        } else {
            qrCodeInstancia.makeCode(texto);
        }
    }

    async function carregarPerfil() {
        try {
            const perfil = await window.api("/usuarios/me");

            nomeEl.textContent = perfil.nome;
            emailEl.textContent = perfil.email;

            if (perfil.telefone) {
                telefoneEl.textContent = perfil.telefone;
                telefoneEl.hidden = false;
            } else {
                telefoneEl.hidden = true;
            }

            qrTokenAtual = perfil.qr_token;
            renderizarQrCode(qrTokenAtual);
            codigoEl.textContent = qrTokenAtual;

        } catch (erro) {
            nomeEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível carregar seus dados agora.");
            emailEl.textContent = "";
            telefoneEl.hidden = true;
            codigoEl.textContent = "--";
        }
    }

    copiarBtn.addEventListener("click", async function () {
        if (!qrTokenAtual) {
            return;
        }

        const rotuloOriginal = copiarBtn.textContent;

        try {
            await navigator.clipboard.writeText(qrTokenAtual);
            copiarBtn.textContent = "Copiado!";
        } catch (erro) {
            copiarBtn.textContent = "Não foi possível copiar";
        }

        window.setTimeout(function () {
            copiarBtn.textContent = rotuloOriginal;
        }, 1500);
    });

    // ==========================================================================
    // Atividade recente — mesmo padrão visual (.activity-item) e mesmas
    // funções de dashboard.js:criarItemAtividade/criarIconeAtividade,
    // duplicadas aqui de propósito (mesmo princípio já usado em todo o
    // projeto: cada tela mantém sua própria cópia pequena em vez de extrair
    // um módulo compartilhado só para isto — ver funcionario.js/
    // admin-validar.js para o mesmo padrão com o scanner).
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
        // A descrição vem exatamente como registrada pela API — não
        // inventamos uma origem quando a API não informa nenhuma.
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

    // ==========================================================================
    // Resumo da conta + atividade recente
    // ==========================================================================

    async function carregarResumoEAtividade() {
        // Promise.allSettled: uma falha em uma chamada não apaga o que as
        // outras já carregaram com sucesso — mesmo padrão de
        // dashboard.js:carregarSaldoERecompensas.
        const [saldoResultado, historicoResultado, resgatesResultado] = await Promise.allSettled([
            window.api("/pontos/saldo"),
            window.api("/pontos/historico"),
            window.api("/resgates/meus")
        ]);

        resumoSaldoEl.textContent = saldoResultado.status === "fulfilled"
            ? window.UI.formatarNumero(saldoResultado.value.saldo)
            : "--";

        resumoResgatesEl.textContent = resgatesResultado.status === "fulfilled"
            ? window.UI.formatarNumero(resgatesResultado.value.length)
            : "--";

        if (historicoResultado.status !== "fulfilled") {
            resumoRecebidosEl.textContent = "--";
            resumoUtilizadosEl.textContent = "--";
            window.UI.definirPlaceholder(
                atividadeListEl,
                window.UI.mensagemDeErro(historicoResultado.reason, "Não foi possível carregar sua atividade agora."),
                "li"
            );
            return;
        }

        const movimentacoes = historicoResultado.value;

        let totalRecebido = 0;
        let totalUtilizado = 0;

        movimentacoes.forEach(function (mov) {
            if (mov.tipo === "entrada") {
                totalRecebido += mov.quantidade;
            } else {
                totalUtilizado += mov.quantidade;
            }
        });

        resumoRecebidosEl.textContent = window.UI.formatarNumero(totalRecebido);
        resumoUtilizadosEl.textContent = window.UI.formatarNumero(totalUtilizado);

        if (movimentacoes.length === 0) {
            window.UI.definirPlaceholder(atividadeListEl, "Você ainda não tem movimentações.", "li");
            return;
        }

        atividadeListEl.innerHTML = "";

        movimentacoes.slice(0, 5).forEach(function (mov) {
            atividadeListEl.appendChild(criarItemAtividade(mov));
        });
    }

    carregarPerfil();
    carregarResumoEAtividade();
})();
