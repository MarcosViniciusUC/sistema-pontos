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
    const tabRecompensasBtn = document.getElementById("tab-recompensas-btn");
    const tabPontosPainel = document.getElementById("tab-pontos-painel");
    const tabValidarPainel = document.getElementById("tab-validar-painel");
    const tabRecompensasPainel = document.getElementById("tab-recompensas-painel");

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

    // Generalizado para N abas (era só um par fixo até a 3ª aba —
    // Recompensas — ser adicionada): cada índice liga um botão ao painel de
    // mesma posição, todos os outros são desativados/escondidos juntos.
    const abas = [
        { botao: tabPontosBtn, painel: tabPontosPainel },
        { botao: tabValidarBtn, painel: tabValidarPainel },
        { botao: tabRecompensasBtn, painel: tabRecompensasPainel }
    ];

    function selecionarAba(indiceAtivo) {
        abas.forEach(function (aba, indice) {
            const ativa = indice === indiceAtivo;

            aba.botao.classList.toggle("is-active", ativa);
            aba.botao.setAttribute("aria-selected", String(ativa));

            if (ativa) {
                aba.botao.removeAttribute("tabindex");
            } else {
                aba.botao.tabIndex = -1;
            }

            aba.painel.hidden = !ativa;
        });

        fecharMenuAbas();
    }

    tabPontosBtn.addEventListener("click", function () { selecionarAba(0); });
    tabValidarBtn.addEventListener("click", function () { selecionarAba(1); });
    tabRecompensasBtn.addEventListener("click", function () {
        selecionarAba(2);
        carregarRecompensasFuncionario();
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
    //
    // Um só modal/câmera/jsQR é reaproveitado para dois propósitos
    // diferentes nesta página (identificar cliente x ler código de
    // resgate): iniciarScanner() recebe o botão que o acionou, o texto do
    // modal e uma função de callback com o que fazer com o texto lido —
    // não existem duas implementações de câmera nem duas lógicas de
    // decodificação, só o que acontece depois de ler é diferente.
    // ==========================================================================

    const abrirScannerBtn = document.getElementById("abrir-scanner-btn");
    const abrirScannerResgateBtn = document.getElementById("abrir-scanner-resgate-btn");
    const scannerVideoEl = document.getElementById("scanner-video");
    const scannerCanvasEl = document.getElementById("scanner-canvas");
    const scannerFecharBtn = document.getElementById("scanner-fechar");
    const scannerTituloEl = document.getElementById("modal-scanner-title");
    const scannerNotaEl = document.getElementById("modal-scanner-nota");
    const scannerCtx = scannerCanvasEl.getContext("2d");

    let streamAtual = null;
    let quadroAnimacao = null;
    let scannerBotaoAtivo = null;
    let aoLerCodigo = null;

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

        if (scannerBotaoAtivo) {
            scannerBotaoAtivo.disabled = false;
            scannerBotaoAtivo = null;
        }
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

        const textoLido = resultado && resultado.data ? resultado.data.trim() : "";

        if (textoLido) {
            // Guarda o callback antes de fechar: controladorScanner.fechar()
            // aciona pararCamera(), que zera scannerBotaoAtivo, mas não mexe
            // em aoLerCodigo.
            const callback = aoLerCodigo;
            controladorScanner.fechar();
            callback(textoLido);
            return;
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    // getUserMedia só existe em "contexto seguro" (HTTPS, ou localhost) —
    // em HTTP normal (ex: acessando pelo IP da rede local no celular), o
    // próprio navegador remove navigator.mediaDevices inteiro, e isso batia
    // na mesma mensagem genérica de "navegador não suportado", o que é
    // enganoso: o navegador suporta câmera, só falta HTTPS. window.isSecureContext
    // é a forma padrão de diferenciar os dois casos.
    function diagnosticarIndisponibilidadeCamera() {
        if (!window.isSecureContext) {
            return "inseguro";
        }

        if (typeof window.jsQR === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return "sem-suporte";
        }

        return null;
    }

    async function iniciarScanner(botao, callback, tituloModal, notaModal, exibidorMensagem, mensagemInseguro, mensagemIndisponivel, mensagemSemPermissao) {
        exibidorMensagem.esconder();

        const motivo = diagnosticarIndisponibilidadeCamera();

        if (motivo === "inseguro") {
            exibidorMensagem.mostrar(mensagemInseguro, "erro");
            return;
        }

        if (motivo === "sem-suporte") {
            exibidorMensagem.mostrar(mensagemIndisponivel, "erro");
            return;
        }

        aoLerCodigo = callback;
        scannerTituloEl.textContent = tituloModal;
        scannerNotaEl.textContent = notaModal;

        botao.disabled = true;

        try {
            streamAtual = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
        } catch (erro) {
            botao.disabled = false;
            exibidorMensagem.mostrar(mensagemSemPermissao, "erro");
            return;
        }

        scannerBotaoAtivo = botao;
        controladorScanner.abrir(botao);
        scannerFecharBtn.focus();

        scannerVideoEl.srcObject = streamAtual;

        try {
            await scannerVideoEl.play();
        } catch (erroPlay) {
            // Autoplay bloqueado por alguma política do navegador — a busca
            // manual/digitação continua disponível.
        }

        quadroAnimacao = requestAnimationFrame(processarQuadro);
    }

    abrirScannerBtn.addEventListener("click", function () {
        iniciarScanner(
            abrirScannerBtn,
            identificarCliente,
            "Ler QR do Cliente",
            "Aponte a câmera para o QR Code do cliente.",
            mensagemIdentificar,
            "A leitura por câmera exige uma conexão segura (HTTPS). Acessando por HTTP nesta rede local, use a busca manual pelo nome do cliente.",
            "Leitura por câmera não está disponível neste navegador. Use a busca manual.",
            "Não foi possível acessar a câmera. Verifique a permissão do navegador ou use a busca manual."
        );
    });

    abrirScannerResgateBtn.addEventListener("click", function () {
        iniciarScanner(
            abrirScannerResgateBtn,
            function (codigoLido) {
                codigoInput.value = codigoLido;
                executarValidacaoResgate(codigoLido);
            },
            "Ler QR do Resgate",
            "Aponte a câmera para o QR Code do resgate.",
            mensagemValidar,
            "A leitura por câmera exige uma conexão segura (HTTPS). Acessando por HTTP nesta rede local, digite o código do resgate manualmente.",
            "Leitura por câmera não está disponível neste navegador. Digite o código manualmente.",
            "Não foi possível acessar a câmera. Verifique a permissão do navegador ou digite o código manualmente."
        );
    });

    // ==========================================================================
    // Validar resgate (POST /resgates/validar) — mesmo endpoint e mesma
    // regra de admin-validar.js. O código chega aqui digitado manualmente
    // ou lido pelo scanner de QR do resgate (ver abrirScannerResgateBtn
    // acima) — as duas vias só preenchem #codigo-input e chamam
    // executarValidacaoResgate() abaixo.
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

    // Única função que fala com POST /resgates/validar nesta página — usada
    // tanto pelo envio manual do formulário quanto pelo scanner de QR do
    // resgate (ver iniciarScanner acima), pra não duplicar a regra de
    // validação em dois lugares. Um código lido por câmera passa exatamente
    // pelo mesmo caminho de um código digitado.
    async function executarValidacaoResgate(codigo) {
        mensagemValidar.esconder();
        resgateDetalhesEl.hidden = true;

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
    }

    formValidar.addEventListener("submit", function (evento) {
        evento.preventDefault();
        executarValidacaoResgate(codigoInput.value.trim());
    });

    // ==========================================================================
    // Aba "Recompensas" — destaque global (⭐), mesma capacidade do admin
    // (ver reward.controller.js:destacar/removerDestaque e admin-recompensas.js,
    // que usa exatamente o mesmo padrão de otimismo + reversão em caso de
    // erro). Sem criar/editar/desativar — isso continua exclusivo do admin.
    //
    // GET /recompensas é o mesmo endpoint já usado por cliente/admin (só
    // authMiddleware, sem roleMiddleware — ver reward.routes.js), então o
    // funcionário já tinha acesso a ele mesmo antes desta fase.
    //
    // Reaproveita as classes .empresa-detalhe__recompensa* (criadas para o
    // modal "Ver mais" de admin-empresas.js) — mesmo formato de linha
    // (imagem/monograma + nome + pontos), só trocando o selo de status por
    // esta estrela.
    // ==========================================================================

    const funcionarioRecompensasContainerEl = document.getElementById("funcionario-recompensas-container");
    let recompensasFuncionarioCarregadas = false;

    function atualizarVisualDestaqueFuncionario(botao, destacada) {
        botao.textContent = destacada ? "⭐" : "☆";
        botao.classList.toggle("star-toggle--ativo", destacada);
        botao.setAttribute("aria-pressed", String(destacada));
        const rotulo = destacada ? "Remover destaque" : "Destacar recompensa";
        botao.setAttribute("aria-label", rotulo);
        botao.title = rotulo;
    }

    function criarBotaoDestaqueFuncionario(recompensa) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "star-toggle";
        atualizarVisualDestaqueFuncionario(botao, recompensa.destacada);

        botao.addEventListener("click", async function () {
            const novoValor = !recompensa.destacada;

            recompensa.destacada = novoValor;
            atualizarVisualDestaqueFuncionario(botao, novoValor);
            botao.disabled = true;

            try {
                const caminho = "/recompensas/" + recompensa.id + (novoValor ? "/destacar" : "/remover-destaque");
                await window.api(caminho, { method: "PATCH" });

            } catch (erro) {
                recompensa.destacada = !novoValor;
                atualizarVisualDestaqueFuncionario(botao, !novoValor);

            } finally {
                botao.disabled = false;
            }
        });

        return botao;
    }

    function criarLinhaRecompensaFuncionario(recompensa) {
        const linha = document.createElement("div");
        linha.className = "empresa-detalhe__recompensa";

        if (recompensa.imagem) {
            const img = document.createElement("img");
            img.className = "empresa-detalhe__recompensa-img";
            img.src = recompensa.imagem;
            img.alt = "";
            linha.appendChild(img);
        } else {
            const semImagem = document.createElement("span");
            semImagem.className = "empresa-detalhe__recompensa-img empresa-detalhe__recompensa-img--vazia";
            semImagem.setAttribute("aria-hidden", "true");
            linha.appendChild(semImagem);
        }

        const info = document.createElement("div");
        info.className = "empresa-detalhe__recompensa-info";

        const nome = document.createElement("p");
        nome.className = "empresa-detalhe__recompensa-nome";
        nome.textContent = recompensa.empresa_nome ? recompensa.nome + " — " + recompensa.empresa_nome : recompensa.nome;

        const pontos = document.createElement("p");
        pontos.className = "empresa-detalhe__recompensa-pontos";
        pontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios) + " pontos";

        info.appendChild(nome);
        info.appendChild(pontos);
        linha.appendChild(info);

        linha.appendChild(criarBotaoDestaqueFuncionario(recompensa));

        return linha;
    }

    // Carregada uma única vez (na primeira vez que a aba é aberta) —
    // recompensa.destacada é atualizada em memória a cada clique na estrela,
    // então reabrir a aba na mesma sessão não precisa buscar de novo.
    async function carregarRecompensasFuncionario() {
        if (recompensasFuncionarioCarregadas) {
            return;
        }
        recompensasFuncionarioCarregadas = true;

        try {
            const recompensas = await window.api("/recompensas");

            if (recompensas.length === 0) {
                window.UI.definirPlaceholder(funcionarioRecompensasContainerEl, "Nenhuma recompensa ativa no momento.", "p");
                return;
            }

            funcionarioRecompensasContainerEl.innerHTML = "";
            recompensas.forEach(function (recompensa) {
                funcionarioRecompensasContainerEl.appendChild(criarLinhaRecompensaFuncionario(recompensa));
            });

        } catch (erro) {
            recompensasFuncionarioCarregadas = false;
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as recompensas agora.");
            window.UI.definirPlaceholder(funcionarioRecompensasContainerEl, mensagem, "p");
        }
    }
})();
