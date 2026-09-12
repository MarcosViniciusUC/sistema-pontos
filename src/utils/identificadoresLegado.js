// Lista FECHADA e explícita das únicas contas que podem entrar pelo
// identificador antigo (email) em vez de CPF — decisão de arquitetura
// deliberada, não uma regra genérica de "CPF ou email para qualquer um".
//
// Contas nesta lista (nenhuma possui CPF cadastrado, de propósito — nunca
// inventar um CPF para elas só para tirá-las da exceção):
//   - "admin"           → id=73, tipo admin
//   - "funcio"          → id=74, tipo funcionario
//   - "maria@teste.com" → id=2,  tipo cliente
//
// Qualquer valor que não esteja EXATAMENTE nesta lista é tratado como CPF,
// sempre — inclusive se for um endereço de email de outro usuário. Não
// existe fallback "tenta CPF, se não achar tenta email": só estes três
// valores literais pulam a exigência de CPF.
const IDENTIFICADORES_LOGIN_LEGADO = Object.freeze(["admin", "funcio", "maria@teste.com"]);

function ehIdentificadorLegado(valor) {
    return typeof valor === "string" && IDENTIFICADORES_LOGIN_LEGADO.includes(valor);
}

module.exports = { IDENTIFICADORES_LOGIN_LEGADO, ehIdentificadorLegado };
