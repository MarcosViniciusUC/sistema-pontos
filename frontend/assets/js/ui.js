/**
 * Helpers de UI compartilhados entre as páginas da área do cliente
 * (dashboard, histórico, recompensas) — evita repetir a mesma lógica
 * de guarda de sessão, formatação e logout em cada página.
 */
(function () {
    // Guarda usada por último nesta página — permite que a checagem certa
    // (cliente ou admin) rode de novo se a página voltar do cache do
    // navegador (ver listener de "pageshow" mais abaixo).
    let guardaAtual = null;

    function protegerPagina() {
        guardaAtual = protegerPagina;
        const token = window.Auth.obterToken();

        if (!window.Auth.possuiSessao() || window.Auth.tokenExpirado(token)) {
            window.Auth.removerSessao();
            window.location.href = "index.html";
            return null;
        }

        return token;
    }

    /**
     * Página inicial de cada tipo de usuário — usada tanto para mandar
     * alguém de volta para a área certa (protegerPaginaAdmin/Funcionario)
     * quanto para o redirecionamento logo após o login (ver app.js). Um só
     * lugar decide isso, pra área de login e guardas de página nunca
     * divergirem sobre "pra onde vai cada tipo".
     */
    function paginaInicialPorTipo(tipo) {
        if (tipo === "admin") {
            return "admin.html";
        }

        if (tipo === "funcionario") {
            return "funcionario.html";
        }

        return "dashboard.html";
    }

    /**
     * Mesma checagem de sessão de protegerPagina(), mais a exigência de
     * tipo === "admin". Qualquer outro tipo autenticado é mandado de volta
     * para a própria área (não é um erro de sessão, só a área errada).
     *
     * Isto é só UX: quem decide de verdade se uma chamada é permitida é o
     * roleMiddleware("admin") no backend, em cada requisição.
     */
    function protegerPaginaAdmin() {
        const token = protegerPagina();

        if (!token) {
            return null; // protegerPagina já redirecionou
        }

        if (window.Auth.obterTipoUsuario() !== "admin") {
            guardaAtual = null;
            window.location.href = paginaInicialPorTipo(window.Auth.obterTipoUsuario());
            return null;
        }

        guardaAtual = protegerPaginaAdmin;
        return token;
    }

    /**
     * Mesmo princípio de protegerPaginaAdmin(), exigindo tipo ===
     * "funcionario". Um admin que abrir esta página é mandado para
     * admin.html (não faz sentido um admin "perder" acesso ao navegar aqui
     * por engano); qualquer outro tipo vai para a própria área.
     *
     * Assim como no admin, isto é só UX — a autorização de verdade é o
     * roleMiddleware("admin", "funcionario") no backend, em cada rota.
     */
    function protegerPaginaFuncionario() {
        const token = protegerPagina();

        if (!token) {
            return null; // protegerPagina já redirecionou
        }

        if (window.Auth.obterTipoUsuario() !== "funcionario") {
            guardaAtual = null;
            window.location.href = paginaInicialPorTipo(window.Auth.obterTipoUsuario());
            return null;
        }

        guardaAtual = protegerPaginaFuncionario;
        return token;
    }

    // Se a página vier de volta do cache do navegador (ex: botão "voltar"
    // depois de um logout), o script não roda de novo sozinho — sem isto,
    // uma página protegida em cache poderia ficar visível por um instante
    // mesmo sem sessão válida.
    window.addEventListener("pageshow", function (evento) {
        if (evento.persisted && guardaAtual) {
            guardaAtual();
        }
    });

    function configurarSaudacaoELogout(saudacaoId, logoutBtnId) {
        const saudacaoEl = document.getElementById(saudacaoId);
        const logoutBtn = document.getElementById(logoutBtnId);

        if (saudacaoEl) {
            const email = window.Auth.obterEmail();
            saudacaoEl.textContent = email ? `Olá, ${email}` : "Olá!";
        }

        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                window.Auth.logout();
            });
        }
    }

    function formatarData(isoString) {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }).format(new Date(isoString));
    }

    function formatarNumero(numero) {
        return new Intl.NumberFormat("pt-BR").format(numero);
    }

    function criarItemHistorico(mov) {
        const item = document.createElement("li");
        item.className = "history-item";

        const info = document.createElement("div");

        const descricao = document.createElement("p");
        descricao.className = "history-item__descricao";
        // A descrição vem exatamente como registrada pela API — não inventamos
        // uma origem quando a API não informa nenhuma.
        descricao.textContent = mov.descricao
            || (mov.tipo === "entrada" ? "Entrada de pontos" : "Saída de pontos");

        const data = document.createElement("p");
        data.className = "history-item__data";
        data.textContent = formatarData(mov.criado_em);

        info.appendChild(descricao);
        info.appendChild(data);

        const quantidade = document.createElement("span");
        const sinal = mov.tipo === "entrada" ? "+" : "−";
        quantidade.className = "history-item__quantidade history-item__quantidade--" + mov.tipo;
        quantidade.textContent = sinal + formatarNumero(mov.quantidade) + " pts";

        item.appendChild(info);
        item.appendChild(quantidade);
        return item;
    }

    function definirPlaceholder(container, texto, tag) {
        container.innerHTML = "";
        const elemento = document.createElement(tag || "p");
        elemento.className = "dash-section__placeholder";
        elemento.textContent = texto;
        container.appendChild(elemento);
    }

    /**
     * Controlador genérico de modal: abre/fecha, trava o resto da página
     * com `inert` (contém o foco de teclado dentro da modal), fecha com
     * Esc ou clique fora, e devolve o foco a quem abriu.
     *
     * opcoes.podeFechar: função opcional que retorna false para impedir o
     * fechamento (ex: enquanto uma requisição está em andamento).
     * opcoes.aoAbrir: função opcional chamada toda vez que a modal abre.
     * opcoes.aoFechar: função opcional chamada toda vez que a modal
     * realmente fecha (Esc, clique fora, botão de fechar ou fechar()
     * chamado pelo próprio código) — útil para liberar recursos abertos
     * enquanto a modal estava aberta (ex: parar a câmera de um scanner).
     */
    function criarControladorModal(overlayEl, opcoes) {
        const config = opcoes || {};
        const shellEl = document.querySelector(".app-shell, .admin-shell");
        let elementoOrigem = null;

        function podeFechar() {
            return typeof config.podeFechar !== "function" || config.podeFechar();
        }

        function fecharComEsc(evento) {
            if (evento.key === "Escape") {
                fechar();
            }
        }

        function abrir(origem) {
            elementoOrigem = origem || null;

            if (shellEl) {
                shellEl.inert = true;
            }

            overlayEl.hidden = false;
            document.addEventListener("keydown", fecharComEsc);

            if (typeof config.aoAbrir === "function") {
                config.aoAbrir();
            }
        }

        // forcar === true ignora a checagem de podeFechar() — usado pelo
        // próprio código da página para fechar a modal depois de uma ação
        // concluída com sucesso, mesmo que o botão de confirmação ainda
        // esteja desabilitado (só é reabilitado no "finally", que roda
        // depois do fechar() do caminho de sucesso). Sem isso, a modal nunca
        // fechava sozinha: o fechamento "por decisão do app" caía na mesma
        // trava pensada só para bloquear Escape/clique-fora durante o envio.
        //
        // Comparação estrita (=== true, não só "truthy"): fechar é usado
        // direto como callback de clique em vários botões Cancelar/Fechar
        // (ex: addEventListener("click", controlador.fechar)) — nesses casos
        // o clique passa o Event como primeiro argumento, e um Event é
        // "truthy", então um teste frouxo (!forcar) bypassaria a trava também
        // para esses cliques normais, não só para o fechamento forçado.
        function fechar(forcar) {
            if (forcar !== true && !podeFechar()) {
                return;
            }

            if (typeof config.aoFechar === "function") {
                config.aoFechar();
            }

            overlayEl.hidden = true;
            document.removeEventListener("keydown", fecharComEsc);

            if (shellEl) {
                shellEl.inert = false;
            }

            if (elementoOrigem) {
                elementoOrigem.focus();
            }
        }

        overlayEl.addEventListener("click", function (evento) {
            if (evento.target === overlayEl) {
                fechar();
            }
        });

        return { abrir, fechar };
    }

    function mensagemDeErro(erro, mensagemPadrao) {
        return erro instanceof window.ApiError
            ? erro.message
            : (mensagemPadrao || "Não foi possível conectar ao servidor. Tente novamente.");
    }

    // ==========================================================================
    // Progresso de fidelização (Bloco 1 da V2) — cálculo puro, sem chamada à
    // API própria: sempre a partir do saldo (GET /pontos/saldo) e do catálogo
    // de recompensas (GET /recompensas ou GET /favoritos) que a própria
    // página já carregou para outro fim. Compartilhado entre
    // dashboard.js/recompensas.js/favoritos.js para o cálculo nunca divergir
    // entre as três telas.
    //
    // Isto é sempre e só apresentação: o backend nunca lê nem confia em
    // nenhum valor calculado aqui para autorizar um resgate — a validação de
    // saldo que vale de verdade continua inteiramente em
    // redemption.controller.js, a cada requisição.
    // ==========================================================================

    // Regra do "quase lá": 80% do caminho até o custo da recompensa (não um
    // número fixo de pontos) — escolhida por escalar corretamente tanto para
    // recompensas baratas quanto caras, em vez de um valor absoluto que
    // seria generoso demais para uma recompensa de 50 pontos e apertado
    // demais para uma de 5000.
    const QUASE_LA_PERCENTUAL = 0.8;

    /**
     * Progresso do saldo atual em direção ao custo de UMA recompensa
     * específica. `percentual` já vem limitado a [0, 100] (protege contra
     * saldo=0, saldo muito acima do custo, ou custo muito baixo).
     */
    function calcularProgresso(saldo, pontosNecessarios) {
        const razao = pontosNecessarios > 0 ? saldo / pontosNecessarios : 1;
        const percentual = Math.max(0, Math.min(100, Math.round(razao * 100)));
        const disponivel = saldo >= pontosNecessarios;

        return {
            percentual: percentual,
            faltam: Math.max(0, pontosNecessarios - saldo),
            disponivel: disponivel,
            quaseLa: !disponivel && razao >= QUASE_LA_PERCENTUAL
        };
    }

    /**
     * A recompensa com MENOR pontos_necessarios entre as que o saldo ainda
     * não alcança — "próxima recompensa" do dashboard. `recompensas` deve
     * conter só recompensas ativas (o chamador filtra antes); não assume
     * nenhuma ordenação de entrada (GET /favoritos, por exemplo, vem
     * ordenado por data de favorito, não por pontos). Retorna null quando o
     * saldo já cobre todas (nada acima dele).
     */
    function encontrarProximaRecompensa(recompensas, saldo) {
        return recompensas
            .filter(function (r) { return r.pontos_necessarios > saldo; })
            .reduce(function (menor, atual) {
                if (!menor || atual.pontos_necessarios < menor.pontos_necessarios) {
                    return atual;
                }
                return menor;
            }, null);
    }

    /**
     * Todas as recompensas que o saldo já cobre, da mais barata para a mais
     * cara — usada para identificar "a oportunidade mais relevante" quando o
     * cliente já tem pontos suficientes para uma ou mais recompensas (nunca
     * dá a entender que só existe uma, quando existem várias).
     */
    function encontrarRecompensasDesbloqueadas(recompensas, saldo) {
        return recompensas
            .filter(function (r) { return r.pontos_necessarios <= saldo; })
            .slice()
            .sort(function (a, b) { return a.pontos_necessarios - b.pontos_necessarios; });
    }

    /**
     * Barra de progresso acessível: `role="progressbar"` com
     * aria-valuenow/min/max, mais um aria-label textual — o progresso nunca
     * depende só da cor/largura visual para ser entendido (leitor de tela
     * anuncia o rótulo por extenso, ex: "720 de 800 pontos para Sessão de
     * Personal Trainer").
     */
    function criarBarraProgresso(percentual, rotuloAcessivel) {
        const barra = document.createElement("div");
        barra.className = "progress-bar";
        barra.setAttribute("role", "progressbar");
        barra.setAttribute("aria-valuemin", "0");
        barra.setAttribute("aria-valuemax", "100");
        barra.setAttribute("aria-valuenow", String(percentual));

        if (rotuloAcessivel) {
            barra.setAttribute("aria-label", rotuloAcessivel);
        }

        const preenchimento = document.createElement("div");
        preenchimento.className = "progress-bar__fill";
        preenchimento.style.width = percentual + "%";
        barra.appendChild(preenchimento);

        return barra;
    }

    /**
     * Liga o botão "☰ Menu" que colapsa a navegação principal (.bottom-nav
     * do cliente ou .admin-nav do admin) no celular — no desktop o CSS já
     * mantém essa navegação sempre visível (ver dashboard.css/admin.css),
     * então isto só tem efeito em telas pequenas. Não fecha o menu ao clicar
     * num link: são links de verdade, a navegação pra outra página já
     * descarta esse estado sozinha.
     *
     * Não confundir com o menu interno de abas do funcionário
     * (#tabs-menu-btn/#tabs-menu, só em funcionario.js) — são conceitos
     * separados, com classes e função próprias.
     *
     * Não faz nada se os elementos não existirem (ex: a tela do funcionário,
     * que não tem navegação principal entre páginas).
     */
    function configurarMenuPrincipal(botaoId, navId) {
        const botao = document.getElementById(botaoId);
        const nav = document.getElementById(navId);

        if (!botao || !nav) {
            return;
        }

        botao.addEventListener("click", function () {
            const vaiAbrir = !nav.classList.contains("is-open");
            nav.classList.toggle("is-open", vaiAbrir);
            botao.setAttribute("aria-expanded", String(vaiAbrir));
        });
    }

    window.UI = {
        protegerPagina,
        protegerPaginaAdmin,
        protegerPaginaFuncionario,
        paginaInicialPorTipo,
        configurarSaudacaoELogout,
        configurarMenuPrincipal,
        formatarData,
        formatarNumero,
        criarItemHistorico,
        criarControladorModal,
        definirPlaceholder,
        mensagemDeErro,
        calcularProgresso,
        encontrarProximaRecompensa,
        encontrarRecompensasDesbloqueadas,
        criarBarraProgresso
    };
})();
