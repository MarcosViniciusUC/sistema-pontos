const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Exceção estreita e deliberada: só estes dois identificadores literais
// (contas de teste fixas — ver scripts/create-admin.js e
// create-funcionario.js) pulam a exigência de formato de email no login.
// Qualquer outro valor sem "@algo.algo" continua rejeitado normalmente;
// isto não é um sistema de "username" genérico, só uma exceção pontual.
const IDENTIFICADORES_SEM_EMAIL = ["admin", "funcio"];

function validateLogin(req, res, next) {
    const { email, senha } = req.body;

    const formatoValido = typeof email === "string"
        && (EMAIL_REGEX.test(email) || IDENTIFICADORES_SEM_EMAIL.includes(email));

    if (!email || typeof email !== "string" || !formatoValido) {
        return res.status(400).json({
            mensagem: "Campo 'email' é obrigatório e deve ter um formato válido"
        });
    }

    if (!senha || typeof senha !== "string" || senha.length < 6) {
        return res.status(400).json({
            mensagem: "Campo 'senha' é obrigatório e deve ter no mínimo 6 caracteres"
        });
    }

    next();
}

module.exports = validateLogin;
