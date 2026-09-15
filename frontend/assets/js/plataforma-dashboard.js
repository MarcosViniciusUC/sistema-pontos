/**
 * Dashboard da plataforma Maple Tech.
 *
 * As duas únicas chamadas usadas são as rotas de plataforma JÁ EXISTENTES
 * (GET /plataforma/tenants e GET /plataforma/tenants/:id — ver Etapa
 * 3C-9). Não existe endpoint de resumo global nesta etapa, então os totais
 * de usuários/empresas/recompensas/resgates/movimentações são somados
 * aqui no frontend, a partir das estatísticas por tenant que a API já
 * devolve — nada é calculado a partir de dado que a API não tenha
 * fornecido, e nenhuma linha individual (usuário, recompensa etc.) é
 * buscada, só as contagens agregadas que GET /plataforma/tenants/:id já
 * retorna. `plano` continua sendo só metadado administrativo — nenhuma
 * lógica de cobrança/checkout é calculada a partir dele aqui.
 *
 * Custo: 1 chamada para listar + 1 chamada por tenant. Aceitável para o
 * número de tenants esperado nesta fase (poucas dezenas, não milhares).
 * Quando isso deixar de ser verdade — na prática, quando o número de
 * tenants passar de algumas dezenas, ou o carregamento desta tela ficar
 * perceptivelmente lento — o caminho certo é um endpoint de resumo
 * agregado no backend (ex: `GET /plataforma/resumo`, um `GROUP BY
 * tenant_id` só para os totais), não otimização prematura aqui.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const kpiGridEl = document.getElementById("kpi-grid");
    const planosListaEl = document.getElementById("planos-lista");
    const tenantsAtividadeContainerEl = document.getElementById("tenants-atividade-container");
    const pageMessageEl = document.getElementById("page-message");

    function mostrarErroDaPagina(texto) {
        pageMessageEl.textContent = texto;
        pageMessageEl.className = "form-message form-message--erro";
        pageMessageEl.hidden = false;
    }

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

    // Mesmo padrão visual de admin.js:criarItemBarra (pontos por empresa) —
    // reaproveitado aqui para a distribuição de tenants por plano, em vez
    // de inventar um componente novo.
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

    // "Sem plano definido" agrupado como uma categoria própria — mesmo
    // rótulo já usado em plataforma-tenants.js para o mesmo caso, nunca
    // omitido/escondido da distribuição.
    function renderizarPlanos(tenants) {
        planosListaEl.innerHTML = "";

        if (tenants.length === 0) {
            window.UI.definirPlaceholder(planosListaEl, "Nenhum tenant cadastrado ainda.", "p");
            return;
        }

        const contagemPorPlano = new Map();
        tenants.forEach(function (t) {
            const chave = t.plano || "Sem plano definido";
            contagemPorPlano.set(chave, (contagemPorPlano.get(chave) || 0) + 1);
        });

        Array.from(contagemPorPlano.entries())
            .sort(function (a, b) { return b[1] - a[1]; })
            .forEach(function ([plano, quantidade]) {
                const percentual = Math.round((quantidade / tenants.length) * 100);
                const valorTexto = window.UI.formatarNumero(quantidade) + " (" + percentual + "%)";
                planosListaEl.appendChild(criarItemBarra(plano, valorTexto, percentual));
            });
    }

    // Junta cada tenant com sua própria estatística (mesmo array `detalhes`
    // já buscado para os totais acima — nenhuma chamada extra) numa tabela
    // só, pra dar pra comparar tenants lado a lado sem abrir o detalhe de
    // cada um. Só contagens agregadas, nunca uma linha individual de
    // cliente/recompensa/resgate.
    function renderizarAtividadePorTenant(tenants, detalhes) {
        tenantsAtividadeContainerEl.innerHTML = "";

        if (tenants.length === 0) {
            window.UI.definirPlaceholder(tenantsAtividadeContainerEl, "Nenhum tenant cadastrado ainda.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Tenant</th>"
            + "<th scope=\"col\">Plano</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\" class=\"num\">Usuários</th>"
            + "<th scope=\"col\" class=\"num\">Empresas</th>"
            + "<th scope=\"col\" class=\"num\">Recompensas</th>"
            + "<th scope=\"col\" class=\"num\">Resgates</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        tenants.forEach(function (tenant, indice) {
            const estatisticas = detalhes[indice].estatisticas;
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = tenant.nome;
            tr.appendChild(tdNome);

            const tdPlano = document.createElement("td");
            tdPlano.className = tenant.plano ? "" : "muted";
            tdPlano.textContent = tenant.plano || "Sem plano definido";
            tr.appendChild(tdPlano);

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            const ativo = tenant.status === "ativo";
            badge.className = "status-badge " + (ativo ? "status-badge--aprovado" : "status-badge--recusado");
            badge.textContent = ativo ? "Ativo" : "Inativo";
            tdStatus.appendChild(badge);
            tr.appendChild(tdStatus);

            [
                ["Usuários", estatisticas.usuarios],
                ["Empresas", estatisticas.empresas],
                ["Recompensas", estatisticas.recompensas],
                ["Resgates", estatisticas.resgates]
            ].forEach(function ([rotulo, valor]) {
                const td = document.createElement("td");
                td.className = "num";
                // data-label só é lido pelo CSS no layout mobile (::before
                // — ver admin.css); no desktop o <th> já rotula a coluna.
                td.dataset.label = rotulo;
                td.textContent = window.UI.formatarNumero(valor);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        tenantsAtividadeContainerEl.innerHTML = "";
        tenantsAtividadeContainerEl.appendChild(wrap);
    }

    async function carregar() {
        try {
            const tenants = await window.plataformaApi("/plataforma/tenants");

            const totalTenants = tenants.length;
            const tenantsAtivos = tenants.filter(function (t) { return t.status === "ativo"; }).length;
            const tenantsInativos = totalTenants - tenantsAtivos;

            // Tenant mais recente — só reordena o array já buscado (por
            // criado_em), nenhuma chamada extra.
            const maisRecente = tenants.length > 0
                ? tenants.reduce(function (a, b) { return new Date(a.criado_em) > new Date(b.criado_em) ? a : b; })
                : null;

            // Uma chamada de detalhe por tenant, em paralelo — ver
            // comentário no topo do arquivo sobre o custo disso.
            const detalhes = await Promise.all(
                tenants.map(function (t) {
                    return window.plataformaApi("/plataforma/tenants/" + t.id);
                })
            );

            const totais = detalhes.reduce(function (acumulado, detalhe) {
                acumulado.usuarios += detalhe.estatisticas.usuarios;
                acumulado.empresas += detalhe.estatisticas.empresas;
                acumulado.recompensas += detalhe.estatisticas.recompensas;
                acumulado.resgates += detalhe.estatisticas.resgates;
                acumulado.movimentacoes += detalhe.estatisticas.movimentacoes_pontos;
                return acumulado;
            }, { usuarios: 0, empresas: 0, recompensas: 0, resgates: 0, movimentacoes: 0 });

            kpiGridEl.innerHTML = "";

            kpiGridEl.appendChild(criarKpiCard({
                href: "plataforma-tenants.html",
                label: "Total de tenants",
                valor: window.UI.formatarNumero(totalTenants),
                nota: maisRecente ? "Mais recente: " + maisRecente.nome + " (" + window.UI.formatarData(maisRecente.criado_em) + ")" : null
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Tenants ativos",
                valor: window.UI.formatarNumero(tenantsAtivos)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Tenants inativos",
                valor: window.UI.formatarNumero(tenantsInativos)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Total de usuários",
                valor: window.UI.formatarNumero(totais.usuarios)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Total de empresas",
                valor: window.UI.formatarNumero(totais.empresas)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Total de recompensas",
                valor: window.UI.formatarNumero(totais.recompensas)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Total de resgates",
                valor: window.UI.formatarNumero(totais.resgates)
            }));
            kpiGridEl.appendChild(criarKpiCard({
                label: "Movimentações de pontos",
                valor: window.UI.formatarNumero(totais.movimentacoes)
            }));

            renderizarPlanos(tenants);
            renderizarAtividadePorTenant(tenants, detalhes);

        } catch (erro) {
            window.UI.definirPlaceholder(kpiGridEl, "Não foi possível carregar o dashboard.");
            window.UI.definirPlaceholder(planosListaEl, "Não foi possível carregar.");
            window.UI.definirPlaceholder(tenantsAtividadeContainerEl, "Não foi possível carregar.");
            mostrarErroDaPagina(window.plataformaMensagemDeErro(erro));
        }
    }

    carregar();
})();
