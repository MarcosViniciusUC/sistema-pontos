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

    const controladorRecompensa = window.UI.criarControladorModal(
        document.getElementById("modal-recompensa-overlay"),
        { podeFechar: function () { return !modalRecompensaConfirmarBtn.disabled; } }
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

        try {
            if (modoFormulario === "criar") {
                await window.api("/recompensas", {
                    method: "POST",
                    body: {
                        nome: nome,
                        descricao: descricao || undefined,
                        pontos_necessarios: pontos,
                        empresa_id: empresaId
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
                        empresa_id: empresaId
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
