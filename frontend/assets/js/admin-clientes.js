/**
 * Gerenciamento de clientes (V1 do painel admin).
 *
 * Segurança: PUT /usuarios/:id só envia nome/email/telefone — nunca tipo
 * nem senha (o backend também nunca leria esses campos, mesmo se enviados).
 * Adicionar/remover pontos sempre usa o usuario_id do cliente selecionado
 * na tabela, nunca um valor digitado livremente.
 */
(function () {
    if (!window.UI.protegerPaginaAdmin()) {
        return;
    }

    window.UI.configurarSaudacaoELogout("user-greeting", "logout-btn");
    window.UI.configurarMenuPrincipal("nav-menu-btn", "main-nav");

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const containerEl = document.getElementById("clientes-container");
    const buscaInput = document.getElementById("busca-cliente");
    const pageMessageEl = document.getElementById("page-message");

    // ---- Modal: editar cliente ----
    const formEditar = document.getElementById("form-editar");
    const editarNomeInput = document.getElementById("editar-nome");
    const editarEmailInput = document.getElementById("editar-email");
    const editarTelefoneInput = document.getElementById("editar-telefone");
    const modalEditarErrorEl = document.getElementById("modal-editar-error");
    const modalEditarConfirmarBtn = document.getElementById("modal-editar-confirmar");
    const modalEditarConfirmarLabel = modalEditarConfirmarBtn.querySelector(".btn__label");

    const controladorEditar = window.UI.criarControladorModal(
        document.getElementById("modal-editar-overlay"),
        { podeFechar: function () { return !modalEditarConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-editar-cancelar").addEventListener("click", controladorEditar.fechar);

    // ---- Modal: adicionar/remover pontos ----
    const formPontos = document.getElementById("form-pontos");
    const modalPontosTitleEl = document.getElementById("modal-pontos-title");
    const modalPontosClienteEl = document.getElementById("modal-pontos-cliente");
    const pontosQuantidadeInput = document.getElementById("pontos-quantidade");
    const pontosEmpresaCampoEl = document.getElementById("pontos-empresa-campo");
    const pontosEmpresaSelect = document.getElementById("pontos-empresa");
    const pontosDescricaoInput = document.getElementById("pontos-descricao");
    const modalPontosNotaEl = document.getElementById("modal-pontos-nota");
    const modalPontosErrorEl = document.getElementById("modal-pontos-error");
    const modalPontosConfirmarBtn = document.getElementById("modal-pontos-confirmar");
    const modalPontosConfirmarLabel = modalPontosConfirmarBtn.querySelector(".btn__label");

    const controladorPontos = window.UI.criarControladorModal(
        document.getElementById("modal-pontos-overlay"),
        { podeFechar: function () { return !modalPontosConfirmarBtn.disabled; } }
    );
    document.getElementById("modal-pontos-cancelar").addEventListener("click", controladorPontos.fechar);

    // ---- Modal: QR Code individual do cliente ----
    const modalQrNomeEl = document.getElementById("modal-qr-nome");
    const modalQrQrcodeEl = document.getElementById("modal-qr-qrcode");

    const controladorQr = window.UI.criarControladorModal(
        document.getElementById("modal-qr-overlay")
    );
    document.getElementById("modal-qr-fechar").addEventListener("click", controladorQr.fechar);

    let qrCodeInstancia = null;

    function renderizarQrCode(texto) {
        // Mesma biblioteca (qrcodejs) e mesma degradação usada no QR de
        // resgate: se não carregar, o modal só fica sem a imagem do QR.
        if (typeof QRCode === "undefined") {
            modalQrQrcodeEl.textContent = "";
            return;
        }

        if (!qrCodeInstancia) {
            modalQrQrcodeEl.innerHTML = "";
            qrCodeInstancia = new QRCode(modalQrQrcodeEl, {
                text: texto,
                width: 160,
                height: 160,
                colorDark: "#0B0D0F",
                colorLight: "#FFFFFF"
            });
        } else {
            qrCodeInstancia.makeCode(texto);
        }
    }

    function abrirModalQr(cliente, botaoOrigem) {
        modalQrNomeEl.textContent = cliente.nome;
        renderizarQrCode(cliente.qr_token);

        controladorQr.abrir(botaoOrigem);
        document.getElementById("modal-qr-fechar").focus();
    }

    let clientes = [];
    let clienteEmEdicao = null;
    let clienteParaPontos = null;
    let tipoOperacaoPontos = "entrada";

    function mostrarMensagemPagina(texto, tipo) {
        pageMessageEl.innerHTML = "";

        const icone = document.createElement("span");
        icone.className = "form-message__icon";
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = tipo === "erro" ? "!" : "✓";

        const spanTexto = document.createElement("span");
        spanTexto.textContent = texto;

        pageMessageEl.appendChild(icone);
        pageMessageEl.appendChild(spanTexto);
        pageMessageEl.className = "form-message form-message--" + tipo;
        pageMessageEl.hidden = false;
        pageMessageEl.focus();
    }

    function renderizarTabela(lista) {
        if (lista.length === 0) {
            window.UI.definirPlaceholder(containerEl, "Nenhum cliente encontrado.", "p");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");
        table.className = "data-table";

        const thead = document.createElement("thead");
        thead.innerHTML = "<tr>"
            + "<th scope=\"col\">Nome</th>"
            + "<th scope=\"col\">Email</th>"
            + "<th scope=\"col\">Telefone</th>"
            + "<th scope=\"col\" class=\"num\">Pontos</th>"
            + "<th scope=\"col\">Cadastro</th>"
            + "<th scope=\"col\">Ações</th>"
            + "</tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        lista.forEach(function (cliente) {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = cliente.nome;

            const tdEmail = document.createElement("td");
            tdEmail.textContent = cliente.email;

            const tdTelefone = document.createElement("td");
            tdTelefone.textContent = cliente.telefone || "—";
            if (!cliente.telefone) {
                tdTelefone.className = "muted";
            }

            const tdPontos = document.createElement("td");
            tdPontos.className = "num";
            const pontosDestaque = document.createElement("strong");
            pontosDestaque.className = "cliente-pontos";
            pontosDestaque.textContent = window.UI.formatarNumero(cliente.pontos);
            tdPontos.appendChild(pontosDestaque);

            const tdCadastro = document.createElement("td");
            tdCadastro.textContent = window.UI.formatarData(cliente.criado_em);

            const tdAcoes = document.createElement("td");
            const acoes = document.createElement("div");
            acoes.className = "row-actions";

            const btnEditar = document.createElement("button");
            btnEditar.type = "button";
            btnEditar.className = "btn btn--ghost";
            btnEditar.textContent = "Editar";
            btnEditar.addEventListener("click", function () {
                abrirModalEditar(cliente, btnEditar);
            });

            const btnMais = document.createElement("button");
            btnMais.type = "button";
            btnMais.className = "btn btn--ghost";
            btnMais.textContent = "+ Pontos";
            btnMais.addEventListener("click", function () {
                abrirModalPontos(cliente, "entrada", btnMais);
            });

            const btnMenos = document.createElement("button");
            btnMenos.type = "button";
            btnMenos.className = "btn btn--ghost";
            btnMenos.textContent = "− Pontos";
            btnMenos.addEventListener("click", function () {
                abrirModalPontos(cliente, "saida", btnMenos);
            });

            const btnQr = document.createElement("button");
            btnQr.type = "button";
            btnQr.className = "btn btn--ghost";
            btnQr.textContent = "Ver QR Code";
            btnQr.addEventListener("click", function () {
                abrirModalQr(cliente, btnQr);
            });

            acoes.appendChild(btnEditar);
            acoes.appendChild(btnMais);
            acoes.appendChild(btnMenos);
            acoes.appendChild(btnQr);
            tdAcoes.appendChild(acoes);

            tr.appendChild(tdNome);
            tr.appendChild(tdEmail);
            tr.appendChild(tdTelefone);
            tr.appendChild(tdPontos);
            tr.appendChild(tdCadastro);
            tr.appendChild(tdAcoes);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);

        containerEl.innerHTML = "";
        containerEl.appendChild(wrap);
    }

    function aplicarFiltro() {
        const termo = buscaInput.value.trim().toLowerCase();

        if (!termo) {
            renderizarTabela(clientes);
            return;
        }

        const filtrados = clientes.filter(function (cliente) {
            return cliente.nome.toLowerCase().includes(termo)
                || cliente.email.toLowerCase().includes(termo);
        });

        renderizarTabela(filtrados);
    }

    buscaInput.addEventListener("input", aplicarFiltro);

    async function carregarClientes() {
        try {
            const usuarios = await window.api("/usuarios");
            clientes = usuarios.filter(function (u) {
                return u.tipo === "cliente";
            });
            aplicarFiltro();

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar os clientes agora.");
            window.UI.definirPlaceholder(containerEl, mensagem, "p");
        }
    }

    // Carregada uma vez e reaproveitada sempre que o modal de pontos abre em
    // modo entrada — GET /empresas é admin/funcionário, só empresas ativas.
    async function carregarEmpresas() {
        try {
            const empresas = await window.api("/empresas");

            empresas.forEach(function (empresa) {
                const option = document.createElement("option");
                option.value = empresa.id;
                option.textContent = empresa.nome;
                pontosEmpresaSelect.appendChild(option);
            });

        } catch (erro) {
            const mensagem = window.UI.mensagemDeErro(erro, "Não foi possível carregar as empresas agora.");
            mostrarMensagemPagina(mensagem, "erro");
        }
    }

    // ==========================================================================
    // Editar cliente
    // ==========================================================================

    function abrirModalEditar(cliente, botaoOrigem) {
        clienteEmEdicao = cliente;
        editarNomeInput.value = cliente.nome;
        editarEmailInput.value = cliente.email;
        editarTelefoneInput.value = cliente.telefone || "";
        modalEditarErrorEl.hidden = true;
        modalEditarErrorEl.textContent = "";

        controladorEditar.abrir(botaoOrigem);
        editarNomeInput.focus();
    }

    formEditar.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        if (!clienteEmEdicao) {
            return;
        }

        const nome = editarNomeInput.value.trim();
        const email = editarEmailInput.value.trim();
        const telefone = editarTelefoneInput.value.trim();

        if (nome.length < 2) {
            modalEditarErrorEl.textContent = "Nome deve ter no mínimo 2 caracteres.";
            modalEditarErrorEl.hidden = false;
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            modalEditarErrorEl.textContent = "Informe um email em formato válido.";
            modalEditarErrorEl.hidden = false;
            return;
        }

        modalEditarConfirmarBtn.disabled = true;
        modalEditarConfirmarBtn.classList.add("is-loading");
        modalEditarConfirmarLabel.textContent = "Salvando...";
        modalEditarErrorEl.hidden = true;

        try {
            // telefone vai como string (mesmo vazia) e não como null: no
            // backend, COALESCE(null, telefone) mantém o valor antigo — só
            // uma string (mesmo "") realmente substitui o campo.
            const atualizado = await window.api("/usuarios/" + clienteEmEdicao.id, {
                method: "PUT",
                body: { nome, email, telefone }
            });

            const indice = clientes.findIndex(function (c) {
                return c.id === atualizado.id;
            });

            if (indice !== -1) {
                // Mescla em vez de substituir: PUT /usuarios/:id não devolve
                // "pontos" (não tem por que — edição de cadastro não mexe em
                // pontos), então um replace completo apagaria o saldo já
                // carregado até a próxima vez que a lista fosse recarregada.
                clientes[indice] = Object.assign({}, clientes[indice], atualizado);
            }

            controladorEditar.fechar(true);
            aplicarFiltro();
            mostrarMensagemPagina("Cliente atualizado com sucesso.", "sucesso");

        } catch (erro) {
            modalEditarErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível salvar as alterações agora.");
            modalEditarErrorEl.hidden = false;

        } finally {
            modalEditarConfirmarBtn.disabled = false;
            modalEditarConfirmarBtn.classList.remove("is-loading");
            modalEditarConfirmarLabel.textContent = "Salvar alterações";
        }
    });

    // ==========================================================================
    // Adicionar / remover pontos
    // ==========================================================================

    function abrirModalPontos(cliente, tipo, botaoOrigem) {
        clienteParaPontos = cliente;
        tipoOperacaoPontos = tipo;

        modalPontosTitleEl.textContent = tipo === "entrada" ? "Adicionar pontos" : "Remover pontos";
        modalPontosClienteEl.textContent = cliente.nome + " — " + cliente.email;
        pontosQuantidadeInput.value = "";
        pontosDescricaoInput.value = "";
        modalPontosErrorEl.hidden = true;
        modalPontosErrorEl.textContent = "";

        // Empresa só existe pra entrada de pontos — POST /pontos/saida não
        // foi alterado e não recebe (nem exige) esse campo.
        const ehEntrada = tipo === "entrada";
        pontosEmpresaCampoEl.hidden = !ehEntrada;
        pontosEmpresaSelect.required = ehEntrada;
        pontosEmpresaSelect.value = "";

        // Remover pontos desconta do saldo global na hora, sem confirmação
        // adicional — o aviso deixa isso claro antes do clique em "Confirmar"
        // (mesmo princípio das notas em "Desativar recompensa"/"Desativar
        // empresa": explicar a consequência antes de uma ação que não tem
        // uma tela de "desfazer" depois).
        modalPontosNotaEl.hidden = ehEntrada;
        modalPontosNotaEl.textContent = ehEntrada
            ? ""
            : "Os pontos serão descontados do saldo global do cliente imediatamente ao confirmar.";

        controladorPontos.abrir(botaoOrigem);
        pontosQuantidadeInput.focus();
    }

    formPontos.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        if (!clienteParaPontos) {
            return;
        }

        const quantidade = parseInt(pontosQuantidadeInput.value, 10);
        const descricao = pontosDescricaoInput.value.trim();
        const ehEntrada = tipoOperacaoPontos === "entrada";

        if (!Number.isInteger(quantidade) || quantidade <= 0) {
            modalPontosErrorEl.textContent = "Informe uma quantidade inteira maior que 0.";
            modalPontosErrorEl.hidden = false;
            return;
        }

        // A validação que realmente importa é a do backend — isto aqui só
        // evita uma ida ao servidor com um formulário obviamente incompleto.
        if (ehEntrada && !pontosEmpresaSelect.value) {
            modalPontosErrorEl.textContent = "Selecione a empresa que concedeu os pontos.";
            modalPontosErrorEl.hidden = false;
            return;
        }

        modalPontosConfirmarBtn.disabled = true;
        modalPontosConfirmarBtn.classList.add("is-loading");
        modalPontosConfirmarLabel.textContent = "Enviando...";
        modalPontosErrorEl.hidden = true;

        const caminho = ehEntrada ? "/pontos/entrada" : "/pontos/saida";
        const corpo = {
            usuario_id: clienteParaPontos.id,
            quantidade: quantidade,
            descricao: descricao || undefined
        };

        if (ehEntrada) {
            corpo.empresa_id = Number(pontosEmpresaSelect.value);
        }

        try {
            const movimentacao = await window.api(caminho, {
                method: "POST",
                body: corpo
            });

            const nomeCliente = clienteParaPontos.nome;
            const mensagemTipo = tipoOperacaoPontos === "entrada" ? "adicionados a" : "removidos de";

            // O saldo exibido na tabela vem direto da resposta do backend
            // (POST /pontos/entrada e /pontos/saida já retornam o saldo real,
            // recalculado a partir de movimentacoes_pontos) — nunca somado
            // ou subtraído aqui no frontend.
            const indice = clientes.findIndex(function (c) {
                return c.id === clienteParaPontos.id;
            });

            if (indice !== -1) {
                clientes[indice].pontos = movimentacao.saldo;
            }

            controladorPontos.fechar(true);
            aplicarFiltro();
            mostrarMensagemPagina(
                window.UI.formatarNumero(quantidade) + " pontos " + mensagemTipo + " " + nomeCliente + ".",
                "sucesso"
            );

        } catch (erro) {
            modalPontosErrorEl.textContent = window.UI.mensagemDeErro(erro, "Não foi possível concluir a operação agora.");
            modalPontosErrorEl.hidden = false;

        } finally {
            modalPontosConfirmarBtn.disabled = false;
            modalPontosConfirmarBtn.classList.remove("is-loading");
            modalPontosConfirmarLabel.textContent = "Confirmar";
        }
    });

    carregarEmpresas();
    carregarClientes();
})();
