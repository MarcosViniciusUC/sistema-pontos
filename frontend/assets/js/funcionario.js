/**
 * Área do funcionário: identificar cliente (QR ou busca), adicionar pontos
 * e validar resgate — os três fluxos operacionais liberados para este
 * papel (ver roleMiddleware("admin", "funcionario") nas rotas usadas
 * aqui: GET /usuarios/qr/:qr_token, GET /usuarios/buscar-cliente,
 * POST /pontos/entrada, POST /resgates/validar).
 *
 * Estrutura espelha admin-identificar-cliente.js e admin-validar.js
 * (mesmo padrão de scanner, mesma função única por operação) — duplicada
 * de propósito em vez de compartilhada, para não mexer nas páginas de
 * admin já testadas só para extrair um módulo comum.
 *
 * Diferenças de permissão desta tela em relação à do admin:
 *   - a busca manual usa GET /usuarios/buscar-cliente (não GET /usuarios,
 *     que é admin-only e devolve a lista completa/administrativa);
 *   - o cliente identificado mostra nome/telefone/saldo — o backend nem
 *     devolve email para funcionário (ver user.controller.js:buscarPorQrToken);
 *   - não há acesso a criar/editar recompensas, listar todos os resgates,
 *     nem a nenhuma outra tela administrativa.
 */
(function () {
    if (!window.UI.protegerPaginaFuncionario()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");

    // ==========================================================================
    // Abas — só troca qual painel aparece; nenhuma lógica de identificação,
    // pontos ou validação muda por causa disto.
    // ==========================================================================

    const tabsMenuBtn = document.getElementById("tabs-menu-btn");
    const tabsMenu = document.getElementById("tabs-menu");
    const tabPontosBtn = document.getElementById("tab-pontos-btn");
    const tabValidarBtn = document.getElementById("tab-validar-btn");
    const tabPontosPainel = document.getElementById("tab-pontos-painel");
    const tabValidarPainel = document.getElementById("tab-validar-painel");

    // Só existe efeito visual no celular (no desktop o CSS mantém .tabs
    // sempre visível independente desta classe — ver admin.css).
    function fecharMenuAbas() {
        tabsMenu.classList.remove("is-open");
        tabsMenuBtn.setAttribute("aria-expanded", "false");
    }

    tabsMenuBtn.addEventListener("click", function () {
        const vaiAbrir = !tabsMenu.classList.contains("is-open");
        tabsMenu.classList.toggle("is-open", vaiAbrir);
        tabsMenuBtn.setAttribute("aria-expanded", String(vaiAbrir));
    });

    function selecionarAba(botaoAtivo, painelAtivo, botaoInativo, painelInativo) {
        botaoAtivo.classList.add("is-active");
        botaoAtivo.setAttribute("aria-selected", "true");
        botaoAtivo.removeAttribute("tabindex");

        botaoInativo.classList.remove("is-active");
        botaoInativo.setAttribute("aria-selected", "false");
        botaoInativo.tabIndex = -1;

        painelAtivo.hidden = false;
        painelInativo.hidden = true;

        fecharMenuAbas();
    }

    tabPontosBtn.addEventListener("click", function () {
        selecionarAba(tabPontosBtn, tabPontosPainel, tabValidarBtn, tabValidarPainel);
    });

    tabValidarBtn.addEventListener("click", function () {
        selecionarAba(tabValidarBtn, tabValidarPainel, tabPontosBtn, tabPontosPainel);
    });

    // ==========================================================================
    // Identificar cliente
    // ==========================================================================

    // Uma única implementação de "mostrar/esconder mensagem", reaproveitada
    // pelas 3 áreas (identificar, adicionar pontos, validar resgate) — cada
    // uma com seu próprio elemento, para o feedback aparecer sempre perto da
    // ação que o gerou, em vez de uma caixa de mensagem única lá no topo da
    // página.
    function criarExibidorMensagem(elemento) {
        function mostrar(texto, tipo) {
            elemento.innerHTML = "";

            const icone = document.createElement("span");
            icone.className = "form-message__icon";
            icone.setAttribute("aria-hidden", "true");
            icone.textContent = tipo === "erro" ? "!" : "✓";

            const spanTexto = document.createElement("span");
            spanTexto.textContent = texto;

            elemento.appendChild(icone);
            elemento.appendChild(spanTexto);
            elemento.className = "form-message form-message--" + tipo;
            elemento.hidden = false;
            elemento.focus();
        }

        function esconder() {
            elemento.hidden = true;
            elemento.textContent = "";
        }

        return { mostrar, esconder };
    }

    const buscaInput = document.getElementById("busca-cliente-input");
    const buscaResultadosEl = document.getElementById("busca-resultados-container");
    const mensagemIdentificar = criarExibidorMensagem(document.getElementById("resultado-mensagem"));

    const resultadoEl = document.getElementById("resultado-cliente");
    const resultadoNomeEl = document.getElementById("resultado-nome");
    const resultadoTelefoneEl = document.getElementById("resultado-telefone");
    const resultadoSaldoEl = document.getElementById("resultado-saldo");
    const identificarOutroBtn = document.getElementById("identificar-outro-btn");

    const adicionarPontosVazioEl = document.getElementById("adicionar-pontos-vazio");
    const adicionarPontosCardEl = document.getElementById("adicionar-pontos-card");
    const adicionarPontosClienteNomeEl = document.getElementById("adicionar-pontos-cliente-nome");
    const formAdicionarPontos = document.getElementById("form-adicionar-pontos");
    const pontosQuantidadeInput = document.getElementById("pontos-quantidade-input");
    const pontosEmpresaSelect = document.getElementById("pontos-empresa-input");
    const pontosDescricaoInput = document.getElementById("pontos-descricao-input");
    const mensagemPontos = criarExibidorMensagem(document.getElementById("adicionar-pontos-mensagem"));
    const adicionarPontosBtn = document.getElementById("adicionar-pontos-btn");
    const adicionarPontosLabel = adicionarPontosBtn.querySelector(".btn__label");

    let clienteIdentificado = null;
    let buscaEmAndamento = null;

    function mostrarResultado(cliente) {
        clienteIdentificado = cliente;

        resultadoNomeEl.textContent = cliente.nome;
        resultadoTelefoneEl.textContent = cliente.telefone || "—";
        resultadoSaldoEl.textContent = window.UI.formatarNumero(cliente.saldo) + " pontos";
        resultadoEl.hidden = false;

        adicionarPontosClienteNomeEl.textContent = cliente.nome;
        mensagemPontos.esconder();
        pontosQuantidadeInput.value = "";
        pontosEmpresaSelect.value = "";
        pontosDescricaoInput.value = "";
        adicionarPontosVazioEl.hidden = true;
        adicionarPontosCardEl.hidden = false;
    }

    function limparClienteIdentificado() {
        clienteIdentificado = null;
        resultadoEl.hidden = true;

        resultadoNomeEl.textContent = "";
        resultadoTelefoneEl.textContent = "";
        resultadoSaldoEl.textContent = "";

        mensagemPontos.esconder();
        adicionarPontosClienteNomeEl.textContent = "";
        pontosQuantidadeInput.value = "";
        pontosEmpresaSelect.value = "";
        pontosDescricaoInput.value = "";
        adicionarPontosCardEl.hidden = true;
        adicionarPontosVazioEl.hidden = false;
    }

    // Única função que fala com GET /usuarios/qr/:qr_token — usada tanto
    // pelo scanner quanto pela busca manual.
    async function identificarCliente(qrToken) {
        mensagemIdentificar.esconder();
        limparClienteIdentificado();

        if (!qrToken) {
            return;
        }

        try {
            const cliente = await window.api("/usuarios/qr/" + encodeURIComponent(qrToken));
            mostrarResultado(cliente);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível identificar o cliente agora.");
            mensagemIdentificar.mostrar(mensagem, "erro");
        }
    }

    identificarOutroBtn.addEventListener("click", function () {
        limparClienteIdentificado();
        mensagemIdentificar.esconder();
        buscaInput.value = "";
        buscaResultadosEl.innerHTML = "";
        buscaInput.focus();
    });

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
            mensagemIdentificar.mostrar(mensagem, "erro");
        }
    }

    carregarEmpresas();

    // ==========================================================================
    // Adicionar pontos ao cliente identificado
    // ==========================================================================

    formAdicionarPontos.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        if (!clienteIdentificado) {
            return;
        }

        // Number(), não parseInt(): parseInt("10.5") trunca pra 10 em vez de
        // rejeitar — Number("10.5") = 10.5, reprovado pelo Number.isInteger.
        const quantidade = Number(pontosQuantidadeInput.value.trim());
        const empresaId = pontosEmpresaSelect.value ? Number(pontosEmpresaSelect.value) : null;
        const descricao = pontosDescricaoInput.value.trim();

        if (!Number.isInteger(quantidade) || quantidade <= 0) {
            mensagemPontos.mostrar("Informe uma quantidade inteira maior que 0.", "erro");
            return;
        }

        // A validação que realmente importa é a do backend — isto aqui só
        // evita uma ida ao servidor com um formulário obviamente incompleto.
        if (!empresaId) {
            mensagemPontos.mostrar("Selecione a empresa que concedeu os pontos.", "erro");
            return;
        }

        adicionarPontosBtn.disabled = true;
        adicionarPontosBtn.classList.add("is-loading");
        adicionarPontosLabel.textContent = "Adicionando...";

        try {
            // usuario_id vem só de clienteIdentificado.id — o id que a
            // própria API devolveu ao identificar o cliente. Nunca de um
            // campo digitado.
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

            mensagemPontos.mostrar(
                window.UI.formatarNumero(quantidade) + " pontos adicionados. Novo saldo: "
                    + window.UI.formatarNumero(movimentacao.saldo) + " pontos.",
                "sucesso"
            );

            pontosQuantidadeInput.value = "";
            pontosEmpresaSelect.value = "";
            pontosDescricaoInput.value = "";

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível adicionar os pontos agora.");
            mensagemPontos.mostrar(mensagem, "erro");

        } finally {
            adicionarPontosBtn.disabled = false;
            adicionarPontosBtn.classList.remove("is-loading");
            adicionarPontosLabel.textContent = "Adicionar pontos";
        }
    });

    // ==========================================================================
    // Busca manual por nome/email (GET /usuarios/buscar-cliente — não
    // GET /usuarios, que é admin-only e devolve a lista administrativa
    // completa de todos os usuários).
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

        lista.forEach(function (cliente) {
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

    // Busca no backend a cada digitação (debounce simples) em vez de
    // carregar a lista inteira de clientes de uma vez — é exatamente o que
    // GET /usuarios/buscar-cliente existe para permitir sem abrir a listagem
    // administrativa completa para o funcionário.
    let debounceId = null;

    buscaInput.addEventListener("input", function () {
        const termo = buscaInput.value.trim();

        window.clearTimeout(debounceId);

        if (!termo) {
            buscaResultadosEl.innerHTML = "";
            return;
        }

        debounceId = window.setTimeout(async function () {
            const idDestaBusca = {};
            buscaEmAndamento = idDestaBusca;

            try {
                const clientes = await window.api("/usuarios/buscar-cliente?termo=" + encodeURIComponent(termo));

                // Se o usuário já digitou algo novo enquanto esta busca
                // estava em andamento, ignora um resultado desatualizado.
                if (buscaEmAndamento === idDestaBusca) {
                    renderizarResultadosBusca(clientes);
                }

            } catch (erro) {
                if (buscaEmAndamento === idDestaBusca) {
                    const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível buscar clientes agora.");
                    mensagemIdentificar.mostrar(mensagem, "erro");
                }
            }
        }, 300);
    });

    // ==========================================================================
    // Scanner de QR Code (câmera) — mesmo padrão técnico de
    // admin-identificar-cliente.js.
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
            controladorScanner.fechar();
            identificarCliente(qrTokenLido);
            return;
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    async function iniciarScanner() {
        mensagemIdentificar.esconder();

        if (typeof window.jsQR === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mensagemIdentificar.mostrar("Leitura por câmera não está disponível neste navegador. Use a busca manual.", "erro");
            return;
        }

        abrirScannerBtn.disabled = true;

        try {
            streamAtual = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
        } catch (erro) {
            abrirScannerBtn.disabled = false;
            mensagemIdentificar.mostrar("Não foi possível acessar a câmera. Verifique a permissão do navegador ou use a busca manual.", "erro");
            return;
        }

        controladorScanner.abrir(abrirScannerBtn);
        scannerFecharBtn.focus();

        scannerVideoEl.srcObject = streamAtual;

        try {
            await scannerVideoEl.play();
        } catch (erroPlay) {
            // Autoplay bloqueado por alguma política do navegador — a busca
            // manual continua disponível.
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    abrirScannerBtn.addEventListener("click", iniciarScanner);

    // ==========================================================================
    // Validar resgate (POST /resgates/validar) — mesmo endpoint e mesma
    // regra de admin-validar.js, só o formulário manual (sem scanner de
    // resgate nesta tela, pra manter a página simples).
    // ==========================================================================

    const formValidar = document.getElementById("form-validar");
    const codigoInput = document.getElementById("codigo-input");
    const validarBtn = document.getElementById("validar-btn");
    const validarLabel = validarBtn.querySelector(".btn__label");
    const mensagemValidar = criarExibidorMensagem(document.getElementById("validar-mensagem"));

    const resgateDetalhesEl = document.getElementById("resgate-detalhes");
    const resgateRecompensaEl = document.getElementById("resgate-recompensa");
    const resgatePontosEl = document.getElementById("resgate-pontos");
    const resgateCodigoEl = document.getElementById("resgate-codigo");

    function mostrarDetalhesResgate(resgate) {
        resgateRecompensaEl.textContent = resgate.recompensa_nome || "—";
        resgatePontosEl.textContent = window.UI.formatarNumero(resgate.pontos);
        resgateCodigoEl.textContent = resgate.codigo;
        resgateDetalhesEl.hidden = false;
    }

    formValidar.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        mensagemValidar.esconder();
        resgateDetalhesEl.hidden = true;

        const codigo = codigoInput.value.trim();

        if (!codigo) {
            mensagemValidar.mostrar("Informe o código do resgate.", "erro");
            return;
        }

        validarBtn.disabled = true;
        validarBtn.classList.add("is-loading");
        validarLabel.textContent = "Validando...";

        try {
            const resgate = await window.api("/resgates/validar", {
                method: "POST",
                body: { codigo }
            });

            mensagemValidar.mostrar("Resgate validado com sucesso.", "sucesso");
            mostrarDetalhesResgate(resgate);

            codigoInput.value = "";
            codigoInput.focus();

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível validar o resgate agora.");
            mensagemValidar.mostrar(mensagem, "erro");

        } finally {
            validarBtn.disabled = false;
            validarBtn.classList.remove("is-loading");
            validarLabel.textContent = "Validar resgate";
        }
    });
})();
