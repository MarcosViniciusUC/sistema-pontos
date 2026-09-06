/**
 * Identificar Cliente pelo QR Code individual (GET /usuarios/qr/:qr_token)
 * e lançar pontos para o cliente identificado (POST /pontos/entrada).
 *
 * Este QR é diferente do QR de resgate: ele identifica a PESSOA (para o
 * funcionário/admin reconhecer o cliente e lançar pontos), não um resgate
 * específico. O token em si não contém nome, email, senha nem nenhum outro
 * dado pessoal — só um identificador aleatório gerado pelo backend (ver
 * src/utils/qrTokenUsuario.js).
 *
 * Duas formas de chegar ao mesmo resultado — ler o QR pela câmera ou
 * buscar por nome/email na lista já carregada — terminam sempre na mesma
 * função identificarCliente(), que é a única que fala com o backend. Não
 * há nenhum cálculo de pontos/saldo aqui: tudo vem pronto da API.
 *
 * Segurança: o usuario_id usado em POST /pontos/entrada é sempre
 * clienteIdentificado.id — o id que a própria API devolveu ao identificar o
 * QR. Não existe campo nenhum para digitar um id manualmente, e o saldo
 * mostrado é só informativo (o backend recalcula tudo a cada resposta).
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const buscaInput = document.getElementById("busca-cliente-input");
    const buscaResultadosEl = document.getElementById("busca-resultados-container");
    const mensagemEl = document.getElementById("resultado-mensagem");

    const resultadoEl = document.getElementById("resultado-cliente");
    const resultadoNomeEl = document.getElementById("resultado-nome");
    const resultadoEmailEl = document.getElementById("resultado-email");
    const resultadoTelefoneEl = document.getElementById("resultado-telefone");
    const resultadoSaldoEl = document.getElementById("resultado-saldo");
    const identificarOutroBtn = document.getElementById("identificar-outro-btn");

    const adicionarPontosCardEl = document.getElementById("adicionar-pontos-card");
    const formAdicionarPontos = document.getElementById("form-adicionar-pontos");
    const pontosQuantidadeInput = document.getElementById("pontos-quantidade-input");
    const pontosEmpresaSelect = document.getElementById("pontos-empresa-input");
    const pontosDescricaoInput = document.getElementById("pontos-descricao-input");
    const adicionarPontosBtn = document.getElementById("adicionar-pontos-btn");
    const adicionarPontosLabel = adicionarPontosBtn.querySelector(".btn__label");

    let clientes = [];
    let clienteIdentificado = null;

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

    function mostrarResultado(cliente) {
        clienteIdentificado = cliente;

        resultadoNomeEl.textContent = cliente.nome;
        resultadoEmailEl.textContent = cliente.email;
        resultadoTelefoneEl.textContent = cliente.telefone || "—";
        resultadoSaldoEl.textContent = window.UI.formatarNumero(cliente.saldo) + " pontos";
        resultadoEl.hidden = false;

        pontosQuantidadeInput.value = "";
        pontosEmpresaSelect.value = "";
        pontosDescricaoInput.value = "";
        adicionarPontosCardEl.hidden = false;
    }

    function limparClienteIdentificado() {
        clienteIdentificado = null;
        resultadoEl.hidden = true;
        adicionarPontosCardEl.hidden = true;

        resultadoNomeEl.textContent = "";
        resultadoEmailEl.textContent = "";
        resultadoTelefoneEl.textContent = "";
        resultadoSaldoEl.textContent = "";
        pontosQuantidadeInput.value = "";
        pontosEmpresaSelect.value = "";
        pontosDescricaoInput.value = "";
    }

    // Única função que fala com GET /usuarios/qr/:qr_token — usada tanto
    // pelo scanner quanto pela busca manual, para não duplicar a regra de
    // identificação em dois lugares.
    async function identificarCliente(qrToken) {
        esconderMensagem();
        limparClienteIdentificado();

        if (!qrToken) {
            return;
        }

        try {
            const cliente = await window.api("/usuarios/qr/" + encodeURIComponent(qrToken));
            mostrarResultado(cliente);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível identificar o cliente agora.");
            mostrarMensagem(mensagem, "erro");
        }
    }

    identificarOutroBtn.addEventListener("click", function () {
        limparClienteIdentificado();
        esconderMensagem();
        buscaInput.value = "";
        buscaResultadosEl.innerHTML = "";
        buscaInput.focus();
    });

    // ==========================================================================
    // Adicionar pontos ao cliente identificado
    // ==========================================================================

    formAdicionarPontos.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        if (!clienteIdentificado) {
            return;
        }

        // Number(), não parseInt(): parseInt("10.5") vira 10 silenciosamente
        // (trunca em vez de rejeitar), o que deixaria passar uma quantidade
        // decimal sem avisar o admin. Number("10.5") = 10.5, reprovado pelo
        // Number.isInteger abaixo, então o valor decimal é sempre rejeitado.
        const quantidade = Number(pontosQuantidadeInput.value.trim());
        const empresaId = pontosEmpresaSelect.value ? Number(pontosEmpresaSelect.value) : null;
        const descricao = pontosDescricaoInput.value.trim();

        if (!Number.isInteger(quantidade) || quantidade <= 0) {
            mostrarMensagem("Informe uma quantidade inteira maior que 0.", "erro");
            return;
        }

        // A validação que realmente importa é a do backend — isto aqui só
        // evita uma ida ao servidor com um formulário obviamente incompleto.
        if (!empresaId) {
            mostrarMensagem("Selecione a empresa que concedeu os pontos.", "erro");
            return;
        }

        adicionarPontosBtn.disabled = true;
        adicionarPontosBtn.classList.add("is-loading");
        adicionarPontosLabel.textContent = "Adicionando...";

        try {
            // usuario_id vem só de clienteIdentificado.id — o id que a
            // própria API devolveu ao identificar o QR. Nunca de um campo
            // digitado, e nunca de qualquer outro dado guardado no cliente.
            const movimentacao = await window.api("/pontos/entrada", {
                method: "POST",
                body: {
                    usuario_id: clienteIdentificado.id,
                    quantidade: quantidade,
                    empresa_id: empresaId,
                    descricao: descricao || undefined
                }
            });

            clienteIdentificado.saldo = movimentacao.saldo;
            resultadoSaldoEl.textContent = window.UI.formatarNumero(movimentacao.saldo) + " pontos";

            mostrarMensagem(
                window.UI.formatarNumero(quantidade) + " pontos adicionados. Novo saldo: "
                    + window.UI.formatarNumero(movimentacao.saldo) + ".",
                "sucesso"
            );

            pontosQuantidadeInput.value = "";
            pontosEmpresaSelect.value = "";
            pontosDescricaoInput.value = "";

        } catch (erro) {
            // Erro não mexe no saldo exibido — ele só é atualizado a partir
            // de uma resposta de sucesso do backend.
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível adicionar os pontos agora.");
            mostrarMensagem(mensagem, "erro");

        } finally {
            adicionarPontosBtn.disabled = false;
            adicionarPontosBtn.classList.remove("is-loading");
            adicionarPontosLabel.textContent = "Adicionar pontos";
        }
    });

    // ==========================================================================
    // Busca manual por nome/email (fallback sem câmera)
    // ==========================================================================

    function renderizarResultadosBusca(lista) {
        buscaResultadosEl.innerHTML = "";

        if (lista.length === 0) {
            const vazio = document.createElement("p");
            vazio.className = "dash-section__placeholder";
            vazio.textContent = "Nenhum cliente encontrado.";
            buscaResultadosEl.appendChild(vazio);
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Nome</th>"
            + "<th scope=\"col\">Email</th>"
            + "<th scope=\"col\">Ação</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        // Lista já carregada é pequena o bastante para não precisar de
        // paginação; ainda assim, limita a tabela a um tamanho razoável.
        lista.slice(0, 20).forEach(function (cliente) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = cliente.nome;

            const tdEmail = document.createElement("td");
            tdEmail.textContent = cliente.email;

            const tdAcao = document.createElement("td");
            const btnSelecionar = document.createElement("button");
            btnSelecionar.type = "button";
            btnSelecionar.className = "btn btn--ghost";
            btnSelecionar.textContent = "Selecionar";
            btnSelecionar.addEventListener("click", function () {
                identificarCliente(cliente.qr_token);
            });
            tdAcao.appendChild(btnSelecionar);

            tr.appendChild(tdNome);
            tr.appendChild(tdEmail);
            tr.appendChild(tdAcao);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        buscaResultadosEl.appendChild(wrap);
    }

    buscaInput.addEventListener("input", function () {
        const termo = buscaInput.value.trim().toLowerCase();

        if (!termo) {
            buscaResultadosEl.innerHTML = "";
            return;
        }

        const filtrados = clientes.filter(function (cliente) {
            return cliente.nome.toLowerCase().includes(termo)
                || cliente.email.toLowerCase().includes(termo);
        });

        renderizarResultadosBusca(filtrados);
    });

    async function carregarClientes() {
        try {
            const usuarios = await window.api("/usuarios");
            clientes = usuarios.filter(function (u) {
                return u.tipo === "cliente";
            });

        } catch (erro) {
            // A busca manual fica indisponível, mas o scanner de QR continua
            // funcionando normalmente (não depende desta lista).
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar a lista de clientes para busca.");
            mostrarMensagem(mensagem, "erro");
        }
    }

    // Carregada uma vez e reaproveitada sempre que o card de "Adicionar
    // pontos" aparece — GET /empresas é admin/funcionário, só ativas.
    async function carregarEmpresas() {
        try {
            const empresas = await window.api("/empresas");

            empresas.forEach(function (empresa) {
                const option = document.createElement("option");
                option.value = empresa.id;
                option.textContent = empresa.nome;
                pontosEmpresaSelect.appendChild(option);
            });

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as empresas agora.");
            mostrarMensagem(mensagem, "erro");
        }
    }

    carregarClientes();
    carregarEmpresas();

    // ==========================================================================
    // Scanner de QR Code (câmera) — mesmo padrão técnico do scanner de
    // resgate em admin-validar.js.
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

        const qrTokenLido = resultado && resultado.data ? resultado.data.trim() : "";

        if (qrTokenLido) {
            // Fecha (já para a câmera via aoFechar) antes de identificar —
            // só uma leitura pode disparar uma consulta.
            controladorScanner.fechar();
            identificarCliente(qrTokenLido);
            return;
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    async function iniciarScanner() {
        esconderMensagem();

        if (typeof window.jsQR === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarMensagem("Leitura por câmera não está disponível neste navegador. Use a busca manual.", "erro");
            return;
        }

        abrirScannerBtn.disabled = true;

        try {
            streamAtual = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
        } catch (erro) {
            abrirScannerBtn.disabled = false;
            mostrarMensagem("Não foi possível acessar a câmera. Verifique a permissão do navegador ou use a busca manual.", "erro");
            return;
        }

        controladorScanner.abrir(abrirScannerBtn);
        scannerFecharBtn.focus();

        scannerVideoEl.srcObject = streamAtual;

        try {
            await scannerVideoEl.play();
        } catch (erroPlay) {
            // Autoplay bloqueado por alguma política do navegador (raro com
            // muted + playsinline) — a busca manual continua disponível.
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    abrirScannerBtn.addEventListener("click", iniciarScanner);
})();
