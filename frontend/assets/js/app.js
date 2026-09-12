/**
 * Lógica da tela de login.
 */
(function () {
    // Mesmo mapeamento de window.UI.paginaInicialPorTipo (ui.js) — duplicado
    // aqui porque a tela de login não carrega ui.js (não usa nada mais de
    // lá) e não vale a pena criar essa dependência só por esta função.
    function paginaInicialPorTipo() {
        const tipo = window.Auth.obterTipoUsuario();

        if (tipo === "admin") {
            return "admin.html";
        }

        if (tipo === "funcionario") {
            return "funcionario.html";
        }

        return "dashboard.html";
    }

    if (window.Auth.possuiSessao() && !window.Auth.tokenExpirado(window.Auth.obterToken())) {
        window.location.href = paginaInicialPorTipo();
        return;
    }

    const form = document.getElementById("login-form");
    const cpfInput = document.getElementById("cpf");
    const senhaInput = document.getElementById("senha");
    const submitBtn = document.getElementById("submit-btn");
    const submitLabel = submitBtn.querySelector(".btn__label");
    const messageBox = document.getElementById("form-message");

    // Máscara "inteligente": só formata como CPF quando o valor digitado é
    // puramente numérico. No momento em que aparece uma letra ou "@", para
    // de mascarar e deixa o valor passar intacto — é assim que as 3 contas
    // de exceção (identificadoresLegado.js no backend) conseguem digitar
    // "admin", "funcio" ou "maria@teste.com" neste mesmo campo, sem que o
    // login vire um formulário genérico "CPF ou email" para todo mundo (a
    // decisão de quem é exceção continua sendo só do backend).
    function aplicarMascaraSeForNumerico(valor) {
        if (/[a-zA-Z@]/.test(valor)) {
            return valor;
        }

        const digitos = valor.replace(/\D/g, "").slice(0, 11);

        return digitos
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }

    cpfInput.addEventListener("input", function () {
        cpfInput.value = aplicarMascaraSeForNumerico(cpfInput.value);
    });

    function mostrarMensagem(texto, tipo) {
        const icone = tipo === "erro" ? "!" : "✓";

        messageBox.innerHTML = "";

        const spanIcone = document.createElement("span");
        spanIcone.className = "form-message__icon";
        spanIcone.setAttribute("aria-hidden", "true");
        spanIcone.textContent = icone;

        const spanTexto = document.createElement("span");
        spanTexto.textContent = texto;

        messageBox.appendChild(spanIcone);
        messageBox.appendChild(spanTexto);
        messageBox.className = "form-message form-message--" + tipo;
        messageBox.hidden = false;
    }

    function esconderMensagem() {
        messageBox.hidden = true;
        messageBox.textContent = "";
    }

    // Lê e imediatamente apaga a marca deixada por api.js quando um 401 fora
    // da tela de login derruba a sessão (token ausente/inválido/expirado —
    // ver comentário em api.js). Apagar na leitura garante que a mensagem
    // aparece uma única vez: um F5 na própria tela de login depois disso não
    // mostra o aviso de novo, porque a chave já não existe mais.
    function consumirAvisoSessaoExpirada() {
        try {
            if (sessionStorage.getItem("movement_sessao_expirada") === "1") {
                sessionStorage.removeItem("movement_sessao_expirada");
                return true;
            }
        } catch (erroDeStorage) {
            // Navegação privada ou storage bloqueado: sem o aviso, mas o
            // login continua funcionando normalmente.
        }

        return false;
    }

    if (consumirAvisoSessaoExpirada()) {
        mostrarMensagem("Sua sessão expirou. Faça login novamente para continuar.", "erro");
    }

    function definirCarregando(carregando) {
        submitBtn.disabled = carregando;
        submitBtn.classList.toggle("is-loading", carregando);
        submitLabel.textContent = carregando ? "Entrando..." : "Entrar";
    }

    form.addEventListener("submit", async function (evento) {
        evento.preventDefault();
        esconderMensagem();

        const cpf = cpfInput.value.trim();
        const senha = senhaInput.value;

        if (!cpf || !senha) {
            mostrarMensagem("Preencha CPF e senha para continuar.", "erro");
            return;
        }

        definirCarregando(true);

        try {
            const resposta = await window.api("/login", {
                method: "POST",
                body: { cpf, senha }
            });

            const payload = window.Auth.decodificarToken(resposta.token);
            window.Auth.salvarSessao(resposta.token, payload ? payload.tipo : null);

            // Nunca guarda o valor digitado no login para a saudação "Olá,
            // ...": desde que o login passou a ser por CPF, esse valor pode
            // ser um CPF (dado pessoal que não deve aparecer solto na tela)
            // ou um identificador legado. GET /usuarios/me já existe e
            // devolve o email de contato real de qualquer conta — é sempre
            // isso que a saudação deve mostrar. Se essa chamada falhar por
            // qualquer motivo, o login já aconteceu e continua válido; só a
            // saudação cai no fallback "Olá!" (ver ui.js).
            try {
                const perfil = await window.api("/usuarios/me");
                window.Auth.salvarEmail(perfil.email);
            } catch (erroDePerfil) {
                // Não crítico — ver comentário acima.
            }

            mostrarMensagem("Login realizado com sucesso.", "sucesso");

            window.setTimeout(function () {
                window.location.href = paginaInicialPorTipo();
            }, 500);

            return;

        } catch (erro) {
            const mensagem = erro instanceof window.ApiError
                ? erro.message
                : "Não foi possível conectar ao servidor. Tente novamente.";

            mostrarMensagem(mensagem, "erro");
            definirCarregando(false);
        }
    });
})();
