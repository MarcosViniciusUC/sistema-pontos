/**
 * Validação de resgate por código (POST /resgates/validar).
 *
 * O código pode ser digitado manualmente ou lido por câmera (scanner de QR
 * abaixo). As duas formas só preenchem o mesmo campo #codigo-input e chamam
 * a mesma função executarValidacao() — não existe uma segunda regra de
 * validação para o QR, e o backend continua sendo a única autoridade sobre
 * o resultado.
 *
 * Scanner: usa jsQR (via CDN) para decodificar frames capturados da câmera
 * através de getUserMedia + <video> + <canvas> oculto. Sem biblioteca de UI
 * pronta — só o necessário para ler um frame, extrair o texto do QR e parar
 * a câmera logo em seguida.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const form = document.getElementById("form-validar");
    const codigoInput = document.getElementById("codigo-input");
    const validarBtn = document.getElementById("validar-btn");
    const validarLabel = validarBtn.querySelector(".btn__label");
    const mensagemEl = document.getElementById("resultado-mensagem");

    const detalhesEl = document.getElementById("resultado-detalhes");
    const recompensaEl = document.getElementById("resultado-recompensa");
    const pontosEl = document.getElementById("resultado-pontos");
    const codigoResultadoEl = document.getElementById("resultado-codigo");

    function mostrarMensagem(texto, tipo) {
        mensagemEl.innerHTML = "";

        const icone = document.createElement("span");
        icone.className = "form-message__icon";
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = tipo === "erro" ? "!" : "✓";

        const spanTexto = document.createElement("span");
        spanTexto.textContent = texto;

        mensagemEl.appendChild(icone);
        mensagemEl.appendChild(spanTexto);
        mensagemEl.className = "form-message form-message--" + tipo;
        mensagemEl.hidden = false;
        mensagemEl.focus();
    }

    function esconderMensagem() {
        mensagemEl.hidden = true;
        mensagemEl.textContent = "";
    }

    function definirCarregando(carregando) {
        validarBtn.disabled = carregando;
        validarBtn.classList.toggle("is-loading", carregando);
        validarLabel.textContent = carregando ? "Validando..." : "Validar resgate";
    }

    function mostrarDetalhes(resgate) {
        recompensaEl.textContent = resgate.recompensa_nome || "—";
        pontosEl.textContent = window.UI.formatarNumero(resgate.pontos);
        codigoResultadoEl.textContent = resgate.codigo;
        detalhesEl.hidden = false;
    }

    // Única função que fala com POST /resgates/validar — usada tanto pelo
    // submit manual do formulário quanto pelo scanner, para não duplicar a
    // regra de validação em dois lugares.
    async function executarValidacao(codigo) {
        esconderMensagem();
        detalhesEl.hidden = true;

        if (!codigo) {
            mostrarMensagem("Informe o código do resgate.", "erro");
            return;
        }

        definirCarregando(true);

        try {
            const resgate = await window.api("/resgates/validar", {
                method: "POST",
                body: { codigo }
            });

            mostrarMensagem("Resgate validado com sucesso.", "sucesso");
            mostrarDetalhes(resgate);

            codigoInput.value = "";
            codigoInput.focus();

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível validar o resgate agora.");
            mostrarMensagem(mensagem, "erro");

        } finally {
            definirCarregando(false);
        }
    }

    form.addEventListener("submit", function (evento) {
        evento.preventDefault();
        executarValidacao(codigoInput.value.trim());
    });

    // ==========================================================================
    // Scanner de QR Code (câmera)
    // ==========================================================================

    const abrirScannerBtn = document.getElementById("abrir-scanner-btn");
    const scannerVideoEl = document.getElementById("scanner-video");
    const scannerCanvasEl = document.getElementById("scanner-canvas");
    const scannerFecharBtn = document.getElementById("scanner-fechar");
    const scannerCtx = scannerCanvasEl.getContext("2d");

    let streamAtual = null;
    let quadroAnimacao = null;

    const controladorScanner = window.UI.criarControladorModal(
        document.getElementById("modal-scanner-overlay"),
        { aoFechar: pararCamera }
    );
    scannerFecharBtn.addEventListener("click", controladorScanner.fechar);

    function pararCamera() {
        if (quadroAnimacao) {
            cancelAnimationFrame(quadroAnimacao);
            quadroAnimacao = null;
        }

        if (streamAtual) {
            streamAtual.getTracks().forEach(function (faixa) {
                faixa.stop();
            });
            streamAtual = null;
        }

        scannerVideoEl.srcObject = null;
        abrirScannerBtn.disabled = false;
    }

    function processarQuadro() {
        // Dimensões só ficam disponíveis depois que os metadados do vídeo
        // carregam — até lá, só continua tentando no próximo frame.
        if (!scannerVideoEl.videoWidth) {
            quadroAnimacao = requestAnimationFrame(processarQuadro);
            return;
        }

        scannerCanvasEl.width = scannerVideoEl.videoWidth;
        scannerCanvasEl.height = scannerVideoEl.videoHeight;
        scannerCtx.drawImage(scannerVideoEl, 0, 0, scannerCanvasEl.width, scannerCanvasEl.height);

        const imagem = scannerCtx.getImageData(0, 0, scannerCanvasEl.width, scannerCanvasEl.height);
        const resultado = window.jsQR(imagem.data, imagem.width, imagem.height, {
            inversionAttempts: "dontInvert"
        });

        const codigoLido = resultado && resultado.data ? resultado.data.trim() : "";

        if (codigoLido) {
            // Fecha (o que já para a câmera via aoFechar) e não agenda mais
            // nenhum frame — só uma leitura pode disparar a validação.
            controladorScanner.fechar();
            codigoInput.value = codigoLido;
            executarValidacao(codigoLido);
            return;
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    async function iniciarScanner() {
        esconderMensagem();

        if (typeof window.jsQR === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarMensagem("Leitura por câmera não está disponível neste navegador. Digite o código manualmente.", "erro");
            return;
        }

        abrirScannerBtn.disabled = true;

        try {
            streamAtual = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
        } catch (erro) {
            abrirScannerBtn.disabled = false;
            mostrarMensagem("Não foi possível acessar a câmera. Verifique a permissão do navegador ou digite o código manualmente.", "erro");
            return;
        }

        controladorScanner.abrir(abrirScannerBtn);
        scannerFecharBtn.focus();

        scannerVideoEl.srcObject = streamAtual;

        try {
            await scannerVideoEl.play();
        } catch (erroPlay) {
            // Autoplay bloqueado por alguma política do navegador (raro com
            // muted + playsinline). O usuário ainda pode fechar a câmera e
            // digitar o código manualmente.
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    abrirScannerBtn.addEventListener("click", iniciarScanner);
})();
