/**
 * Listagem de resgates (somente consulta).
 *
 * O fluxo mudou: o backend já desconta os pontos e gera o código de
 * reserva no momento da criação do resgate (POST /resgates) — não existe
 * mais aprovação/recusa manual do admin. Os endpoints antigos
 * (PUT /resgates/:id/aprovar e /recusar) foram removidos do backend, então
 * esta página não oferece mais essas ações.
 *
 * A validação do código pelo funcionário (uma futura tela + endpoint
 * POST /resgates/validar) é uma etapa posterior — por enquanto esta tela
 * é só consulta.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const containerEl = document.getElementById("resgates-container");

    const ROTULO_STATUS = {
        pendente_validacao: "Aguardando utilização",
        utilizado: "Utilizado",
        cancelado: "Cancelado"
    };

    // Reaproveita os 3 tratamentos visuais de badge já existentes em
    // admin.css (neutro/positivo/apagado) — só troca o nome do status que
    // aponta pra cada um, sem precisar renomear CSS usado também por
    // admin-recompensas.js (badge "Ativa").
    const CLASSE_BADGE = {
        pendente_validacao: "status-badge--pendente",
        utilizado: "status-badge--aprovado",
        cancelado: "status-badge--recusado"
    };

    function renderizarTabela(lista) {
        if (lista.length === 0) {
            window.UI.definirPlaceholder(containerEl, "Não há resgates registrados.", "p");
            return;
        }

        // Aguardando utilização primeiro — é o estado mais relevante para
        // o admin acompanhar (ex: ajudar um cliente a localizar o código).
        const ordenados = lista.slice().sort(function (a, b) {
            if (a.status === b.status) return 0;
            if (a.status === "pendente_validacao") return -1;
            if (b.status === "pendente_validacao") return 1;
            return 0;
        });

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Cliente</th>"
            + "<th scope=\"col\">Recompensa</th>"
            + "<th scope=\"col\">Empresa</th>"
            + "<th scope=\"col\" class=\"num\">Pontos</th>"
            + "<th scope=\"col\">Código</th>"
            + "<th scope=\"col\">Status</th>"
            + "<th scope=\"col\">Data</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        ordenados.forEach(function (resgate) {
            const tr = document.createElement("tr");

            const tdCliente = document.createElement("td");
            tdCliente.textContent = resgate.usuario_nome;

            const tdRecompensa = document.createElement("td");
            tdRecompensa.textContent = resgate.recompensa_nome;

            // Resgates antigos podem não ter empresa definida (a recompensa
            // deles não tinha empresa no momento do resgate) — mostra um
            // texto neutro em vez de deixar a célula vazia ou "null".
            const tdEmpresa = document.createElement("td");
            if (resgate.empresa_nome) {
                tdEmpresa.textContent = resgate.empresa_nome;
            } else {
                tdEmpresa.textContent = "Não definida";
                tdEmpresa.className = "muted";
            }

            const tdPontos = document.createElement("td");
            tdPontos.className = "num";
            tdPontos.textContent = window.UI.formatarNumero(resgate.pontos);

            const tdCodigo = document.createElement("td");
            tdCodigo.textContent = resgate.codigo;

            const tdStatus = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "status-badge " + (CLASSE_BADGE[resgate.status] || "");
            badge.textContent = ROTULO_STATUS[resgate.status] || resgate.status;
            tdStatus.appendChild(badge);

            const tdData = document.createElement("td");
            tdData.textContent = window.UI.formatarData(resgate.criado_em);

            tr.appendChild(tdCliente);
            tr.appendChild(tdRecompensa);
            tr.appendChild(tdEmpresa);
            tr.appendChild(tdPontos);
            tr.appendChild(tdCodigo);
            tr.appendChild(tdStatus);
            tr.appendChild(tdData);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    async function carregarResgates() {
        try {
            const resgates = await window.api("/resgates");
            renderizarTabela(resgates);

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar os resgates agora.");
            window.UI.definirPlaceholder(containerEl, mensagem, "p");
        }
    }

    carregarResgates();
})();
