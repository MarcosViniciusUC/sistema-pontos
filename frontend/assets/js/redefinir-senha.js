/**
 * Tela de redefinição de senha — lê o token da URL (?token=...), nunca de
 * um campo digitado pelo usuário. Três estados possíveis, cada um seu
 * próprio bloco no HTML (ver redefinir-senha.html): formulário normal,
 * "token inválido/expirado" (checado já ao carregar a página, e de novo se
 * a API recusar no envio), e "sucesso".
 */
(function () {
    const formEl = document.getElementById("redefinir-senha-form");
    const tokenInvalidoEl = document.getElementById("token-invalido");
    const sucessoEl = document.getElementById("sucesso");

    const senhaInput = document.getElementById("senha");
    const confirmarSenhaInput = document.getElementById("confirmar-senha");
    const submitBtn = document.getElementById("submit-btn");
    const submitLabel = submitBtn.querySelector(".btn__label");
    const messageBox = document.getElementById("form-message");

    const token = new URLSearchParams(window.location.search).get("token");

    function mostrarApenas(elementoVisivel) {
        [formEl, tokenInvalidoEl, sucessoEl].forEach(function (el) {
            el.hidden = el !== elementoVisivel;
        });
    }

    // Sem token nenhum na URL, nem vale mostrar o formulário — poupa uma
    // ida à API que já sabemos que vai falhar.
    if (!token) {
        mostrarApenas(tokenInvalidoEl);
        return;
    }

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
        submitLabel.textContent = carregando ? "Redefinindo..." : "Redefinir senha";
    }

    formEl.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const senha = senhaInput.value;
        const confirmarSenha = confirmarSenhaInput.value;

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
            await window.api("/login/redefinir-senha", {
                method: "POST",
                body: { token: token, senha: senha, confirmar_senha: confirmarSenha }
            });

            mostrarApenas(sucessoEl);

        } catch (erro) {
            definirCarregando(false);

            // 400 com token inválido/expirado -> troca pra tela dedicada
            // (o link já não serve mais, não adianta manter o formulário).
            // Qualquer outro erro (rede, 500, validação inesperada) só
            // aparece como mensagem inline, mantendo o formulário.
            if (erro instanceof window.ApiError && erro.status === 400 && /inválido ou expirado/i.test(erro.message)) {
                mostrarApenas(tokenInvalidoEl);
                return;
            }

            const mensagem = erro instanceof window.ApiError
                ? erro.message
                : "Não foi possível conectar ao servidor. Tente novamente.";

            mostrarMensagem(mensagem, "erro");
        }
    });
})();
