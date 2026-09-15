/**
 * Onboarding de um novo tenant — wizard de 5 passos que termina numa ÚNICA
 * chamada, POST /plataforma/onboarding (ver
 * plataformaTenant.controller.js:onboarding), nunca 3 chamadas separadas —
 * é exatamente essa atomicidade que garante que nunca existe um tenant
 * "pela metade" (criado, mas sem admin ou sem empresa). Os passos 1-4 só
 * coletam e validam dados NO FRONTEND (UX); nada é enviado à API até a
 * confirmação final no passo 5.
 *
 * Plano: os cards do passo 2 vêm de GET /plataforma/planos (fonte central
 * de verdade — src/services/planosFuncionalidades.service.js), nunca uma
 * lista de funcionalidades reescrita à mão aqui.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    // Rótulos de exibição das funcionalidades OPCIONAIS (catálogo real, ver
    // migrate-planos-funcionalidades.js) — só o texto, nunca a regra de
    // quem tem o quê (isso vem sempre da API). As funcionalidades de base
    // (pontos, QR Code, recompensas, resgates, funcionários, histórico,
    // recuperação de senha) não têm chave nenhuma no catálogo — são
    // incluídas incondicionalmente em qualquer plano, texto fixo no HTML
    // (ver painel-2 em plataforma-onboarding.html).
    const ROTULOS_FUNCIONALIDADE = {
        favoritos: "Favoritos",
        recompensas_destaque: "Recompensas em destaque",
        gamificacao_progresso: "Gamificação/progresso"
    };

    const pageMessageEl = document.getElementById("page-message");
    const form = document.getElementById("form-onboarding");
    const btnVoltar = document.getElementById("btn-voltar");
    const btnAvancar = document.getElementById("btn-avancar");
    const btnConfirmar = document.getElementById("btn-confirmar");
    const btnConfirmarLabel = btnConfirmar.querySelector(".btn__label");
    const btnVerTenants = document.getElementById("btn-ver-tenants");

    const TOTAL_PASSOS = 5;
    let passoAtual = 1;
    let planosCarregados = [];
    let planoSelecionado = null;

    function mostrarMensagemPagina(html, tipo) {
        pageMessageEl.innerHTML = html;
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    // ==========================================================================
    // Slugify local — mesma prévia de admin-empresas.js/plataforma-tenants.js
    // (window.UI não expõe isto). Quem decide de verdade continua sendo o
    // backend (normalizarSlug, ver src/utils/empresas.js).
    // ==========================================================================
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

    function ligarSlugAutomatico(nomeInput, slugInput) {
        let editadoManualmente = false;
        nomeInput.addEventListener("input", function () {
            if (!editadoManualmente) {
                slugInput.value = slugifyLocal(nomeInput.value);
            }
        });
        slugInput.addEventListener("input", function () {
            editadoManualmente = true;
        });
    }

    ligarSlugAutomatico(document.getElementById("tenant-nome"), document.getElementById("tenant-slug"));
    ligarSlugAutomatico(document.getElementById("empresa-nome"), document.getElementById("empresa-slug"));

    // Máscara simples de CPF — mesma ideia de cadastro.js, só para
    // digitação; validação real continua sendo validarCpf() no backend.
    const cpfInput = document.getElementById("admin-cpf");
    cpfInput.addEventListener("input", function () {
        const digitos = cpfInput.value.replace(/\D/g, "").slice(0, 11);
        cpfInput.value = digitos
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    });

    // ==========================================================================
    // Navegação entre passos
    // ==========================================================================

    function mostrarErroDoPasso(passo, texto) {
        const el = document.getElementById("erro-passo-" + passo);
        el.textContent = texto;
        el.hidden = false;
    }

    function limparErroDoPasso(passo) {
        const el = document.getElementById("erro-passo-" + passo);
        el.hidden = true;
        el.textContent = "";
    }

    function atualizarIndicadorDePassos() {
        document.querySelectorAll(".onboarding-steps__item").forEach(function (item) {
            const numero = Number(item.dataset.step);
            item.classList.toggle("is-current", numero === passoAtual);
            item.classList.toggle("is-done", numero < passoAtual);
        });
    }

    function mostrarPasso(passo) {
        for (let i = 1; i <= TOTAL_PASSOS; i++) {
            document.getElementById("painel-" + i).hidden = i !== passo;
        }
        document.getElementById("painel-resultado").hidden = true;

        btnVoltar.hidden = passo === 1;
        btnAvancar.hidden = passo === TOTAL_PASSOS;
        btnConfirmar.hidden = passo !== TOTAL_PASSOS;
        btnVerTenants.hidden = true;
        form.hidden = false;

        passoAtual = passo;
        atualizarIndicadorDePassos();

        if (passo === 2) {
            carregarPlanos();
        }
        if (passo === 5) {
            renderizarRevisao();
        }
    }

    // Validação de CADA passo (UX — o backend valida tudo de novo em
    // POST /plataforma/onboarding; nada aqui substitui isso).
    function validarPassoAtual() {
        limparErroDoPasso(passoAtual);

        if (passoAtual === 1) {
            const nome = document.getElementById("tenant-nome").value.trim();
            const slug = document.getElementById("tenant-slug").value.trim();
            if (!nome) { mostrarErroDoPasso(1, "Informe o nome do negócio."); return false; }
            if (!slug) { mostrarErroDoPasso(1, "Não foi possível gerar um slug a partir desse nome — informe um manualmente."); return false; }
            return true;
        }

        if (passoAtual === 2) {
            if (!planoSelecionado) { mostrarErroDoPasso(2, "Escolha um plano para continuar."); return false; }
            return true;
        }

        if (passoAtual === 3) {
            const nome = document.getElementById("admin-nome").value.trim();
            const email = document.getElementById("admin-email").value.trim();
            const cpf = document.getElementById("admin-cpf").value.trim();
            const senha = document.getElementById("admin-senha").value;
            if (!nome || nome.length < 2) { mostrarErroDoPasso(3, "Informe o nome do administrador."); return false; }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mostrarErroDoPasso(3, "Informe um email em formato válido."); return false; }
            if (!cpf) { mostrarErroDoPasso(3, "Informe o CPF do administrador."); return false; }
            if (!senha || senha.length < 6) { mostrarErroDoPasso(3, "A senha deve ter no mínimo 6 caracteres."); return false; }
            return true;
        }

        if (passoAtual === 4) {
            const nome = document.getElementById("empresa-nome").value.trim();
            const slug = document.getElementById("empresa-slug").value.trim();
            if (!nome) { mostrarErroDoPasso(4, "Informe o nome da empresa/unidade."); return false; }
            if (!slug) { mostrarErroDoPasso(4, "Não foi possível gerar um slug a partir desse nome — informe um manualmente."); return false; }
            return true;
        }

        return true;
    }

    btnAvancar.addEventListener("click", function () {
        if (validarPassoAtual()) {
            mostrarPasso(passoAtual + 1);
        }
    });

    btnVoltar.addEventListener("click", function () {
        limparErroDoPasso(passoAtual);
        mostrarPasso(passoAtual - 1);
    });

    // ==========================================================================
    // Passo 2 — planos (fonte central de verdade)
    // ==========================================================================

    function renderizarPlanos() {
        const container = document.getElementById("planos-cards");
        container.innerHTML = "";

        planosCarregados.forEach(function (plano) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "plano-card" + (planoSelecionado === plano.codigo ? " is-selected" : "");
            card.setAttribute("aria-pressed", String(planoSelecionado === plano.codigo));

            const nome = document.createElement("p");
            nome.className = "plano-card__nome";
            nome.textContent = plano.nome;
            card.appendChild(nome);

            const limite = document.createElement("p");
            limite.className = "plano-card__limite";
            limite.textContent = plano.limiteEmpresas === 1
                ? "1 empresa/unidade"
                : `até ${plano.limiteEmpresas} empresas/unidades`;
            card.appendChild(limite);

            if (plano.funcionalidades.length > 0) {
                const lista = document.createElement("ul");
                lista.className = "plano-card__lista";
                plano.funcionalidades.forEach(function (chave) {
                    const item = document.createElement("li");
                    item.textContent = ROTULOS_FUNCIONALIDADE[chave] || chave;
                    lista.appendChild(item);
                });
                card.appendChild(lista);
            }

            card.addEventListener("click", function () {
                planoSelecionado = plano.codigo;
                renderizarPlanos();
            });

            container.appendChild(card);
        });
    }

    let planosJaCarregados = false;

    async function carregarPlanos() {
        if (planosJaCarregados) {
            return;
        }

        try {
            planosCarregados = await window.plataformaApi("/plataforma/planos");
            planosJaCarregados = true;
            renderizarPlanos();
        } catch (erro) {
            document.getElementById("planos-cards").innerHTML = "";
            mostrarErroDoPasso(2, window.plataformaMensagemDeErro(erro, "Não foi possível carregar os planos agora."));
        }
    }

    // ==========================================================================
    // Passo 5 — revisão (nunca mostra a senha de volta)
    // ==========================================================================

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

    function renderizarRevisao() {
        const container = document.getElementById("revisao-container");
        container.innerHTML = "";

        const tenantNome = document.getElementById("tenant-nome").value.trim();
        const tenantSlug = document.getElementById("tenant-slug").value.trim();
        const planoNome = (planosCarregados.find(function (p) { return p.codigo === planoSelecionado; }) || {}).nome || planoSelecionado;
        const adminNome = document.getElementById("admin-nome").value.trim();
        const adminEmail = document.getElementById("admin-email").value.trim();
        const empresaNome = document.getElementById("empresa-nome").value.trim();

        container.appendChild(criarReceiptRow("Negócio", tenantNome));
        container.appendChild(criarReceiptRow("Slug", tenantSlug));
        container.appendChild(criarReceiptRow("Plano", planoNome));
        container.appendChild(criarReceiptRow("Administrador", adminNome + " (" + adminEmail + ")"));
        container.appendChild(criarReceiptRow("Empresa/unidade", empresaNome));
        container.appendChild(criarReceiptRow("URL lógica", tenantSlug + ".mapletech.com.br"));
    }

    // ==========================================================================
    // Confirmação final — ÚNICA chamada à API
    // ==========================================================================

    function renderizarResultado(resultado) {
        const container = document.getElementById("resultado-container");
        container.innerHTML = "";

        container.appendChild(criarReceiptRow("Nome", resultado.tenant.nome));
        container.appendChild(criarReceiptRow("Slug", resultado.tenant.slug));
        container.appendChild(criarReceiptRow("Plano", resultado.tenant.plano));

        const linhaStatus = document.createElement("div");
        linhaStatus.className = "receipt-row";
        const labelStatus = document.createElement("span");
        labelStatus.className = "receipt-row__label";
        labelStatus.textContent = "Status";
        const badge = document.createElement("span");
        badge.className = "status-badge status-badge--aprovado";
        badge.textContent = "Ativo";
        linhaStatus.appendChild(labelStatus);
        linhaStatus.appendChild(badge);
        container.appendChild(linhaStatus);

        container.appendChild(criarReceiptRow("Administrador criado", resultado.admin.nome + " (" + resultado.admin.email + ")"));
        container.appendChild(criarReceiptRow("Empresa inicial criada", resultado.empresa.nome));
        container.appendChild(criarReceiptRow("Limite de empresas do plano", resultado.limiteEmpresas === null ? "Sem limite" : String(resultado.limiteEmpresas)));

        const funcionalidadesLigadas = Object.keys(resultado.funcionalidades)
            .filter(function (chave) { return resultado.funcionalidades[chave]; })
            .map(function (chave) { return ROTULOS_FUNCIONALIDADE[chave] || chave; });
        container.appendChild(criarReceiptRow(
            "Funcionalidades extras habilitadas",
            funcionalidadesLigadas.length > 0 ? funcionalidadesLigadas.join(", ") : "Nenhuma (plano Essencial)"
        ));

        // URL lógica — só texto exibido pela interface nesta etapa; nenhum
        // DNS/domínio real é configurado (ver comentário no controller).
        container.appendChild(criarReceiptRow("URL lógica", "https://" + resultado.tenant.slug + ".mapletech.com.br"));

        const linkDetalhe = document.createElement("p");
        const link = document.createElement("a");
        link.href = "plataforma-tenant-detalhe.html?id=" + encodeURIComponent(resultado.tenant.id);
        link.textContent = "Ver detalhes do tenant";
        linkDetalhe.appendChild(link);
        container.appendChild(linkDetalhe);

        for (let i = 1; i <= TOTAL_PASSOS; i++) {
            document.getElementById("painel-" + i).hidden = true;
        }
        document.getElementById("painel-resultado").hidden = false;

        btnVoltar.hidden = true;
        btnAvancar.hidden = true;
        btnConfirmar.hidden = true;
        btnVerTenants.hidden = false;

        document.querySelectorAll(".onboarding-steps__item").forEach(function (item) {
            item.classList.remove("is-current");
            item.classList.add("is-done");
        });
    }

    form.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        if (passoAtual !== TOTAL_PASSOS || !validarPassoAtual()) {
            return;
        }

        btnConfirmar.disabled = true;
        btnConfirmar.classList.add("is-loading");
        btnConfirmarLabel.textContent = "Criando...";
        limparErroDoPasso(5);

        const corpo = {
            tenant: {
                nome: document.getElementById("tenant-nome").value.trim(),
                slug: document.getElementById("tenant-slug").value.trim(),
                plano: planoSelecionado
            },
            admin: {
                nome: document.getElementById("admin-nome").value.trim(),
                email: document.getElementById("admin-email").value.trim(),
                cpf: document.getElementById("admin-cpf").value.trim(),
                telefone: document.getElementById("admin-telefone").value.trim() || undefined,
                senha: document.getElementById("admin-senha").value
            },
            empresa: {
                nome: document.getElementById("empresa-nome").value.trim(),
                slug: document.getElementById("empresa-slug").value.trim()
            }
        };

        try {
            const resultado = await window.plataformaApi("/plataforma/onboarding", {
                method: "POST",
                body: corpo
            });

            renderizarResultado(resultado);
            mostrarMensagemPagina("Tenant criado com sucesso.", "sucesso");

        } catch (erro) {
            // Erro aqui significa que NADA foi salvo (a transação inteira é
            // desfeita no backend em qualquer falha) — o operador pode
            // corrigir e reenviar sem se preocupar com duplicidade.
            mostrarErroDoPasso(5, window.plataformaMensagemDeErro(erro, "Não foi possível criar o tenant agora. Nenhum dado foi salvo."));

        } finally {
            btnConfirmar.disabled = false;
            btnConfirmar.classList.remove("is-loading");
            btnConfirmarLabel.textContent = "Criar tenant";
        }
    });

    mostrarPasso(1);
})();
