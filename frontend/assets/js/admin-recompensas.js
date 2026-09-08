/**
 * Gerenciamento de recompensas (painel admin).
 *
 * Usa GET /recompensas/admin (admin-only) em vez de GET /recompensas — essa
 * variante devolve ativas E inativas, então o admin consegue reativar uma
 * recompensa desativada. O catálogo do cliente/funcionário continua em
 * GET /recompensas, sem nenhuma mudança (só ativo=true).
 *
 * Status muda exclusivamente por DELETE /recompensas/:id (desativar) e
 * PATCH /recompensas/:id/reativar — PUT /recompensas/:id não aceita mais
 * um campo "ativo", para não ter dois caminhos diferentes mexendo na
 * mesma coisa.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("recompensas-container");
    const pageMessageEl = document.getElementById("page-message");

    // ---- Modal: criar/editar ----
    const formRecompensa = document.getElementById("form-recompensa");
    const modalRecompensaTitleEl = document.getElementById("modal-recompensa-title");
    const nomeInput = document.getElementById("recompensa-nome");
    const descricaoInput = document.getElementById("recompensa-descricao");
    const pontosInput = document.getElementById("recompensa-pontos");
    const empresaSelect = document.getElementById("recompensa-empresa");
    const modalRecompensaErrorEl = document.getElementById("modal-recompensa-error");
    const modalRecompensaConfirmarBtn = document.getElementById("modal-recompensa-confirmar");
    const modalRecompensaConfirmarLabel = modalRecompensaConfirmarBtn.querySelector(".btn__label");

    const imagemCampoEl = document.getElementById("recompensa-imagem-campo");
    const imagemInput = document.getElementById("recompensa-imagem");
    const imagemErroEl = document.getElementById("recompensa-imagem-erro");
    const imagemPreviewWrapEl = document.getElementById("recompensa-imagem-preview-wrap");
    const imagemPreviewImgEl = document.getElementById("recompensa-imagem-preview");
    const imagemAjustarBtn = document.getElementById("recompensa-imagem-ajustar");
    const imagemRemoverBtn = document.getElementById("recompensa-imagem-remover");
    const modalRecompensaAcoesEl = document.getElementById("modal-recompensa-acoes");

    const imagemEditorWrapEl = document.getElementById("recompensa-imagem-editor-wrap");
    const imagemEditorViewportEl = document.getElementById("recompensa-imagem-editor-viewport");
    const imagemEditorImgEl = document.getElementById("recompensa-imagem-editor-img");
    const imagemEditorZoomEl = document.getElementById("recompensa-imagem-editor-zoom");
    const imagemEditorResetarBtn = document.getElementById("recompensa-imagem-editor-resetar");
    const imagemEditorCancelarBtn = document.getElementById("recompensa-imagem-editor-cancelar");
    const imagemEditorAplicarBtn = document.getElementById("recompensa-imagem-editor-aplicar");

    // Enquanto o editor de recorte está aberto, Escape/clique-fora não devem
    // fechar a modal inteira por baixo dele — mesma trava já usada pra não
    // fechar durante "Salvando..." (podeFechar).
    let editorAberto = false;

    const controladorRecompensa = window.UI.criarControladorModal(
        document.getElementById("modal-recompensa-overlay"),
        { podeFechar: function () { return !modalRecompensaConfirmarBtn.disabled && !editorAberto; } }
    );
    document.getElementById("modal-recompensa-cancelar").addEventListener("click", controladorRecompensa.fechar);

    // ---- Modal: confirmar desativação ----
    const modalDesativarNomeEl = document.getElementById("modal-desativar-nome");
    const modalDesativarErrorEl = document.getElementById("modal-desativar-error");
    const modalDesativarConfirmarBtn = document.getElementById("modal-desativar-confirmar");
    const modalDesativarConfirmarLabel = modalDesativarConfirmarBtn.querySelector(".btn__label");

    const controladorDesativar = window.UI.criarControladorModal(
        document.getElementById("modal-desativar-overlay"),
        { podeFechar: function () { return !modalDesativarConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-desativar-cancelar").addEventListener("click", controladorDesativar.fechar);

    // ---- Modal: confirmar reativação ----
    const modalReativarNomeEl = document.getElementById("modal-reativar-nome");
    const modalReativarErrorEl = document.getElementById("modal-reativar-error");
    const modalReativarConfirmarBtn = document.getElementById("modal-reativar-confirmar");
    const modalReativarConfirmarLabel = modalReativarConfirmarBtn.querySelector(".btn__label");

    const controladorReativar = window.UI.criarControladorModal(
        document.getElementById("modal-reativar-overlay"),
        { podeFechar: function () { return !modalReativarConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-reativar-cancelar").addEventListener("click", controladorReativar.fechar);

    let modoFormulario = "criar";
    let recompensaEmEdicao = null;
    let recompensaParaDesativar = null;
    let recompensaParaReativar = null;

    // ==========================================================================
    // Imagem da recompensa — sempre opcional. `imagemPendente` guarda o que
    // fazer com a foto ao salvar:
    //   undefined = não mexer (mantém a foto atual ao editar / sem foto ao criar)
    //   null      = remover a foto atual
    //   string    = nova imagem (data URL), já recortada/comprimida
    // Nunca enviamos o arquivo original nem uma foto sem passar pelo editor
    // de recorte abaixo — só o recorte final (gerado num <canvas>) vira
    // base64, pra manter o payload pequeno (limite de body de /recompensas
    // é 6MB, ver server.js) e o card do cliente sempre com o mesmo
    // enquadramento 4:3, não importa a proporção da foto original.
    // ==========================================================================

    const RECORTE_LARGURA = 1000;
    const RECORTE_ALTURA = 750; // 4:3, mesma proporção de .reward-card__media
    const IMAGEM_QUALIDADE_JPEG = 0.82;
    const IMAGEM_ARQUIVO_MAXIMO = 15 * 1024 * 1024; // 15MB de arquivo original, antes do recorte
    const ZOOM_MAXIMO = 3; // 300% do "cover" mínimo (a foto sempre preenche a moldura)

    let imagemPendente;
    let imagemAntesDoEditor;

    function mostrarErroImagem(texto) {
        imagemErroEl.textContent = texto;
        imagemErroEl.hidden = false;
    }

    function esconderErroImagem() {
        imagemErroEl.hidden = true;
        imagemErroEl.textContent = "";
    }

    function exibirPreview(src) {
        imagemPreviewImgEl.src = src;
        imagemPreviewWrapEl.hidden = false;
    }

    function esconderPreview() {
        imagemPreviewImgEl.src = "";
        imagemPreviewWrapEl.hidden = true;
    }

    function lerArquivoComoDataUrl(arquivo) {
        return new Promise(function (resolve, reject) {
            const leitor = new FileReader();

            leitor.onerror = function () {
                reject(new Error("Não foi possível ler o arquivo."));
            };

            leitor.onload = function () {
                resolve(leitor.result);
            };

            leitor.readAsDataURL(arquivo);
        });
    }

    // --------------------------------------------------------------------------
    // Editor de recorte: arrastar (pointer events, funciona com mouse e toque)
    // + zoom (range). O <img> do editor é posicionado com left/top/width/height
    // (px absolutos), não CSS transform — assim o recorte final só precisa
    // reler esses mesmos quatro números e escalar pro tamanho de saída, sem
    // duplicar a matemática de posicionamento em outro lugar.
    // --------------------------------------------------------------------------

    const editor = {
        naturalWidth: 0,
        naturalHeight: 0,
        baseScale: 1, // escala mínima que faz a foto cobrir a moldura inteira
        zoom: 1, // multiplicador aplicado sobre baseScale (1 a ZOOM_MAXIMO)
        dx: 0,
        dy: 0
    };

    let arrastoAtual = null;

    function obterTamanhoViewport() {
        const rect = imagemEditorViewportEl.getBoundingClientRect();
        return { largura: rect.width, altura: rect.height };
    }

    function calcularBaseScale() {
        const { largura, altura } = obterTamanhoViewport();
        return Math.max(largura / editor.naturalWidth, altura / editor.naturalHeight);
    }

    // Garante que a foto sempre cobre a moldura inteira (nunca sobra espaço
    // vazio) — o quanto dá pra arrastar depende de quanto a foto, no zoom
    // atual, é maior que a moldura.
    function clampPosicao() {
        const { largura, altura } = obterTamanhoViewport();
        const escala = editor.baseScale * editor.zoom;
        const dispW = editor.naturalWidth * escala;
        const dispH = editor.naturalHeight * escala;

        const maxDx = Math.max(0, (dispW - largura) / 2);
        const maxDy = Math.max(0, (dispH - altura) / 2);

        editor.dx = Math.min(maxDx, Math.max(-maxDx, editor.dx));
        editor.dy = Math.min(maxDy, Math.max(-maxDy, editor.dy));
    }

    function aplicarTransformacao() {
        const { largura, altura } = obterTamanhoViewport();
        const escala = editor.baseScale * editor.zoom;
        const dispW = editor.naturalWidth * escala;
        const dispH = editor.naturalHeight * escala;

        imagemEditorImgEl.style.width = dispW + "px";
        imagemEditorImgEl.style.height = dispH + "px";
        imagemEditorImgEl.style.left = ((largura - dispW) / 2 + editor.dx) + "px";
        imagemEditorImgEl.style.top = ((altura - dispH) / 2 + editor.dy) + "px";
    }

    function redefinirEditor() {
        editor.zoom = 1;
        editor.dx = 0;
        editor.dy = 0;
        imagemEditorZoomEl.value = "0";
        clampPosicao();
        aplicarTransformacao();
    }

    function carregarImagemNoEditor(dataUrl) {
        return new Promise(function (resolve, reject) {
            const img = new Image();

            img.onerror = function () {
                reject(new Error("Não foi possível processar essa imagem."));
            };

            img.onload = function () {
                editor.naturalWidth = img.naturalWidth;
                editor.naturalHeight = img.naturalHeight;
                imagemEditorImgEl.src = dataUrl;
                editor.baseScale = calcularBaseScale();
                redefinirEditor();
                resolve();
            };

            img.src = dataUrl;
        });
    }

    function abrirEditor(dataUrl) {
        imagemAntesDoEditor = imagemPendente;
        esconderErroImagem();

        // A moldura precisa estar visível (não [hidden]) ANTES de calcular
        // baseScale/posição — calcularBaseScale() lê o tamanho real da
        // moldura via getBoundingClientRect(), que é 0x0 enquanto ela ainda
        // está escondida. Por isso a ordem aqui importa: mostra a UI do
        // editor primeiro, só depois carrega/posiciona a imagem nela.
        imagemCampoEl.hidden = true;
        imagemPreviewWrapEl.hidden = true;
        modalRecompensaAcoesEl.hidden = true;
        imagemEditorWrapEl.hidden = false;
        editorAberto = true;

        carregarImagemNoEditor(dataUrl).catch(function () {
            mostrarErroImagem("Não foi possível processar essa imagem. Tente outro arquivo.");
            fecharEditor();
        });
    }

    // Única fonte de verdade pra "qual foto vale agora": uma string nova
    // (recém-recortada), null (removida de propósito), ou — quando
    // imagemPendente ainda é undefined porque o admin não mexeu em nada —
    // a foto que já estava salva na recompensa em edição, se houver.
    // Usada tanto pra fechar o editor quanto pelo botão "Ajustar foto", pra
    // nunca decidir "qual foto mostrar" de dois jeitos diferentes.
    function obterImagemAtualExibivel() {
        if (typeof imagemPendente === "string") {
            return imagemPendente;
        }

        if (imagemPendente === null) {
            return null;
        }

        return (recompensaEmEdicao && recompensaEmEdicao.imagem) || null;
    }

    function fecharEditor() {
        imagemEditorWrapEl.hidden = true;
        imagemCampoEl.hidden = false;
        modalRecompensaAcoesEl.hidden = false;
        editorAberto = false;

        const imagemParaExibir = obterImagemAtualExibivel();

        if (imagemParaExibir) {
            exibirPreview(imagemParaExibir);
        } else {
            esconderPreview();
        }
    }

    // Só a área visível dentro da moldura vira o recorte final — lê a
    // posição/tamanho já aplicados no <img> do editor (mesmos valores da
    // tela, nenhuma conta duplicada) e escala pro canvas de saída fixo
    // (RECORTE_LARGURA x RECORTE_ALTURA, sempre 4:3).
    function gerarRecorteFinal() {
        const { largura } = obterTamanhoViewport();
        const fatorSaida = RECORTE_LARGURA / largura;

        const left = parseFloat(imagemEditorImgEl.style.left);
        const top = parseFloat(imagemEditorImgEl.style.top);
        const dispW = parseFloat(imagemEditorImgEl.style.width);
        const dispH = parseFloat(imagemEditorImgEl.style.height);

        const canvas = document.createElement("canvas");
        canvas.width = RECORTE_LARGURA;
        canvas.height = RECORTE_ALTURA;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(
            imagemEditorImgEl,
            left * fatorSaida,
            top * fatorSaida,
            dispW * fatorSaida,
            dispH * fatorSaida
        );

        return canvas.toDataURL("image/jpeg", IMAGEM_QUALIDADE_JPEG);
    }

    imagemEditorViewportEl.addEventListener("pointerdown", function (evento) {
        arrastoAtual = { inicioX: evento.clientX, inicioY: evento.clientY, dxInicial: editor.dx, dyInicial: editor.dy };
        imagemEditorViewportEl.setPointerCapture(evento.pointerId);
        imagemEditorViewportEl.classList.add("is-arrastando");
    });

    imagemEditorViewportEl.addEventListener("pointermove", function (evento) {
        if (!arrastoAtual) {
            return;
        }

        editor.dx = arrastoAtual.dxInicial + (evento.clientX - arrastoAtual.inicioX);
        editor.dy = arrastoAtual.dyInicial + (evento.clientY - arrastoAtual.inicioY);
        clampPosicao();
        aplicarTransformacao();
    });

    function pararDeArrastar() {
        arrastoAtual = null;
        imagemEditorViewportEl.classList.remove("is-arrastando");
    }

    imagemEditorViewportEl.addEventListener("pointerup", pararDeArrastar);
    imagemEditorViewportEl.addEventListener("pointercancel", pararDeArrastar);

    imagemEditorZoomEl.addEventListener("input", function () {
        const fracao = Number(imagemEditorZoomEl.value) / 100;
        editor.zoom = 1 + fracao * (ZOOM_MAXIMO - 1);
        clampPosicao();
        aplicarTransformacao();
    });

    imagemEditorResetarBtn.addEventListener("click", redefinirEditor);

    imagemEditorCancelarBtn.addEventListener("click", function () {
        imagemPendente = imagemAntesDoEditor;
        fecharEditor();
    });

    imagemEditorAplicarBtn.addEventListener("click", function () {
        imagemPendente = gerarRecorteFinal();
        fecharEditor();
    });

    // --------------------------------------------------------------------------
    // Selecionar / ajustar / remover
    // --------------------------------------------------------------------------

    imagemInput.addEventListener("change", async function () {
        esconderErroImagem();

        const arquivo = imagemInput.files[0];
        imagemInput.value = "";

        if (!arquivo) {
            return;
        }

        if (!arquivo.type.startsWith("image/")) {
            mostrarErroImagem("Selecione um arquivo de imagem (jpeg, png ou webp).");
            return;
        }

        if (arquivo.size > IMAGEM_ARQUIVO_MAXIMO) {
            mostrarErroImagem("Imagem muito grande. Escolha um arquivo de até 15MB.");
            return;
        }

        try {
            const dataUrl = await lerArquivoComoDataUrl(arquivo);
            abrirEditor(dataUrl);

        } catch (erro) {
            mostrarErroImagem("Não foi possível ler esse arquivo. Tente outro.");
        }
    });

    // "Ajustar foto" reabre o editor com a imagem que já está valendo agora
    // (a recém-recortada nesta sessão, ou a que já estava salva ao editar) —
    // nunca com o arquivo original, que nunca é guardado.
    imagemAjustarBtn.addEventListener("click", function () {
        const imagemAtual = obterImagemAtualExibivel();

        if (imagemAtual) {
            abrirEditor(imagemAtual);
        }
    });

    imagemRemoverBtn.addEventListener("click", function () {
        imagemPendente = null;
        esconderPreview();
        esconderErroImagem();
    });

    // Carregada uma vez e reaproveitada nos dois modos do modal (criar/editar)
    // — GET /empresas é admin/funcionário, lista só as empresas ativas.
    async function carregarEmpresas() {
        try {
            const empresas = await window.api("/empresas");

            empresas.forEach(function (empresa) {
                const option = document.createElement("option");
                option.value = empresa.id;
                option.textContent = empresa.nome;
                empresaSelect.appendChild(option);
            });

        } catch (erro) {
            // Sem a lista, o select fica só com o placeholder — o admin não
            // consegue criar/editar recompensa até isso funcionar, então o
            // erro aparece na mensagem da página em vez de travar silenciosamente.
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as empresas agora.");
            mostrarMensagemPagina(mensagem, "erro");
        }
    }

    function mostrarMensagemPagina(texto, tipo) {
        pageMessageEl.innerHTML = "";

        const icone = document.createElement("span");
        icone.className = "form-message__icon";
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = tipo === "erro" ? "!" : "✓";

        const spanTexto = document.createElement("span");
        spanTexto.textContent = texto;

        pageMessageEl.appendChild(icone);
        pageMessageEl.appendChild(spanTexto);
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function renderizarTabela(lista) {
        if (lista.length === 0) {
            window.UI.definirPlaceholder(containerEl, "Nenhuma recompensa cadastrada.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Nome</th>"
            + "<th scope=\"col\">Empresa</th>"
            + "<th scope=\"col\">Descrição</th>"
            + "<th scope=\"col\" class=\"num\">Pontos</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\">Ações</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        lista.forEach(function (recompensa) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = recompensa.nome;

            // empresa_ativa só existe nesta listagem (admin) — se a empresa
            // da recompensa foi desativada depois, o nome continua aparecendo
            // (a recompensa não perde histórico), só com um aviso ao lado.
            const tdEmpresa = document.createElement("td");
            if (recompensa.empresa_nome) {
                tdEmpresa.textContent = recompensa.empresa_nome
                    + (recompensa.empresa_ativa === false ? " (inativa)" : "");
                if (recompensa.empresa_ativa === false) {
                    tdEmpresa.className = "muted";
                }
            } else {
                tdEmpresa.textContent = "— sem empresa —";
                tdEmpresa.className = "muted";
            }

            const tdDescricao = document.createElement("td");
            tdDescricao.className = "wrap muted";
            tdDescricao.textContent = recompensa.descricao || "—";

            const tdPontos = document.createElement("td");
            tdPontos.className = "num";
            tdPontos.textContent = window.UI.formatarNumero(recompensa.pontos_necessarios);

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "status-badge " + (recompensa.ativo ? "status-badge--aprovado" : "status-badge--recusado");
            badge.textContent = recompensa.ativo ? "Ativa" : "Inativa";
            tdStatus.appendChild(badge);

            const tdAcoes = document.createElement("td");
            const acoes = document.createElement("div");
            acoes.className = "row-actions";

            const btnEditar = document.createElement("button");
            btnEditar.type = "button";
            btnEditar.className = "btn btn--ghost";
            btnEditar.textContent = "Editar";
            btnEditar.addEventListener("click", function () {
                abrirModalEditar(recompensa, btnEditar);
            });

            acoes.appendChild(btnEditar);

            if (recompensa.ativo) {
                const btnDesativar = document.createElement("button");
                btnDesativar.type = "button";
                btnDesativar.className = "btn btn--ghost";
                btnDesativar.textContent = "Desativar";
                btnDesativar.addEventListener("click", function () {
                    abrirModalDesativar(recompensa, btnDesativar);
                });
                acoes.appendChild(btnDesativar);
            } else {
                const btnReativar = document.createElement("button");
                btnReativar.type = "button";
                btnReativar.className = "btn btn--ghost";
                btnReativar.textContent = "Reativar";
                btnReativar.addEventListener("click", function () {
                    abrirModalReativar(recompensa, btnReativar);
                });
                acoes.appendChild(btnReativar);
            }

            tdAcoes.appendChild(acoes);

            tr.appendChild(tdNome);
            tr.appendChild(tdEmpresa);
            tr.appendChild(tdDescricao);
            tr.appendChild(tdPontos);
            tr.appendChild(tdStatus);
            tr.appendChild(tdAcoes);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    async function carregarRecompensas() {
        try {
            const recompensas = await window.api("/recompensas/admin");
            renderizarTabela(recompensas);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as recompensas agora.");
            window.UI.definirPlaceholder(containerEl, mensagem, "p");
        }
    }

    // ==========================================================================
    // Criar / editar
    // ==========================================================================

    // Reset defensivo do editor ao (re)abrir a modal — no fluxo normal ele
    // já está fechado (Aplicar/Cancelar sempre fecham), isto só evita um
    // estado preso caso a modal seja reaberta de um jeito inesperado.
    function garantirEditorFechado() {
        imagemEditorWrapEl.hidden = true;
        imagemCampoEl.hidden = false;
        modalRecompensaAcoesEl.hidden = false;
        editorAberto = false;
    }

    function abrirModalCriar() {
        modoFormulario = "criar";
        recompensaEmEdicao = null;

        modalRecompensaTitleEl.textContent = "Nova recompensa";
        nomeInput.value = "";
        descricaoInput.value = "";
        pontosInput.value = "";
        empresaSelect.value = "";
        modalRecompensaErrorEl.hidden = true;
        modalRecompensaErrorEl.textContent = "";

        imagemPendente = undefined;
        esconderErroImagem();
        esconderPreview();
        garantirEditorFechado();

        controladorRecompensa.abrir(document.getElementById("nova-recompensa-btn"));
        nomeInput.focus();
    }

    function abrirModalEditar(recompensa, botaoOrigem) {
        modoFormulario = "editar";
        recompensaEmEdicao = recompensa;

        modalRecompensaTitleEl.textContent = "Editar recompensa";
        nomeInput.value = recompensa.nome;
        descricaoInput.value = recompensa.descricao || "";
        pontosInput.value = recompensa.pontos_necessarios;
        // Recompensas antigas podem não ter empresa definida ainda (ver
        // migração) — nesse caso o select volta pro placeholder, forçando
        // o admin a escolher uma antes de conseguir salvar.
        empresaSelect.value = recompensa.empresa_id || "";
        modalRecompensaErrorEl.hidden = true;
        modalRecompensaErrorEl.textContent = "";

        // undefined = mantém a foto atual se o admin não mexer em nada.
        imagemPendente = undefined;
        esconderErroImagem();
        garantirEditorFechado();

        if (recompensa.imagem) {
            exibirPreview(recompensa.imagem);
        } else {
            esconderPreview();
        }

        controladorRecompensa.abrir(botaoOrigem);
        nomeInput.focus();
    }

    document.getElementById("nova-recompensa-btn").addEventListener("click", abrirModalCriar);

    formRecompensa.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const nome = nomeInput.value.trim();
        const descricao = descricaoInput.value.trim();
        const pontos = parseInt(pontosInput.value, 10);

        if (nome.length === 0) {
            modalRecompensaErrorEl.textContent = "Informe o nome da recompensa.";
            modalRecompensaErrorEl.hidden = false;
            return;
        }

        if (!Number.isInteger(pontos) || pontos <= 0) {
            modalRecompensaErrorEl.textContent = "Pontos necessários deve ser um número inteiro maior que 0.";
            modalRecompensaErrorEl.hidden = false;
            return;
        }

        if (!empresaSelect.value) {
            modalRecompensaErrorEl.textContent = "Selecione a empresa da recompensa.";
            modalRecompensaErrorEl.hidden = false;
            return;
        }

        const empresaId = Number(empresaSelect.value);

        modalRecompensaConfirmarBtn.disabled = true;
        modalRecompensaConfirmarBtn.classList.add("is-loading");
        modalRecompensaConfirmarLabel.textContent = "Salvando...";
        modalRecompensaErrorEl.hidden = true;

        // imagemPendente undefined = campo nem entra no body (JSON.stringify
        // já omite chaves com valor undefined) — o backend distingue "campo
        // ausente" (não mexe na foto) de "campo null" (remove a foto).
        try {
            if (modoFormulario === "criar") {
                await window.api("/recompensas", {
                    method: "POST",
                    body: {
                        nome: nome,
                        descricao: descricao || undefined,
                        pontos_necessarios: pontos,
                        empresa_id: empresaId,
                        imagem: imagemPendente
                    }
                });

                mostrarMensagemPagina("Recompensa criada com sucesso.", "sucesso");

            } else {
                await window.api("/recompensas/" + recompensaEmEdicao.id, {
                    method: "PUT",
                    body: {
                        nome: nome,
                        descricao: descricao,
                        pontos_necessarios: pontos,
                        empresa_id: empresaId,
                        imagem: imagemPendente
                    }
                });

                mostrarMensagemPagina("Recompensa atualizada com sucesso.", "sucesso");
            }

            controladorRecompensa.fechar(true);
            carregarRecompensas();

        } catch (erro) {
            modalRecompensaErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível salvar a recompensa agora.");
            modalRecompensaErrorEl.hidden = false;

        } finally {
            modalRecompensaConfirmarBtn.disabled = false;
            modalRecompensaConfirmarBtn.classList.remove("is-loading");
            modalRecompensaConfirmarLabel.textContent = "Salvar";
        }
    });

    // ==========================================================================
    // Desativar
    // ==========================================================================

    function abrirModalDesativar(recompensa, botaoOrigem) {
        recompensaParaDesativar = recompensa;
        modalDesativarNomeEl.textContent = recompensa.nome;
        modalDesativarErrorEl.hidden = true;
        modalDesativarErrorEl.textContent = "";

        controladorDesativar.abrir(botaoOrigem);
        modalDesativarConfirmarBtn.focus();
    }

    modalDesativarConfirmarBtn.addEventListener("click", async function () {
        if (!recompensaParaDesativar) {
            return;
        }

        modalDesativarConfirmarBtn.disabled = true;
        modalDesativarConfirmarBtn.classList.add("is-loading");
        modalDesativarConfirmarLabel.textContent = "Desativando...";
        modalDesativarErrorEl.hidden = true;

        try {
            await window.api("/recompensas/" + recompensaParaDesativar.id, {
                method: "DELETE"
            });

            controladorDesativar.fechar(true);
            mostrarMensagemPagina("Recompensa desativada com sucesso.", "sucesso");
            carregarRecompensas();

        } catch (erro) {
            modalDesativarErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível desativar a recompensa agora.");
            modalDesativarErrorEl.hidden = false;

        } finally {
            modalDesativarConfirmarBtn.disabled = false;
            modalDesativarConfirmarBtn.classList.remove("is-loading");
            modalDesativarConfirmarLabel.textContent = "Desativar";
        }
    });

    // ==========================================================================
    // Reativar
    // ==========================================================================

    function abrirModalReativar(recompensa, botaoOrigem) {
        recompensaParaReativar = recompensa;
        modalReativarNomeEl.textContent = recompensa.nome;
        modalReativarErrorEl.hidden = true;
        modalReativarErrorEl.textContent = "";

        controladorReativar.abrir(botaoOrigem);
        modalReativarConfirmarBtn.focus();
    }

    modalReativarConfirmarBtn.addEventListener("click", async function () {
        if (!recompensaParaReativar) {
            return;
        }

        modalReativarConfirmarBtn.disabled = true;
        modalReativarConfirmarBtn.classList.add("is-loading");
        modalReativarConfirmarLabel.textContent = "Reativando...";
        modalReativarErrorEl.hidden = true;

        try {
            await window.api("/recompensas/" + recompensaParaReativar.id + "/reativar", {
                method: "PATCH"
            });

            controladorReativar.fechar(true);
            mostrarMensagemPagina("Recompensa reativada com sucesso.", "sucesso");
            carregarRecompensas();

        } catch (erro) {
            modalReativarErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível reativar a recompensa agora.");
            modalReativarErrorEl.hidden = false;

        } finally {
            modalReativarConfirmarBtn.disabled = false;
            modalReativarConfirmarBtn.classList.remove("is-loading");
            modalReativarConfirmarLabel.textContent = "Reativar";
        }
    });

    carregarEmpresas();
    carregarRecompensas();
})();
