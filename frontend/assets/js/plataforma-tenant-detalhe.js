/**
 * Detalhe de um tenant — GET /plataforma/tenants/:id (já existente, Etapa
 * 3C-9). O `id` vem da query string (?id=), já que este projeto serve
 * páginas estáticas (express.static), sem roteador de frontend — mesmo
 * padrão de URL "chata" já usado no restante do app (nenhuma outra tela
 * daqui usa /recurso/:id "bonito").
 *
 * Exibe dados básicos (nome, slug, plano, status, criado em) e
 * ESTATÍSTICAS AGREGADAS (contagens) — nunca uma lista de usuários,
 * recompensas ou resgates individuais desse tenant.
 *
 * ETAPA 3C-11 — duas ações passam a existir aqui, ambas usando endpoints
 * JÁ EXISTENTES (nenhuma rota nova):
 *   - Ativar/Desativar (PATCH /plataforma/tenants/:id/status), com
 *     confirmação antes de desativar;
 *   - Criar administrador inicial (POST /plataforma/tenants/:id/admin),
 *     só oferecida quando o tenant ainda não tem nenhum usuário
 *     (estatisticas.usuarios === 0) — é exatamente o cenário de "primeiro
 *     admin" que a rota existe para atender. `tenant_id` nunca aparece no
 *     formulário nem é lido dele: o tenant vem sempre do `:id` da própria
 *     URL da API, que por sua vez vem do `?id=` já resolvido nesta página
 *     (nunca de um campo editável).
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("tenant-detalhe-container");
    const pageMessageEl = document.getElementById("page-message");
    const tituloEl = document.getElementById("tenant-titulo");

    // ---- Modal: ativar/desativar ----
    const modalStatusTitleEl = document.getElementById("modal-status-title");
    const modalStatusNomeEl = document.getElementById("modal-status-nome");
    const modalStatusNotaEl = document.getElementById("modal-status-nota");
    const modalStatusErrorEl = document.getElementById("modal-status-error");
    const modalStatusConfirmarBtn = document.getElementById("modal-status-confirmar");
    const modalStatusConfirmarLabel = modalStatusConfirmarBtn.querySelector(".btn__label");

    const controladorStatus = window.UI.criarControladorModal(
        document.getElementById("modal-status-overlay"),
        { podeFechar: function () { return !modalStatusConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-status-cancelar").addEventListener("click", controladorStatus.fechar);

    // ---- Modal: criar administrador ----
    const formAdmin = document.getElementById("form-admin");
    const adminNomeInput = document.getElementById("admin-nome");
    const adminEmailInput = document.getElementById("admin-email");
    const adminCpfInput = document.getElementById("admin-cpf");
    const adminTelefoneInput = document.getElementById("admin-telefone");
    const adminSenhaInput = document.getElementById("admin-senha");
    const modalAdminErrorEl = document.getElementById("modal-admin-error");
    const modalAdminConfirmarBtn = document.getElementById("modal-admin-confirmar");
    const modalAdminConfirmarLabel = modalAdminConfirmarBtn.querySelector(".btn__label");

    const controladorAdmin = window.UI.criarControladorModal(
        document.getElementById("modal-admin-overlay"),
        { podeFechar: function () { return !modalAdminConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-admin-cancelar").addEventListener("click", controladorAdmin.fechar);

    let tenantAtual = null;
    let acaoStatusPendente = null; // "ativar" | "desativar"

    function mostrarMensagemPagina(texto, tipo) {
        pageMessageEl.textContent = texto;
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function mostrarErroDaPagina(texto) {
        mostrarMensagemPagina(texto, "erro");
    }

    function criarReceiptRow(label, valor) {
        const row = document.createElement("div");
        row.className = "receipt-row";

        const labelEl = document.createElement("span");
        labelEl.className = "receipt-row__label";
        labelEl.textContent = label;

        const valorEl = document.createElement("span");
        valorEl.className = "receipt-row__value";
        valorEl.textContent = valor;

        row.appendChild(labelEl);
        row.appendChild(valorEl);
        return row;
    }

    function obterIdDaQueryString() {
        const parametros = new URLSearchParams(window.location.search);
        const id = Number(parametros.get("id"));
        return Number.isInteger(id) ? id : null;
    }

    // ==========================================================================
    // Ativar / desativar
    // ==========================================================================

    function abrirModalStatus() {
        const ativo = tenantAtual.status === "ativo";
        acaoStatusPendente = ativo ? "desativar" : "ativar";

        modalStatusTitleEl.textContent = ativo ? "Desativar tenant" : "Ativar tenant";
        modalStatusNomeEl.textContent = tenantAtual.nome;
        modalStatusNotaEl.textContent = ativo
            ? "Usuários deste tenant deixam de conseguir fazer login enquanto ele estiver inativo. Os dados não são apagados."
            : "O tenant volta a ficar acessível para os usuários dele.";
        modalStatusErrorEl.hidden = true;
        modalStatusErrorEl.textContent = "";
        modalStatusConfirmarLabel.textContent = ativo ? "Desativar" : "Ativar";

        controladorStatus.abrir(document.getElementById("btn-alterar-status"));
        modalStatusConfirmarBtn.focus();
    }

    modalStatusConfirmarBtn.addEventListener("click", async function () {
        if (!tenantAtual || !acaoStatusPendente) {
            return;
        }

        const novoStatus = acaoStatusPendente === "ativar" ? "ativo" : "inativo";

        modalStatusConfirmarBtn.disabled = true;
        modalStatusConfirmarBtn.classList.add("is-loading");
        modalStatusErrorEl.hidden = true;

        try {
            // WHERE id = :id no backend — só este tenant é afetado; não há
            // campo nenhum aqui que pudesse apontar para outro id.
            await window.plataformaApi("/plataforma/tenants/" + tenantAtual.id + "/status", {
                method: "PATCH",
                body: { status: novoStatus }
            });

            controladorStatus.fechar(true);
            mostrarMensagemPagina(
                "Status atualizado para \"" + (novoStatus === "ativo" ? "Ativo" : "Inativo") + "\".",
                "sucesso"
            );

            // Recarrega só os dados (nunca location.reload()) — atualiza o
            // badge de status, o rótulo do botão e a nota, sem recarregar a
            // aplicação inteira.
            carregar();

        } catch (erro) {
            modalStatusErrorEl.textContent = window.plataformaMensagemDeErro(erro, "Não foi possível atualizar o status agora.");
            modalStatusErrorEl.hidden = false;

        } finally {
            modalStatusConfirmarBtn.disabled = false;
            modalStatusConfirmarBtn.classList.remove("is-loading");
        }
    });

    // ==========================================================================
    // Criar administrador inicial
    // ==========================================================================

    function abrirModalAdmin() {
        formAdmin.reset();
        modalAdminErrorEl.hidden = true;
        modalAdminErrorEl.textContent = "";

        controladorAdmin.abrir(document.getElementById("btn-criar-admin"));
        adminNomeInput.focus();
    }

    formAdmin.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const nome = adminNomeInput.value.trim();
        const email = adminEmailInput.value.trim();
        const cpf = adminCpfInput.value.trim();
        const telefone = adminTelefoneInput.value.trim();
        const senha = adminSenhaInput.value;

        if (!nome || !email || !cpf || !senha) {
            modalAdminErrorEl.textContent = "Preencha nome, email, CPF e senha para continuar.";
            modalAdminErrorEl.hidden = false;
            return;
        }

        modalAdminConfirmarBtn.disabled = true;
        modalAdminConfirmarBtn.classList.add("is-loading");
        modalAdminConfirmarLabel.textContent = "Criando...";
        modalAdminErrorEl.hidden = true;

        try {
            // Corpo enviado explicitamente com só estes campos — nunca
            // tenant_id: o tenant é sempre o :id da própria URL da API
            // (tenantAtual.id, resolvido a partir do ?id= desta página).
            await window.plataformaApi("/plataforma/tenants/" + tenantAtual.id + "/admin", {
                method: "POST",
                body: {
                    nome: nome,
                    email: email,
                    cpf: cpf,
                    telefone: telefone || undefined,
                    senha: senha
                }
            });

            controladorAdmin.fechar(true);

            // Nunca reexibe a senha digitada — só confirma que a conta foi
            // criada. O formulário já foi limpo por formAdmin.reset() na
            // próxima abertura do modal.
            mostrarMensagemPagina("Administrador criado com sucesso.", "sucesso");

            carregar();

        } catch (erro) {
            modalAdminErrorEl.textContent = window.plataformaMensagemDeErro(erro, "Não foi possível criar o administrador agora.");
            modalAdminErrorEl.hidden = false;

        } finally {
            modalAdminConfirmarBtn.disabled = false;
            modalAdminConfirmarBtn.classList.remove("is-loading");
            modalAdminConfirmarLabel.textContent = "Criar administrador";
        }
    });

    // ==========================================================================
    // Renderização
    // ==========================================================================

    function renderizar(dados) {
        const tenant = dados.tenant;
        const estatisticas = dados.estatisticas;
        tenantAtual = tenant;

        tituloEl.textContent = tenant.nome;

        containerEl.innerHTML = "";

        const secaoDados = document.createElement("section");
        secaoDados.className = "dash-section";

        const cabecalhoDados = document.createElement("div");
        cabecalhoDados.className = "dash-section__header";

        const tituloDados = document.createElement("h2");
        tituloDados.className = "dash-section__title";
        tituloDados.textContent = "Dados do tenant";
        cabecalhoDados.appendChild(tituloDados);

        const ativo = tenant.status === "ativo";
        const btnStatus = document.createElement("button");
        btnStatus.type = "button";
        btnStatus.id = "btn-alterar-status";
        btnStatus.className = "btn btn--ghost";
        btnStatus.textContent = ativo ? "Desativar" : "Ativar";
        btnStatus.addEventListener("click", abrirModalStatus);
        cabecalhoDados.appendChild(btnStatus);

        secaoDados.appendChild(cabecalhoDados);

        const painelDados = document.createElement("div");
        painelDados.className = "operacao-panel";

        painelDados.appendChild(criarReceiptRow("Nome", tenant.nome));
        painelDados.appendChild(criarReceiptRow("Slug", tenant.slug));
        painelDados.appendChild(criarReceiptRow("Plano", tenant.plano || "Sem plano definido"));

        const linhaStatus = document.createElement("div");
        linhaStatus.className = "receipt-row";
        const labelStatus = document.createElement("span");
        labelStatus.className = "receipt-row__label";
        labelStatus.textContent = "Status";
        const badge = document.createElement("span");
        badge.className = "status-badge " + (ativo ? "status-badge--aprovado" : "status-badge--recusado");
        badge.textContent = ativo ? "Ativo" : "Inativo";
        linhaStatus.appendChild(labelStatus);
        linhaStatus.appendChild(badge);
        painelDados.appendChild(linhaStatus);

        painelDados.appendChild(criarReceiptRow("Criado em", window.UI.formatarData(tenant.criado_em)));

        secaoDados.appendChild(painelDados);
        containerEl.appendChild(secaoDados);

        const secaoStats = document.createElement("section");
        secaoStats.className = "dash-section";

        const tituloStats = document.createElement("h2");
        tituloStats.className = "dash-section__title";
        tituloStats.textContent = "Estatísticas";
        secaoStats.appendChild(tituloStats);

        const kpiGrid = document.createElement("div");
        kpiGrid.className = "kpi-grid";

        [
            ["Usuários", estatisticas.usuarios],
            ["Empresas", estatisticas.empresas],
            ["Recompensas", estatisticas.recompensas],
            ["Resgates", estatisticas.resgates],
            ["Movimentações de pontos", estatisticas.movimentacoes_pontos]
        ].forEach(function ([label, valor]) {
            const card = document.createElement("div");
            card.className = "kpi-card";

            const rotulo = document.createElement("p");
            rotulo.className = "kpi-card__label";
            rotulo.textContent = label;
            card.appendChild(rotulo);

            const valorEl = document.createElement("p");
            valorEl.className = "kpi-card__value";
            valorEl.textContent = window.UI.formatarNumero(valor);
            card.appendChild(valorEl);

            kpiGrid.appendChild(card);
        });

        secaoStats.appendChild(kpiGrid);
        containerEl.appendChild(secaoStats);

        // "Criar administrador" só faz sentido para um tenant que ainda não
        // tem NENHUM usuário — é o cenário de bootstrap que
        // POST /plataforma/tenants/:id/admin existe para atender.
        if (estatisticas.usuarios === 0) {
            const secaoAdmin = document.createElement("section");
            secaoAdmin.className = "dash-section";

            const tituloAdmin = document.createElement("h2");
            tituloAdmin.className = "dash-section__title";
            tituloAdmin.textContent = "Administrador inicial";
            secaoAdmin.appendChild(tituloAdmin);

            const painelAdmin = document.createElement("div");
            painelAdmin.className = "operacao-panel";

            const textoAdmin = document.createElement("p");
            textoAdmin.className = "field-hint";
            textoAdmin.textContent = "Este tenant ainda não tem nenhum usuário. Crie o primeiro administrador para que o cliente já consiga acessar o próprio painel.";
            painelAdmin.appendChild(textoAdmin);

            const btnCriarAdmin = document.createElement("button");
            btnCriarAdmin.type = "button";
            btnCriarAdmin.id = "btn-criar-admin";
            btnCriarAdmin.className = "btn btn--primary";
            btnCriarAdmin.textContent = "Criar administrador";
            btnCriarAdmin.addEventListener("click", abrirModalAdmin);
            painelAdmin.appendChild(btnCriarAdmin);

            secaoAdmin.appendChild(painelAdmin);
            containerEl.appendChild(secaoAdmin);
        }
    }

    async function carregar() {
        const id = obterIdDaQueryString();

        if (id === null) {
            window.UI.definirPlaceholder(containerEl, "Tenant inválido.");
            return;
        }

        try {
            const dados = await window.plataformaApi("/plataforma/tenants/" + id);
            renderizar(dados);

        } catch (erro) {
            window.UI.definirPlaceholder(containerEl, "Não foi possível carregar este tenant.");
            mostrarErroDaPagina(window.plataformaMensagemDeErro(erro));
        }
    }

    carregar();
})();
