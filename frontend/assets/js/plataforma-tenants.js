/**
 * Listagem de tenants da plataforma — GET /plataforma/tenants (já
 * existente, Etapa 3C-9). Só as colunas administrativas básicas (nome,
 * slug, plano, status, criado em) — nenhum dado de usuário/ponto/
 * recompensa individual aparece aqui (isso é responsabilidade da tela de
 * detalhe, e mesmo lá só como contagem agregada).
 *
 * ETAPA 3C-11 — adiciona a criação de tenant pela interface (modal "Novo
 * tenant" → POST /plataforma/tenants, endpoint já existente desde a Etapa
 * 3C-9, nenhuma rota nova). `id`/`tenant_id`/`status` nunca são lidos do
 * formulário — o corpo enviado só tem `nome`, `slug` e `plano` (opcional);
 * `status` é sempre decidido pelo backend na criação (ver
 * plataformaTenant.controller.js:criar).
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("tenants-container");
    const pageMessageEl = document.getElementById("page-message");

    // ---- Modal: criar tenant ----
    const formTenant = document.getElementById("form-tenant");
    const nomeInput = document.getElementById("tenant-nome");
    const slugInput = document.getElementById("tenant-slug");
    const planoSelect = document.getElementById("tenant-plano");
    const modalTenantErrorEl = document.getElementById("modal-tenant-error");
    const modalTenantConfirmarBtn = document.getElementById("modal-tenant-confirmar");
    const modalTenantConfirmarLabel = modalTenantConfirmarBtn.querySelector(".btn__label");

    const controladorTenant = window.UI.criarControladorModal(
        document.getElementById("modal-tenant-overlay"),
        { podeFechar: function () { return !modalTenantConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-tenant-cancelar").addEventListener("click", controladorTenant.fechar);

    // Mesma prévia local de slugify já usada em admin-empresas.js — quem
    // decide de verdade continua sendo o backend (normalizarSlug, ver
    // src/utils/empresas.js, reaproveitado por plataformaTenant.controller.js).
    const REGEX_MARCAS_DIACRITICAS = new RegExp(
        "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
        "g"
    );

    function slugifyLocal(texto) {
        return texto
            .normalize("NFD")
            .replace(REGEX_MARCAS_DIACRITICAS, "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    let slugEditadoManualmente = false;

    nomeInput.addEventListener("input", function () {
        if (!slugEditadoManualmente) {
            slugInput.value = slugifyLocal(nomeInput.value);
        }
    });

    slugInput.addEventListener("input", function () {
        slugEditadoManualmente = true;
    });

    function mostrarMensagemPagina(html, tipo) {
        pageMessageEl.innerHTML = html;
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function mostrarErroDaPagina(texto) {
        mostrarMensagemPagina(texto, "erro");
    }

    function abrirModalCriar() {
        formTenant.reset();
        slugEditadoManualmente = false;
        modalTenantErrorEl.hidden = true;
        modalTenantErrorEl.textContent = "";

        controladorTenant.abrir(document.getElementById("novo-tenant-btn"));
        nomeInput.focus();
    }

    document.getElementById("novo-tenant-btn").addEventListener("click", abrirModalCriar);

    formTenant.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const nome = nomeInput.value.trim();
        const slug = slugInput.value.trim();
        const plano = planoSelect.value;

        if (nome.length === 0) {
            modalTenantErrorEl.textContent = "Informe o nome do tenant.";
            modalTenantErrorEl.hidden = false;
            return;
        }

        if (slug.length === 0) {
            modalTenantErrorEl.textContent = "Não foi possível gerar um slug a partir desse nome — informe um manualmente.";
            modalTenantErrorEl.hidden = false;
            return;
        }

        modalTenantConfirmarBtn.disabled = true;
        modalTenantConfirmarBtn.classList.add("is-loading");
        modalTenantConfirmarLabel.textContent = "Criando...";
        modalTenantErrorEl.hidden = true;

        try {
            // Corpo enviado explicitamente com só estes 3 campos — nunca
            // id/tenant_id/status, mesmo que alguém tente adicionar isso
            // depois neste arquivo por engano (não há variável nenhuma
            // guardando esses valores aqui para vazar no body).
            const novoTenant = await window.plataformaApi("/plataforma/tenants", {
                method: "POST",
                body: { nome: nome, slug: slug, plano: plano || undefined }
            });

            controladorTenant.fechar(true);

            const linkDetalhe = "plataforma-tenant-detalhe.html?id=" + encodeURIComponent(novoTenant.id);
            mostrarMensagemPagina(
                "Tenant criado com sucesso. <a href=\"" + linkDetalhe + "\">Abrir " + novoTenant.nome + "</a>",
                "sucesso"
            );

            carregar();

        } catch (erro) {
            modalTenantErrorEl.textContent = window.plataformaMensagemDeErro(erro, "Não foi possível criar o tenant agora.");
            modalTenantErrorEl.hidden = false;

        } finally {
            modalTenantConfirmarBtn.disabled = false;
            modalTenantConfirmarBtn.classList.remove("is-loading");
            modalTenantConfirmarLabel.textContent = "Criar tenant";
        }
    });

    function renderizarTabela(lista) {
        if (lista.length === 0) {
            window.UI.definirPlaceholder(containerEl, "Nenhum tenant cadastrado.", "p");
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
            + "<th scope=\"col\">Plano</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\">Criado em</th>"
            + "<th scope=\"col\">Ações</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        lista.forEach(function (tenant) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = tenant.nome;

            const tdSlug = document.createElement("td");
            tdSlug.className = "muted";
            tdSlug.textContent = tenant.slug;

            const tdPlano = document.createElement("td");
            tdPlano.className = tenant.plano ? "" : "muted";
            tdPlano.textContent = tenant.plano || "Sem plano definido";

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            const ativo = tenant.status === "ativo";
            badge.className = "status-badge " + (ativo ? "status-badge--aprovado" : "status-badge--recusado");
            badge.textContent = ativo ? "Ativo" : "Inativo";
            tdStatus.appendChild(badge);

            const tdCriadoEm = document.createElement("td");
            tdCriadoEm.textContent = window.UI.formatarData(tenant.criado_em);

            const tdAcoes = document.createElement("td");
            const acoes = document.createElement("div");
            acoes.className = "row-actions";

            const btnDetalhes = document.createElement("a");
            btnDetalhes.className = "btn btn--ghost";
            btnDetalhes.textContent = "Ver detalhes";
            btnDetalhes.href = "plataforma-tenant-detalhe.html?id=" + encodeURIComponent(tenant.id);
            acoes.appendChild(btnDetalhes);

            tdAcoes.appendChild(acoes);

            tr.appendChild(tdNome);
            tr.appendChild(tdSlug);
            tr.appendChild(tdPlano);
            tr.appendChild(tdStatus);
            tr.appendChild(tdCriadoEm);
            tr.appendChild(tdAcoes);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    async function carregar() {
        try {
            const tenants = await window.plataformaApi("/plataforma/tenants");
            renderizarTabela(tenants);

        } catch (erro) {
            window.UI.definirPlaceholder(containerEl, "Não foi possível carregar os tenants.");
            mostrarErroDaPagina(window.plataformaMensagemDeErro(erro));
        }
    }

    carregar();
})();
