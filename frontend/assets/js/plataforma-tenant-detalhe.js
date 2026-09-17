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
 * ETAPA 3C-11 — três ações existem aqui:
 *   - Ativar/Desativar (PATCH /plataforma/tenants/:id/status), com
 *     confirmação antes de desativar;
 *   - Criar administrador inicial (POST /plataforma/tenants/:id/admin),
 *     só oferecida quando o tenant ainda não tem nenhum usuário
 *     (estatisticas.usuarios === 0) — é exatamente o cenário de "primeiro
 *     admin" que a rota existe para atender. `tenant_id` nunca aparece no
 *     formulário nem é lido dele: o tenant vem sempre do `:id` da própria
 *     URL da API, que por sua vez vem do `?id=` já resolvido nesta página
 *     (nunca de um campo editável).
 *
 * MUDANÇA DE ARQUITETURA — "Editar tenant" (nome/cor/telefone/whatsapp/
 * plano/status, PATCH /plataforma/tenants/:id): substitui o que antes era
 * `PATCH /tenant/config`, editável pelo próprio admin do tenant (removido).
 * Logo NUNCA aparece neste formulário — não é mais configurável por
 * ninguém nesta fase. Ver preencherFormularioEditarTenant()/o listener de
 * `submit` de #form-editar-tenant, abaixo.
 */
(function () {
    if (!window.PlataformaAuth.protegerPagina()) {
        return;
    }

    window.PlataformaAuth.configurarLogout("logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    // ==========================================================================
    // Link de acesso do tenant
    // ==========================================================================
    //
    // Regra de geração da URL isolada nesta ÚNICA função de propósito: os
    // subdomínios comerciais (ex: https://movement.mapletech.com.br) ainda
    // não existem (ver HOSTNAME_PADRAO_RENDER_ATUAL em
    // src/services/tenantResolver.js — mesmo domínio único usado ali).
    // Enquanto isso, todo tenant é acessado por
    // "<domínio único>/?tenantSlug=<slug>". Quando os subdomínios entrarem
    // em produção, a troca é só aqui dentro — nenhum outro lugar desta tela
    // monta esse link "na mão".
    const DOMINIO_PADRAO_ATUAL = "https://sistema-pontos-0i0k.onrender.com";

    function construirLinkDeAcesso(slug) {
        if (!slug || typeof slug !== "string" || !slug.trim()) {
            return null;
        }

        return `${DOMINIO_PADRAO_ATUAL}/?tenantSlug=${encodeURIComponent(slug.trim())}`;
    }

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

    // ---- "Editar tenant" (MUDANÇA DE ARQUITETURA — ver comentário no HTML) ----
    const formEditarTenant = document.getElementById("form-editar-tenant");
    const editarNomeInput = document.getElementById("editar-nome");
    const editarCorPickerInput = document.getElementById("editar-cor-picker");
    const editarCorPrimariaInput = document.getElementById("editar-cor-primaria");
    const editarTelefoneInput = document.getElementById("editar-telefone");
    const editarWhatsappInput = document.getElementById("editar-whatsapp");
    const editarStatusSelect = document.getElementById("editar-status");
    const editarTenantErroEl = document.getElementById("editar-tenant-erro");
    const btnSalvarEditarTenant = document.getElementById("btn-salvar-editar-tenant");
    const btnSalvarEditarTenantLabel = btnSalvarEditarTenant.querySelector(".btn__label");

    // Color picker e campo de texto ficam sincronizados nos dois sentidos —
    // quem valida de verdade o formato final continua sendo o backend
    // (mesmo padrão já usado pela extinta admin-configuracoes.js).
    editarCorPickerInput.addEventListener("input", function () {
        editarCorPrimariaInput.value = editarCorPickerInput.value.toUpperCase();
    });
    editarCorPrimariaInput.addEventListener("input", function () {
        if (/^#[0-9A-Fa-f]{6}$/.test(editarCorPrimariaInput.value)) {
            editarCorPickerInput.value = editarCorPrimariaInput.value;
        }
    });

    function preencherFormularioEditarTenant(tenant) {
        editarNomeInput.value = tenant.nome || "";
        editarCorPrimariaInput.value = tenant.corPrimaria || "";
        editarCorPickerInput.value = /^#[0-9A-Fa-f]{6}$/.test(tenant.corPrimaria) ? tenant.corPrimaria : "#7C3AED";
        editarTelefoneInput.value = tenant.telefone || "";
        editarWhatsappInput.value = tenant.whatsapp || "";
        editarStatusSelect.value = tenant.status || "ativo";
    }

    formEditarTenant.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const nome = editarNomeInput.value.trim();
        const corPrimaria = editarCorPrimariaInput.value.trim();
        const telefone = editarTelefoneInput.value.trim();
        const whatsapp = editarWhatsappInput.value.trim();
        const status = editarStatusSelect.value;

        if (!nome) {
            editarTenantErroEl.textContent = "Informe o nome do negócio.";
            editarTenantErroEl.hidden = false;
            return;
        }

        // Whitelist explícita, montada aqui (nunca um spread do form
        // inteiro): "logoUrl"/"plano"/"tenant_id"/"id" nunca podem chegar ao
        // corpo desta requisição por construção. "plano" tem sua própria
        // ação dedicada agora ("Alterar plano", ver renderizar() abaixo) —
        // nunca enviado por este formulário.
        const corpo = { nome: nome, status: status };
        if (corPrimaria) corpo.corPrimaria = corPrimaria;
        if (telefone) corpo.telefone = telefone;
        if (whatsapp) corpo.whatsapp = whatsapp;

        btnSalvarEditarTenant.disabled = true;
        btnSalvarEditarTenant.classList.add("is-loading");
        btnSalvarEditarTenantLabel.textContent = "Salvando...";
        editarTenantErroEl.hidden = true;

        try {
            // WHERE id = :id no backend — só este tenant é afetado; não há
            // campo nenhum aqui que pudesse apontar para outro id.
            await window.plataformaApi("/plataforma/tenants/" + tenantAtual.id, {
                method: "PATCH",
                body: corpo
            });

            mostrarMensagemPagina("Tenant atualizado com sucesso.", "sucesso");

            // Recarrega os dados (nunca location.reload()) — atualiza
            // "Dados do tenant"/"Identidade" com o valor já salvo, sem
            // perder o resto da página.
            carregar();

        } catch (erro) {
            editarTenantErroEl.textContent = window.plataformaMensagemDeErro(erro, "Não foi possível salvar agora.");
            editarTenantErroEl.hidden = false;

        } finally {
            btnSalvarEditarTenant.disabled = false;
            btnSalvarEditarTenant.classList.remove("is-loading");
            btnSalvarEditarTenantLabel.textContent = "Salvar alterações";
        }
    });

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

        // ---- Link de acesso ----
        // Ver construirLinkDeAcesso() (topo do arquivo) para a regra de
        // geração da URL. Reconstruída a cada renderizar() (como o resto
        // deste container) — sempre reflete o slug mais recente sem
        // depender de sincronização manual.
        const secaoLink = document.createElement("section");
        secaoLink.className = "dash-section";

        const tituloLink = document.createElement("h2");
        tituloLink.className = "dash-section__title";
        tituloLink.textContent = "Link de acesso";
        secaoLink.appendChild(tituloLink);

        const painelLink = document.createElement("div");
        painelLink.className = "operacao-panel";

        const linkDeAcesso = construirLinkDeAcesso(tenant.slug);

        if (linkDeAcesso) {
            const linhaLink = document.createElement("div");
            linhaLink.className = "receipt-row";
            const labelLink = document.createElement("span");
            labelLink.className = "receipt-row__label";
            labelLink.textContent = "URL";
            const valorLink = document.createElement("span");
            valorLink.className = "receipt-row__value";
            valorLink.textContent = linkDeAcesso;
            valorLink.style.wordBreak = "break-all";
            linhaLink.appendChild(labelLink);
            linhaLink.appendChild(valorLink);
            painelLink.appendChild(linhaLink);

            const acoesLink = document.createElement("div");
            acoesLink.style.display = "flex";
            acoesLink.style.flexWrap = "wrap";
            acoesLink.style.gap = "var(--space-3)";
            acoesLink.style.marginTop = "var(--space-2)";

            const btnCopiarLink = document.createElement("button");
            btnCopiarLink.type = "button";
            btnCopiarLink.id = "btn-copiar-link";
            btnCopiarLink.className = "btn btn--ghost";
            btnCopiarLink.textContent = "Copiar link";

            // Mesmo padrão já usado em perfil.js (copiar código do
            // cliente): troca o rótulo do botão por "Copiado!"/"Não foi
            // possível copiar" e volta ao original depois de um tempo —
            // nunca um alert() nem um segundo componente de feedback.
            btnCopiarLink.addEventListener("click", async function () {
                const rotuloOriginal = btnCopiarLink.textContent;

                try {
                    await navigator.clipboard.writeText(linkDeAcesso);
                    btnCopiarLink.textContent = "Copiado!";
                } catch (erro) {
                    btnCopiarLink.textContent = "Não foi possível copiar";
                }

                window.setTimeout(function () {
                    btnCopiarLink.textContent = rotuloOriginal;
                }, 1500);
            });
            acoesLink.appendChild(btnCopiarLink);

            const linkAbrirSistema = document.createElement("a");
            linkAbrirSistema.id = "btn-abrir-sistema";
            linkAbrirSistema.className = "btn btn--primary";
            linkAbrirSistema.textContent = "Abrir sistema";
            linkAbrirSistema.href = linkDeAcesso;
            linkAbrirSistema.target = "_blank";
            linkAbrirSistema.rel = "noopener noreferrer";
            acoesLink.appendChild(linkAbrirSistema);

            painelLink.appendChild(acoesLink);

        } else {
            // Defensivo — na prática tenants.slug é NOT NULL/UNIQUE (ver
            // migrate-tenants.js), então este ramo não deveria ser
            // alcançável hoje. Existe para nunca montar um link quebrado
            // (".../?tenantSlug=undefined") caso isso mude no futuro.
            painelLink.appendChild(criarReceiptRow("URL", "Link indisponível — este tenant não possui um slug válido."));
        }

        secaoLink.appendChild(painelLink);
        containerEl.appendChild(secaoLink);

        // Identidade — exibição (edição de verdade acontece na seção
        // "Editar tenant", fora deste container — ver
        // preencherFormularioEditarTenant abaixo). Logo continua só LEITURA
        // aqui, de propósito: não é mais configurável por ninguém nesta
        // fase. Mesmo dado devolvido por
        // plataformaTenant.controller.js:detalhar, nunca uma segunda
        // consulta/lógica aqui.
        const secaoIdentidade = document.createElement("section");
        secaoIdentidade.className = "dash-section";

        const tituloIdentidade = document.createElement("h2");
        tituloIdentidade.className = "dash-section__title";
        tituloIdentidade.textContent = "Identidade";
        secaoIdentidade.appendChild(tituloIdentidade);

        const painelIdentidade = document.createElement("div");
        painelIdentidade.className = "operacao-panel";

        if (tenant.logoUrl) {
            const linhaLogo = document.createElement("div");
            linhaLogo.className = "receipt-row";
            const labelLogo = document.createElement("span");
            labelLogo.className = "receipt-row__label";
            labelLogo.textContent = "Logo";
            const imgLogo = document.createElement("img");
            imgLogo.src = tenant.logoUrl;
            imgLogo.alt = tenant.nome;
            imgLogo.style.maxWidth = "120px";
            imgLogo.style.maxHeight = "60px";
            linhaLogo.appendChild(labelLogo);
            linhaLogo.appendChild(imgLogo);
            painelIdentidade.appendChild(linhaLogo);
        } else {
            painelIdentidade.appendChild(criarReceiptRow("Logo", "Não definida"));
        }

        if (tenant.corPrimaria) {
            const linhaCor = document.createElement("div");
            linhaCor.className = "receipt-row";
            const labelCor = document.createElement("span");
            labelCor.className = "receipt-row__label";
            labelCor.textContent = "Cor principal";
            const valorCor = document.createElement("span");
            valorCor.className = "receipt-row__value";
            const amostraCor = document.createElement("span");
            amostraCor.style.display = "inline-block";
            amostraCor.style.width = "14px";
            amostraCor.style.height = "14px";
            amostraCor.style.borderRadius = "3px";
            amostraCor.style.marginRight = "6px";
            amostraCor.style.verticalAlign = "middle";
            amostraCor.style.background = tenant.corPrimaria;
            valorCor.appendChild(amostraCor);
            valorCor.appendChild(document.createTextNode(tenant.corPrimaria));
            linhaCor.appendChild(labelCor);
            linhaCor.appendChild(valorCor);
            painelIdentidade.appendChild(linhaCor);
        } else {
            painelIdentidade.appendChild(criarReceiptRow("Cor principal", "Não definida"));
        }

        painelIdentidade.appendChild(criarReceiptRow("Telefone", tenant.telefone || "Não definido"));
        painelIdentidade.appendChild(criarReceiptRow("WhatsApp", tenant.whatsapp || "Não definido"));

        secaoIdentidade.appendChild(painelIdentidade);
        containerEl.appendChild(secaoIdentidade);

        preencherFormularioEditarTenant(tenant);

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

        // Plano/funcionalidades — mesma fonte central de verdade do
        // backend (src/services/planosFuncionalidades.service.js), nunca
        // uma segunda lógica no frontend. `dados.funcionalidades`/
        // `dados.limiteEmpresas` já vêm resolvidos por
        // plataformaTenant.controller.js:detalhar.
        const ROTULOS_FUNCIONALIDADE = {
            favoritos: "Favoritos",
            recompensas_destaque: "Recompensas em destaque",
            gamificacao_progresso: "Gamificação/progresso"
        };

        const secaoPlano = document.createElement("section");
        secaoPlano.className = "dash-section";

        const tituloPlano = document.createElement("h2");
        tituloPlano.className = "dash-section__title";
        tituloPlano.textContent = "Plano e funcionalidades";
        secaoPlano.appendChild(tituloPlano);

        const painelPlano = document.createElement("div");
        painelPlano.className = "operacao-panel";

        painelPlano.appendChild(criarReceiptRow(
            "Limite de empresas",
            dados.limiteEmpresas === null ? "Sem limite (tenant legado)" : String(dados.limiteEmpresas)
        ));

        Object.keys(ROTULOS_FUNCIONALIDADE).forEach(function (chave) {
            const linha = document.createElement("div");
            linha.className = "receipt-row";
            const label = document.createElement("span");
            label.className = "receipt-row__label";
            label.textContent = ROTULOS_FUNCIONALIDADE[chave];
            const badge = document.createElement("span");
            const ligada = Boolean(dados.funcionalidades[chave]);
            badge.className = "status-badge " + (ligada ? "status-badge--aprovado" : "status-badge--recusado");
            badge.textContent = ligada ? "Habilitada" : "Desabilitada";
            linha.appendChild(label);
            linha.appendChild(badge);
            painelPlano.appendChild(linha);
        });

        secaoPlano.appendChild(painelPlano);

        // "Alterar plano" — ação dedicada e visível, separada do formulário
        // genérico "Editar tenant" (pedido explícito desta etapa). Mesmo
        // endpoint de sempre (PATCH /plataforma/tenants/:id), só que com um
        // corpo mínimo ({ plano } sozinho) — nunca mexe em
        // nome/cor/telefone/whatsapp/status ao salvar. Reconstruída a cada
        // renderizar() (como o resto deste container), então sempre reflete
        // o plano mais recente sem precisar de sincronização manual com o
        // formulário "Editar tenant".
        const painelAlterarPlano = document.createElement("div");
        painelAlterarPlano.className = "operacao-panel";

        const campoPlano = document.createElement("div");
        campoPlano.className = "field";

        const labelPlano = document.createElement("label");
        labelPlano.setAttribute("for", "alterar-plano-select");
        labelPlano.textContent = "Plano atual";
        campoPlano.appendChild(labelPlano);

        const selectPlano = document.createElement("select");
        selectPlano.id = "alterar-plano-select";

        // Tenant "legado" (plano NULL — hoje só o Movement): mostra uma
        // opção informativa própria, selecionada por padrão, para nunca dar
        // a entender que "Essencial" já é o plano atual dele. Escolher
        // qualquer uma das 3 opções reais é sempre uma ação deliberada de
        // quem está usando o painel — nunca pré-selecionada sozinha.
        if (!tenant.plano) {
            const optLegado = document.createElement("option");
            optLegado.value = "";
            optLegado.textContent = "Sem plano definido (legado)";
            selectPlano.appendChild(optLegado);
        }

        [["essencial", "Essencial"], ["profissional", "Profissional"], ["premium", "Premium"]].forEach(function ([codigo, rotulo]) {
            const opt = document.createElement("option");
            opt.value = codigo;
            opt.textContent = rotulo;
            selectPlano.appendChild(opt);
        });

        selectPlano.value = tenant.plano || "";
        campoPlano.appendChild(selectPlano);
        painelAlterarPlano.appendChild(campoPlano);

        const erroPlanoEl = document.createElement("p");
        erroPlanoEl.className = "modal__error";
        erroPlanoEl.hidden = true;
        painelAlterarPlano.appendChild(erroPlanoEl);

        const btnSalvarPlano = document.createElement("button");
        btnSalvarPlano.type = "button";
        btnSalvarPlano.className = "btn btn--primary";
        btnSalvarPlano.textContent = "Salvar plano";
        btnSalvarPlano.addEventListener("click", async function () {
            const novoPlano = selectPlano.value;

            if (!novoPlano) {
                erroPlanoEl.textContent = "Escolha um plano (Essencial, Profissional ou Premium) para salvar.";
                erroPlanoEl.hidden = false;
                return;
            }

            erroPlanoEl.hidden = true;
            btnSalvarPlano.disabled = true;
            const rotuloOriginal = btnSalvarPlano.textContent;
            btnSalvarPlano.textContent = "Salvando...";

            try {
                // WHERE id = :id no backend, corpo só com "plano" — nunca
                // toca em tenant_id/id/nome/cor/telefone/whatsapp/status, e
                // nunca em overrides (tenant_funcionalidades_override/
                // limite_empresas_override): a troca de plano só atualiza
                // tenants.plano, exatamente como o resto da arquitetura de
                // planos/funcionalidades já espera.
                await window.plataformaApi("/plataforma/tenants/" + tenantAtual.id, {
                    method: "PATCH",
                    body: { plano: novoPlano }
                });

                mostrarMensagemPagina("Plano atualizado com sucesso.", "sucesso");
                carregar();

            } catch (erro) {
                erroPlanoEl.textContent = window.plataformaMensagemDeErro(erro, "Não foi possível salvar o plano agora.");
                erroPlanoEl.hidden = false;
                btnSalvarPlano.disabled = false;
                btnSalvarPlano.textContent = rotuloOriginal;
            }
        });
        painelAlterarPlano.appendChild(btnSalvarPlano);

        secaoPlano.appendChild(painelAlterarPlano);
        containerEl.appendChild(secaoPlano);

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
