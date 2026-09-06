/**
 * Gerenciamento de empresas/parceiros (painel admin).
 *
 * Usa GET /empresas/admin (admin-only) em vez de GET /empresas — essa
 * variante devolve ativas E inativas, então o admin consegue reativar uma
 * empresa desativada. Os selects de "Empresa" em pontos/recompensas
 * continuam em GET /empresas, sem nenhuma mudança (só ativo=true).
 *
 * Status muda exclusivamente por PATCH /empresas/:id/desativar e
 * PATCH /empresas/:id/ativar — PUT /empresas/:id não aceita um campo
 * "ativo", mesmo padrão já usado em admin-recompensas.js.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("empresas-container");
    const pageMessageEl = document.getElementById("page-message");

    // ---- Modal: criar/editar ----
    const formEmpresa = document.getElementById("form-empresa");
    const modalEmpresaTitleEl = document.getElementById("modal-empresa-title");
    const nomeInput = document.getElementById("empresa-nome");
    const slugInput = document.getElementById("empresa-slug");
    const modalEmpresaErrorEl = document.getElementById("modal-empresa-error");
    const modalEmpresaConfirmarBtn = document.getElementById("modal-empresa-confirmar");
    const modalEmpresaConfirmarLabel = modalEmpresaConfirmarBtn.querySelector(".btn__label");

    const controladorEmpresa = window.UI.criarControladorModal(
        document.getElementById("modal-empresa-overlay"),
        { podeFechar: function () { return !modalEmpresaConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-empresa-cancelar").addEventListener("click", controladorEmpresa.fechar);

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

    // ---- Modal: confirmar ativação ----
    const modalAtivarNomeEl = document.getElementById("modal-ativar-nome");
    const modalAtivarErrorEl = document.getElementById("modal-ativar-error");
    const modalAtivarConfirmarBtn = document.getElementById("modal-ativar-confirmar");
    const modalAtivarConfirmarLabel = modalAtivarConfirmarBtn.querySelector(".btn__label");

    const controladorAtivar = window.UI.criarControladorModal(
        document.getElementById("modal-ativar-overlay"),
        { podeFechar: function () { return !modalAtivarConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-ativar-cancelar").addEventListener("click", controladorAtivar.fechar);

    let modoFormulario = "criar";
    let empresaEmEdicao = null;
    let empresaParaDesativar = null;
    let empresaParaAtivar = null;

    // Faixa Unicode das marcas diacríticas combinantes, montada a partir dos
    // code points em vez de caracteres literais (mesmo motivo de
    // src/utils/empresas.js: evitar depender de bytes não-ASCII no arquivo).
    const REGEX_MARCAS_DIACRITICAS = new RegExp(
        "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
        "g"
    );

    // Espelha normalizarSlug (src/utils/empresas.js) só pra já mostrar o
    // resultado provável enquanto o admin digita — quem decide de verdade é
    // sempre o backend; isto aqui é só uma prévia, nunca a validação final.
    function slugifyLocal(texto) {
        return texto
            .normalize("NFD")
            .replace(REGEX_MARCAS_DIACRITICAS, "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    // Enquanto o admin não editar o campo Slug diretamente, ele é preenchido
    // automaticamente a partir do Nome — evita pedir a mesma informação
    // duas vezes. No modo editar, começa travado: mudar o nome de uma
    // empresa existente não deve reescrever um slug que já está em uso em
    // recompensas/movimentações antigas.
    let slugEditadoManualmente = false;

    nomeInput.addEventListener("input", function () {
        if (!slugEditadoManualmente) {
            slugInput.value = slugifyLocal(nomeInput.value);
        }
    });

    slugInput.addEventListener("input", function () {
        slugEditadoManualmente = true;
    });

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
            window.UI.definirPlaceholder(containerEl, "Nenhuma empresa cadastrada.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Nome</th>"
            + "<th scope=\"col\">Slug</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\">Ações</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        lista.forEach(function (empresa) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = empresa.nome;

            const tdSlug = document.createElement("td");
            tdSlug.className = "muted";
            tdSlug.textContent = empresa.slug;

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "status-badge " + (empresa.ativo ? "status-badge--aprovado" : "status-badge--recusado");
            badge.textContent = empresa.ativo ? "Ativa" : "Inativa";
            tdStatus.appendChild(badge);

            const tdAcoes = document.createElement("td");
            const acoes = document.createElement("div");
            acoes.className = "row-actions";

            const btnEditar = document.createElement("button");
            btnEditar.type = "button";
            btnEditar.className = "btn btn--ghost";
            btnEditar.textContent = "Editar";
            btnEditar.addEventListener("click", function () {
                abrirModalEditar(empresa, btnEditar);
            });

            acoes.appendChild(btnEditar);

            if (empresa.ativo) {
                const btnDesativar = document.createElement("button");
                btnDesativar.type = "button";
                btnDesativar.className = "btn btn--ghost";
                btnDesativar.textContent = "Desativar";
                btnDesativar.addEventListener("click", function () {
                    abrirModalDesativar(empresa, btnDesativar);
                });
                acoes.appendChild(btnDesativar);
            } else {
                const btnAtivar = document.createElement("button");
                btnAtivar.type = "button";
                btnAtivar.className = "btn btn--ghost";
                btnAtivar.textContent = "Ativar";
                btnAtivar.addEventListener("click", function () {
                    abrirModalAtivar(empresa, btnAtivar);
                });
                acoes.appendChild(btnAtivar);
            }

            tdAcoes.appendChild(acoes);

            tr.appendChild(tdNome);
            tr.appendChild(tdSlug);
            tr.appendChild(tdStatus);
            tr.appendChild(tdAcoes);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    async function carregarEmpresas() {
        try {
            const empresas = await window.api("/empresas/admin");
            renderizarTabela(empresas);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as empresas agora.");
            window.UI.definirPlaceholder(containerEl, mensagem, "p");
        }
    }

    // ==========================================================================
    // Criar / editar
    // ==========================================================================

    function abrirModalCriar() {
        modoFormulario = "criar";
        empresaEmEdicao = null;
        slugEditadoManualmente = false;

        modalEmpresaTitleEl.textContent = "Nova empresa";
        nomeInput.value = "";
        slugInput.value = "";
        modalEmpresaErrorEl.hidden = true;
        modalEmpresaErrorEl.textContent = "";

        controladorEmpresa.abrir(document.getElementById("nova-empresa-btn"));
        nomeInput.focus();
    }

    function abrirModalEditar(empresa, botaoOrigem) {
        modoFormulario = "editar";
        empresaEmEdicao = empresa;
        // Travado desde já: a empresa já tem um slug em uso (possivelmente
        // referenciado por recompensas/movimentações antigas), então editar
        // o nome aqui nunca deve reescrevê-lo sozinho.
        slugEditadoManualmente = true;

        modalEmpresaTitleEl.textContent = "Editar empresa";
        nomeInput.value = empresa.nome;
        slugInput.value = empresa.slug;
        modalEmpresaErrorEl.hidden = true;
        modalEmpresaErrorEl.textContent = "";

        controladorEmpresa.abrir(botaoOrigem);
        nomeInput.focus();
    }

    document.getElementById("nova-empresa-btn").addEventListener("click", abrirModalCriar);

    formEmpresa.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const nome = nomeInput.value.trim();
        const slug = slugInput.value.trim();

        if (nome.length === 0) {
            modalEmpresaErrorEl.textContent = "Informe o nome da empresa.";
            modalEmpresaErrorEl.hidden = false;
            return;
        }

        if (slug.length === 0) {
            // Só acontece se o nome não tiver nenhuma letra/número pra gerar
            // um slug a partir dele (ex: só emojis/pontuação), já que o
            // campo é preenchido automaticamente na maioria dos casos.
            modalEmpresaErrorEl.textContent = "Não foi possível gerar um slug a partir desse nome — informe um manualmente.";
            modalEmpresaErrorEl.hidden = false;
            return;
        }

        modalEmpresaConfirmarBtn.disabled = true;
        modalEmpresaConfirmarBtn.classList.add("is-loading");
        modalEmpresaConfirmarLabel.textContent = "Salvando...";
        modalEmpresaErrorEl.hidden = true;

        try {
            if (modoFormulario === "criar") {
                await window.api("/empresas", {
                    method: "POST",
                    body: { nome: nome, slug: slug }
                });

                mostrarMensagemPagina("Empresa criada com sucesso.", "sucesso");

            } else {
                await window.api("/empresas/" + empresaEmEdicao.id, {
                    method: "PUT",
                    body: { nome: nome, slug: slug }
                });

                mostrarMensagemPagina("Empresa atualizada com sucesso.", "sucesso");
            }

            controladorEmpresa.fechar(true);
            carregarEmpresas();

        } catch (erro) {
            modalEmpresaErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível salvar a empresa agora.");
            modalEmpresaErrorEl.hidden = false;

        } finally {
            modalEmpresaConfirmarBtn.disabled = false;
            modalEmpresaConfirmarBtn.classList.remove("is-loading");
            modalEmpresaConfirmarLabel.textContent = "Salvar";
        }
    });

    // ==========================================================================
    // Desativar
    // ==========================================================================

    function abrirModalDesativar(empresa, botaoOrigem) {
        empresaParaDesativar = empresa;
        modalDesativarNomeEl.textContent = empresa.nome;
        modalDesativarErrorEl.hidden = true;
        modalDesativarErrorEl.textContent = "";

        controladorDesativar.abrir(botaoOrigem);
        modalDesativarConfirmarBtn.focus();
    }

    modalDesativarConfirmarBtn.addEventListener("click", async function () {
        if (!empresaParaDesativar) {
            return;
        }

        modalDesativarConfirmarBtn.disabled = true;
        modalDesativarConfirmarBtn.classList.add("is-loading");
        modalDesativarConfirmarLabel.textContent = "Desativando...";
        modalDesativarErrorEl.hidden = true;

        try {
            await window.api("/empresas/" + empresaParaDesativar.id + "/desativar", {
                method: "PATCH"
            });

            controladorDesativar.fechar(true);
            mostrarMensagemPagina("Empresa desativada com sucesso.", "sucesso");
            carregarEmpresas();

        } catch (erro) {
            modalDesativarErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível desativar a empresa agora.");
            modalDesativarErrorEl.hidden = false;

        } finally {
            modalDesativarConfirmarBtn.disabled = false;
            modalDesativarConfirmarBtn.classList.remove("is-loading");
            modalDesativarConfirmarLabel.textContent = "Desativar";
        }
    });

    // ==========================================================================
    // Ativar
    // ==========================================================================

    function abrirModalAtivar(empresa, botaoOrigem) {
        empresaParaAtivar = empresa;
        modalAtivarNomeEl.textContent = empresa.nome;
        modalAtivarErrorEl.hidden = true;
        modalAtivarErrorEl.textContent = "";

        controladorAtivar.abrir(botaoOrigem);
        modalAtivarConfirmarBtn.focus();
    }

    modalAtivarConfirmarBtn.addEventListener("click", async function () {
        if (!empresaParaAtivar) {
            return;
        }

        modalAtivarConfirmarBtn.disabled = true;
        modalAtivarConfirmarBtn.classList.add("is-loading");
        modalAtivarConfirmarLabel.textContent = "Ativando...";
        modalAtivarErrorEl.hidden = true;

        try {
            await window.api("/empresas/" + empresaParaAtivar.id + "/ativar", {
                method: "PATCH"
            });

            controladorAtivar.fechar(true);
            mostrarMensagemPagina("Empresa ativada com sucesso.", "sucesso");
            carregarEmpresas();

        } catch (erro) {
            modalAtivarErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível ativar a empresa agora.");
            modalAtivarErrorEl.hidden = false;

        } finally {
            modalAtivarConfirmarBtn.disabled = false;
            modalAtivarConfirmarBtn.classList.remove("is-loading");
            modalAtivarConfirmarLabel.textContent = "Ativar";
        }
    });

    carregarEmpresas();
})();
