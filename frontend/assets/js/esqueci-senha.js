/**
 * Tela "Esqueci minha senha" — pede só o e-mail, sempre mostra a mesma
 * mensagem genérica de sucesso (o backend nunca revela se o e-mail existe
 * — ver validateForgotPassword.js/auth.controller.js:esqueciSenha), então
 * este arquivo não precisa (nem deveria) tratar "e-mail não encontrado"
 * como um caso diferente de "e-mail encontrado".
 */
(function () {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const form = document.getElementById("esqueci-senha-form");
    const emailInput = document.getElementById("email");
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

    function definirCarregando(carregando) {
        submitBtn.disabled = carregando;
        submitBtn.classList.toggle("is-loading", carregando);
        submitLabel.textContent = carregando ? "Enviando..." : "Enviar link de recuperação";
    }

    form.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const email = emailInput.value.trim();

        if (!email || !EMAIL_REGEX.test(email)) {
            mostrarMensagem("Informe um e-mail em formato válido.", "erro");
            emailInput.focus();
            return;
        }

        definirCarregando(true);

        try {
            const resposta = await window.api("/login/esqueci-senha", {
                method: "POST",
                body: { email }
            });

            // Mesma mensagem sempre — o backend já garante isso, mas o
            // frontend nunca deveria inventar uma variação por conta própria.
            mostrarMensagem(resposta.mensagem, "sucesso");
            form.reset();
            definirCarregando(false);

        } catch (erro) {
            // Mesmo em erro de rede/servidor, não afirmamos nada sobre a
            // existência da conta — só que algo deu errado ao processar.
            const mensagem = erro instanceof window.ApiError
                ? erro.message
                : "Não foi possível conectar ao servidor. Tente novamente.";

            mostrarMensagem(mensagem, "erro");
            definirCarregando(false);
        }
    });
})();
