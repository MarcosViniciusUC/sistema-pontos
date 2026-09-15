/**
 * Listagem de tenants da plataforma — GET /plataforma/tenants (já
 * existente, Etapa 3C-9). Só as colunas administrativas básicas (nome,
 * slug, plano, status, criado em) — nenhum dado de usuário/ponto/
 * recompensa individual aparece aqui (isso é responsabilidade da tela de
 * detalhe, e mesmo lá só como contagem agregada).
 *
 * ETAPA de onboarding — "+ Novo tenant" deixou de ser um modal que só
 * criava a linha em `tenants` (sem admin nem empresa, deixando o tenant
 * incompleto) e virou um link para o wizard completo em
 * plataforma-onboarding.html (tenant + administrador + empresa inicial,
 * numa única transação). Nenhuma lógica de criação continua aqui.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("tenants-container");
    const pageMessageEl = document.getElementById("page-message");

    function mostrarMensagemPagina(html, tipo) {
        pageMessageEl.innerHTML = html;
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function mostrarErroDaPagina(texto) {
        mostrarMensagemPagina(texto, "erro");
    }

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
