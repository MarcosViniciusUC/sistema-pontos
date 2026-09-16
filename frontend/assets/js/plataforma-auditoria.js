/**
 * Histórico/auditoria da Plataforma Maple — GET /plataforma/auditoria (ver
 * plataformaAuditoria.controller.js). Só leitura; nenhuma ação é disparada
 * a partir desta tela.
 *
 * Mesmo padrão visual de plataforma-tenants.js (tabela `.data-table` dentro
 * de `.table-wrap`) — nenhuma classe/CSS nova criada para esta tela.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("auditoria-container");
    const pageMessageEl = document.getElementById("page-message");
    const paginacaoContainerEl = document.getElementById("paginacao-container");
    const paginacaoInfoEl = document.getElementById("paginacao-info");
    const btnPaginaAnterior = document.getElementById("btn-pagina-anterior");
    const btnPaginaProxima = document.getElementById("btn-pagina-proxima");

    const LIMITE_POR_PAGINA = 20;
    let paginaAtual = 1;

    function mostrarErroDaPagina(texto) {
        pageMessageEl.textContent = texto;
        pageMessageEl.className = "form-message form-message--erro";
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function renderizarTabela(dados) {
        if (dados.length === 0) {
            window.UI.definirPlaceholder(containerEl, "Nenhuma ação registrada ainda.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Quando</th>"
            + "<th scope=\"col\">Quem</th>"
            + "<th scope=\"col\">Tenant</th>"
            + "<th scope=\"col\">O que aconteceu</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        dados.forEach(function (item) {
            const tr = document.createElement("tr");

            const tdQuando = document.createElement("td");
            tdQuando.className = "muted";
            tdQuando.textContent = window.UI.formatarData(item.criadoEm);

            const tdQuem = document.createElement("td");
            tdQuem.textContent = item.adminNome;

            const tdTenant = document.createElement("td");
            tdTenant.className = item.tenantNome ? "" : "muted";
            tdTenant.textContent = item.tenantNome || "—";

            const tdDescricao = document.createElement("td");
            tdDescricao.textContent = item.descricao;

            tr.appendChild(tdQuando);
            tr.appendChild(tdQuem);
            tr.appendChild(tdTenant);
            tr.appendChild(tdDescricao);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    function atualizarPaginacao(paginacao) {
        const totalPaginas = Math.max(1, Math.ceil(paginacao.total / paginacao.limite));

        paginacaoContainerEl.hidden = paginacao.total === 0;
        paginacaoInfoEl.textContent = `Página ${paginacao.pagina} de ${totalPaginas} (${paginacao.total} ${paginacao.total === 1 ? "registro" : "registros"})`;

        btnPaginaAnterior.disabled = paginacao.pagina <= 1;
        btnPaginaProxima.disabled = paginacao.pagina >= totalPaginas;
    }

    async function carregar() {
        try {
            const resposta = await window.plataformaApi(`/plataforma/auditoria?pagina=${paginaAtual}&limite=${LIMITE_POR_PAGINA}`);
            renderizarTabela(resposta.dados);
            atualizarPaginacao(resposta.paginacao);

        } catch (erro) {
            window.UI.definirPlaceholder(containerEl, "Não foi possível carregar o histórico agora.");
            mostrarErroDaPagina(window.plataformaMensagemDeErro(erro));
        }
    }

    btnPaginaAnterior.addEventListener("click", function () {
        if (paginaAtual > 1) {
            paginaAtual -= 1;
            carregar();
        }
    });

    btnPaginaProxima.addEventListener("click", function () {
        paginaAtual += 1;
        carregar();
    });

    carregar();
})();
