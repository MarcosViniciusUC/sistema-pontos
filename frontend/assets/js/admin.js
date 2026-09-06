/**
 * Dashboard administrativo.
 *
 * Uma só chamada a GET /admin/dashboard (admin-only) traz tudo: KPIs,
 * pontos concedidos por empresa (já com percentual calculado no backend,
 * uma lista dinâmica vinda da tabela empresas — não fixa), resumo de
 * resgates por status, ranking dos 5 clientes com
 * mais pontos e os últimos resgates — nada é somado/recalculado aqui a
 * partir de outros endpoints, e nenhum dado sensível (código do resgate,
 * qr_token, senha) nunca chega nessa resposta.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const kpiGridEl = document.getElementById("kpi-grid");
    const pontosEmpresaListaEl = document.getElementById("pontos-empresa-lista");
    const resgatesStatusListaEl = document.getElementById("resgates-status-lista");
    const rankingContainerEl = document.getElementById("ranking-container");
    const ultimosResgatesContainerEl = document.getElementById("ultimos-resgates-container");

    // Mesmo rótulo/classe de badge já usados em admin-resgates.js e
    // meus-resgates.js — reaproveita os 3 tratamentos visuais existentes
    // em vez de inventar um quarto conjunto de cores.
    const ROTULO_STATUS = {
        pendente_validacao: "Aguardando utilização",
        utilizado: "Utilizado",
        cancelado: "Cancelado"
    };
    const CLASSE_BADGE = {
        pendente_validacao: "status-badge--pendente",
        utilizado: "status-badge--aprovado",
        cancelado: "status-badge--recusado"
    };

    function criarKpiCard({ href, label, valor, nota }) {
        const card = document.createElement(href ? "a" : "div");
        card.className = "kpi-card";

        if (href) {
            card.href = href;
        }

        const rotulo = document.createElement("p");
        rotulo.className = "kpi-card__label";
        rotulo.textContent = label;
        card.appendChild(rotulo);

        const valorEl = document.createElement("p");
        valorEl.className = "kpi-card__value";
        valorEl.textContent = valor;
        card.appendChild(valorEl);

        if (nota) {
            const notaEl = document.createElement("p");
            notaEl.className = "kpi-card__note";
            notaEl.textContent = nota;
            card.appendChild(notaEl);
        }

        return card;
    }

    function criarItemBarra(label, valorTexto, percentual) {
        const item = document.createElement("div");
        item.className = "origem-item";

        const header = document.createElement("div");
        header.className = "origem-item__header";

        const labelEl = document.createElement("span");
        labelEl.className = "origem-item__label";
        labelEl.textContent = label;
        header.appendChild(labelEl);

        const valorEl = document.createElement("span");
        valorEl.className = "origem-item__valor";
        valorEl.textContent = valorTexto;
        header.appendChild(valorEl);

        item.appendChild(header);

        const barra = document.createElement("div");
        barra.className = "origem-item__barra";

        const preenchimento = document.createElement("div");
        preenchimento.className = "origem-item__preenchimento";
        preenchimento.style.width = Math.max(0, Math.min(100, percentual)) + "%";
        barra.appendChild(preenchimento);

        item.appendChild(barra);
        return item;
    }

    // Percentual já vem pronto do backend (pontos_por_empresa[].percentual)
    // — aqui só monta a barra, sem somar nem recalcular pontos. A lista vem
    // da tabela empresas (via GROUP BY no backend), então uma empresa nova
    // aparece aqui automaticamente, sem mudar este arquivo.
    function renderizarPontosPorEmpresa(pontosPorEmpresa) {
        pontosEmpresaListaEl.innerHTML = "";

        if (pontosPorEmpresa.length === 0) {
            window.UI.definirPlaceholder(pontosEmpresaListaEl, "Nenhuma empresa cadastrada.", "p");
            return;
        }

        pontosPorEmpresa.forEach(function (item) {
            const valorTexto = window.UI.formatarNumero(item.pontos) + " pts (" + item.percentual + "%)";
            pontosEmpresaListaEl.appendChild(criarItemBarra(item.empresa_nome, valorTexto, item.percentual));
        });
    }

    // Percentual aqui é só uma proporção visual entre os 3 status (nenhum
    // pontos envolvido) — calculado a partir dos totais que já vieram
    // prontos do backend em resgates_por_status.
    function renderizarResgatesPorStatus(porStatus, totalResgates) {
        resgatesStatusListaEl.innerHTML = "";

        const ordem = [
            { chave: "pendente_validacao", rotulo: "Pendentes" },
            { chave: "utilizado", rotulo: "Utilizados" },
            { chave: "cancelado", rotulo: "Cancelados" }
        ];

        ordem.forEach(function (item) {
            const quantidade = porStatus[item.chave] || 0;
            const percentual = totalResgates > 0 ? Math.round((quantidade / totalResgates) * 100) : 0;
            const valorTexto = window.UI.formatarNumero(quantidade)
                + (totalResgates > 0 ? " (" + percentual + "%)" : "");

            resgatesStatusListaEl.appendChild(criarItemBarra(item.rotulo, valorTexto, percentual));
        });
    }

    function renderizarRanking(ranking) {
        if (ranking.length === 0) {
            window.UI.definirPlaceholder(rankingContainerEl, "Nenhum cliente com pontos ainda.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Cliente</th>"
            + "<th scope=\"col\" class=\"num\">Pontos</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        ranking.forEach(function (cliente) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = cliente.nome;

            const tdPontos = document.createElement("td");
            tdPontos.className = "num";
            const destaque = document.createElement("strong");
            destaque.className = "cliente-pontos";
            destaque.textContent = window.UI.formatarNumero(cliente.saldo);
            tdPontos.appendChild(destaque);

            tr.appendChild(tdNome);
            tr.appendChild(tdPontos);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        rankingContainerEl.innerHTML = "";
        rankingContainerEl.appendChild(wrap);
    }

    function renderizarUltimosResgates(resgates) {
        if (resgates.length === 0) {
            window.UI.definirPlaceholder(ultimosResgatesContainerEl, "Nenhum resgate registrado ainda.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Cliente</th>"
            + "<th scope=\"col\">Recompensa</th>"
            + "<th scope=\"col\" class=\"num\">Pontos</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\">Data</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        // Código do resgate não vem nesta resposta (ver admin.controller.js)
        // — não há nada aqui pra vazar, nem que quiséssemos mostrar.
        resgates.forEach(function (resgate) {
            const tr = document.createElement("tr");

            const tdCliente = document.createElement("td");
            tdCliente.textContent = resgate.cliente_nome;

            const tdRecompensa = document.createElement("td");
            tdRecompensa.textContent = resgate.recompensa_nome;

            const tdPontos = document.createElement("td");
            tdPontos.className = "num";
            tdPontos.textContent = window.UI.formatarNumero(resgate.pontos);

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "status-badge " + (CLASSE_BADGE[resgate.status] || "");
            badge.textContent = ROTULO_STATUS[resgate.status] || resgate.status;
            tdStatus.appendChild(badge);

            const tdData = document.createElement("td");
            tdData.textContent = window.UI.formatarData(resgate.criado_em);

            tr.appendChild(tdCliente);
            tr.appendChild(tdRecompensa);
            tr.appendChild(tdPontos);
            tr.appendChild(tdStatus);
            tr.appendChild(tdData);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        ultimosResgatesContainerEl.innerHTML = "";
        ultimosResgatesContainerEl.appendChild(wrap);
    }

    function renderizarErro(mensagem) {
        kpiGridEl.innerHTML = "";
        kpiGridEl.appendChild(criarKpiCard({ label: "Dashboard", valor: "—", nota: mensagem }));
        window.UI.definirPlaceholder(pontosEmpresaListaEl, mensagem, "p");
        window.UI.definirPlaceholder(resgatesStatusListaEl, mensagem, "p");
        window.UI.definirPlaceholder(rankingContainerEl, mensagem, "p");
        window.UI.definirPlaceholder(ultimosResgatesContainerEl, mensagem, "p");
    }

    async function carregarDashboard() {
        try {
            const dados = await window.api("/admin/dashboard");

            kpiGridEl.innerHTML = "";
            kpiGridEl.appendChild(criarKpiCard({
                href: "admin-clientes.html",
                label: "Clientes",
                valor: window.UI.formatarNumero(dados.total_clientes)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                href: "admin-recompensas.html",
                label: "Recompensas ativas",
                valor: window.UI.formatarNumero(dados.recompensas_ativas)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                href: "admin-resgates.html",
                label: "Total de resgates",
                valor: window.UI.formatarNumero(dados.total_resgates)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                href: "admin-resgates.html",
                label: "Resgates pendentes",
                valor: window.UI.formatarNumero(dados.resgates_pendentes)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Pontos concedidos",
                valor: window.UI.formatarNumero(dados.pontos_concedidos),
                nota: "Soma de todas as entradas de pontos."
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Pontos utilizados",
                valor: window.UI.formatarNumero(dados.pontos_utilizados),
                nota: "Soma de todas as saídas de pontos."
            }));

            renderizarPontosPorEmpresa(dados.pontos_por_empresa);
            renderizarResgatesPorStatus(dados.resgates_por_status, dados.total_resgates);
            renderizarRanking(dados.ranking_clientes);
            renderizarUltimosResgates(dados.ultimos_resgates);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar o dashboard agora.");
            renderizarErro(mensagem);
        }
    }

    carregarDashboard();
})();
