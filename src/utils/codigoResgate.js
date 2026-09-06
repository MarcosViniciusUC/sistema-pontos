const crypto = require("crypto");

// Sem 0/O, 1/I/L — evita confusão na digitação manual e na leitura humana
// do código (ele também vai virar conteúdo de QR Code futuramente, mas
// continua precisando ser digitável à mão como plano B).
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO = 8;

/**
 * Gera um código de reserva aleatório e criptograficamente seguro.
 * Não depende do id do resgate nem de nenhum dado do usuário — é puro
 * acaso, escolhido caractere a caractere com crypto.randomInt (sem viés
 * de módulo, ao contrário de Math.random() % n).
 */
function gerarCodigoResgate() {
    let codigo = "";

    for (let i = 0; i < TAMANHO; i++) {
        const indice = crypto.randomInt(0, ALFABETO.length);
        codigo += ALFABETO[indice];
    }

    return codigo;
}

module.exports = { gerarCodigoResgate };
