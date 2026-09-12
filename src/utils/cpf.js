// Validação real de CPF (não só contagem de dígitos) — usada tanto no
// cadastro (validateUser.js) quanto em qualquer lugar futuro que precise
// conferir um CPF antes de gravar no banco. O banco nunca guarda pontuação:
// normalizarCpf() é sempre chamada antes de qualquer INSERT/UPDATE/SELECT
// por CPF, então "123.456.789-09" e "12345678909" resolvem para o mesmo
// valor armazenado e para a mesma constraint UNIQUE.

/**
 * Remove tudo que não for dígito. Não valida nada — só normaliza o
 * formato para o valor de 11 dígitos que o banco armazena.
 */
function normalizarCpf(valor) {
    if (typeof valor !== "string" && typeof valor !== "number") {
        return "";
    }

    return String(valor).replace(/\D/g, "");
}

function calcularDigitoVerificador(digitos, pesoInicial) {
    let soma = 0;

    for (let i = 0; i < digitos.length; i++) {
        soma += Number(digitos[i]) * (pesoInicial - i);
    }

    const resto = soma % 11;

    return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida um CPF de verdade: 11 dígitos, não é uma sequência repetida
 * (000.000.000-00, 111.111.111-11, etc. — matematicamente "válidas" pelo
 * cálculo de dígito verificador, mas nunca CPFs reais emitidos), e os dois
 * dígitos verificadores batem com o cálculo oficial da Receita Federal.
 *
 * Aceita entrada com ou sem pontuação — normaliza internamente. Retorna
 * false para qualquer entrada que não seja uma string/number normalizável
 * para exatamente 11 dígitos.
 */
function validarCpf(valor) {
    const cpf = normalizarCpf(valor);

    if (cpf.length !== 11) {
        return false;
    }

    if (/^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    const primeiroDigito = calcularDigitoVerificador(cpf.slice(0, 9), 10);

    if (primeiroDigito !== Number(cpf[9])) {
        return false;
    }

    const segundoDigito = calcularDigitoVerificador(cpf.slice(0, 10), 11);

    if (segundoDigito !== Number(cpf[10])) {
        return false;
    }

    return true;
}

module.exports = { normalizarCpf, validarCpf };
