/**
 * Lógica da tela de login da plataforma — chama SOMENTE
 * POST /plataforma/login, nunca POST /login (tenant). Mesmo padrão de
 * app.js (login de tenant), adaptado para email/senha em vez de CPF/senha
 * e para a sessão isolada de PlataformaAuth.
 */
(function () {
    if (window.PlataformaAuth.possuiSessao() && !window.PlataformaAuth.tokenExpirado(window.PlataformaAuth.obterToken())) {
        window.location.href = "plataforma-dashboard.html";
        return;
    }

    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const senhaInput = document.getElementById("senha");
    const submitBtn = document.getElementById("submit-btn");
    const submitLabel = submitBtn.querySelector(".btn__label");
    const messageBox = document.getElementById("form-message");

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

    function definirCarregando(carregando) {
        submitBtn.disabled = carregando;
        submitBtn.classList.toggle("is-loading", carregando);
        submitLabel.textContent = carregando ? "Entrando..." : "Entrar";
    }

    form.addEventListener("submit", async function (evento) {
        evento.preventDefault();
        esconderMensagem();

        const email = emailInput.value.trim();
        const senha = senhaInput.value;

        if (!email || !senha) {
            mostrarMensagem("Preencha email e senha para continuar.", "erro");
            return;
        }

        definirCarregando(true);

        try {
            const resposta = await window.plataformaApi("/plataforma/login", {
                method: "POST",
                body: { email, senha }
            });

            window.PlataformaAuth.salvarSessao(resposta.token);

            mostrarMensagem("Login realizado com sucesso.", "sucesso");

            window.setTimeout(function () {
                window.location.href = "plataforma-dashboard.html";
            }, 400);

            return;

        } catch (erro) {
            const mensagem = erro instanceof window.PlataformaApiError
                ? erro.message
                : "Não foi possível conectar ao servidor. Tente novamente.";

            mostrarMensagem(mensagem, "erro");
            definirCarregando(false);
        }
    });
})();
