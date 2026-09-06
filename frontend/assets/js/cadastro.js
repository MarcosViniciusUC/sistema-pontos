/**
 * Lógica da tela de cadastro público (POST /usuarios).
 *
 * O backend já define tipo='cliente' para todo cadastro feito por aqui —
 * o frontend nunca envia "tipo" (nem teria como criar admin/funcionário
 * por essa via, mesmo tentando). A confirmação de senha nunca é enviada
 * à API: existe só pra conferência local, antes do envio.
 *
 * Sem login automático depois do cadastro — sucesso só mostra a mensagem
 * e redireciona para a tela de login, igual pedido.
 */
(function () {
    // Mesmo mapeamento/motivo já usado em app.js: esta tela também não
    // carrega ui.js, então não vale criar essa dependência só por isto.
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

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const form = document.getElementById("cadastro-form");
    const nomeInput = document.getElementById("nome");
    const emailInput = document.getElementById("email");
    const telefoneInput = document.getElementById("telefone");
    const senhaInput = document.getElementById("senha");
    const confirmarSenhaInput = document.getElementById("confirmar-senha");
    const submitBtn = document.getElementById("submit-btn");
    const submitLabel = submitBtn.querySelector(".btn__label");
    const messageBox = document.getElementById("form-message");

    function mostrarMensagem(texto, tipo) {
        messageBox.innerHTML = "";

        const spanIcone = document.createElement("span");
        spanIcone.className = "form-message__icon";
        spanIcone.setAttribute("aria-hidden", "true");
        spanIcone.textContent = tipo === "erro" ? "!" : "✓";

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

    function definirCarregando(carregando) {
        submitBtn.disabled = carregando;
        submitBtn.classList.toggle("is-loading", carregando);
        submitLabel.textContent = carregando ? "Criando conta..." : "Criar conta";
    }

    form.addEventListener("submit", async function (evento) {
        evento.preventDefault();
        esconderMensagem();

        const nome = nomeInput.value.trim();
        const email = emailInput.value.trim();
        const telefone = telefoneInput.value.trim();
        const senha = senhaInput.value;
        const confirmarSenha = confirmarSenhaInput.value;

        // Mesmas regras de validateUser.js no backend (nome >= 2, email com
        // formato válido, senha >= 6) — checadas aqui só pra dar feedback
        // imediato; quem decide de verdade continua sendo o backend.
        if (!nome || nome.length < 2) {
            mostrarMensagem("Informe seu nome completo.", "erro");
            nomeInput.focus();
            return;
        }

        if (!email || !EMAIL_REGEX.test(email)) {
            mostrarMensagem("Informe um email em formato válido.", "erro");
            emailInput.focus();
            return;
        }

        if (!senha || senha.length < 6) {
            mostrarMensagem("A senha deve ter no mínimo 6 caracteres.", "erro");
            senhaInput.focus();
            return;
        }

        if (senha !== confirmarSenha) {
            mostrarMensagem("As senhas não coincidem.", "erro");
            confirmarSenhaInput.focus();
            return;
        }

        definirCarregando(true);

        try {
            await window.api("/usuarios", {
                method: "POST",
                body: {
                    nome: nome,
                    email: email,
                    senha: senha,
                    telefone: telefone || undefined
                }
            });

            mostrarMensagem("Conta criada com sucesso! Redirecionando para o login...", "sucesso");
            form.reset();

            window.setTimeout(function () {
                window.location.href = "index.html";
            }, 1500);

            return;

        } catch (erro) {
            // erro.message já traz a mensagem do backend (ex: "Este email
            // já está cadastrado", 409) — não precisa de tratamento especial.
            const mensagem = erro instanceof window.ApiError
                ? erro.message
                : "Não foi possível conectar ao servidor. Tente novamente.";

            mostrarMensagem(mensagem, "erro");
            definirCarregando(false);
        }
    });
})();
