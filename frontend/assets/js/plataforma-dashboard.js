/**
 * Dashboard da plataforma Maple Tech.
 *
 * As duas únicas chamadas usadas são as rotas de plataforma JÁ EXISTENTES
 * (GET /plataforma/tenants e GET /plataforma/tenants/:id — ver Etapa
 * 3C-9). Não existe endpoint de resumo global nesta etapa, então os totais
 * de usuários/empresas/recompensas/resgates são somados aqui no frontend,
 * a partir das estatísticas por tenant que a API já devolve — nada é
 * calculado a partir de dado que a API não tenha fornecido, e nenhuma
 * linha individual (usuário, recompensa etc.) é buscada, só as contagens
 * agregadas que GET /plataforma/tenants/:id já retorna.
 *
 * Custo: 1 chamada para listar + 1 chamada por tenant. Aceitável para o
 * número de tenants esperado nesta fase (poucas dezenas, não milhares) —
 * se isso crescer, o caminho correto é um endpoint de resumo agregado no
 * backend, não otimização prematura aqui.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const kpiGridEl = document.getElementById("kpi-grid");
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

    async function carregar() {
        try {
            const tenants = await window.plataformaApi("/plataforma/tenants");

            const totalTenants = tenants.length;
            const tenantsAtivos = tenants.filter(function (t) { return t.status === "ativo"; }).length;
            const tenantsInativos = totalTenants - tenantsAtivos;

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
                return acumulado;
            }, { usuarios: 0, empresas: 0, recompensas: 0, resgates: 0 });

            kpiGridEl.innerHTML = "";

            kpiGridEl.appendChild(criarKpiCard({
                href: "plataforma-tenants.html",
                label: "Total de tenants",
                valor: window.UI.formatarNumero(totalTenants)
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

        } catch (erro) {
            window.UI.definirPlaceholder(kpiGridEl, "Não foi possível carregar o dashboard.");
            mostrarErroDaPagina(window.plataformaMensagemDeErro(erro));
        }
    }

    carregar();
})();
