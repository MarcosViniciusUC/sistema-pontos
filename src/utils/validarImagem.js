/**
 * Validação da imagem de recompensa (data URL base64) — usada tanto na
 * criação quanto na edição (validateRewardCreate.js / validateRewardUpdate.js),
 * pra não ter duas regras que podem divergir sobre o mesmo formato aceito.
 *
 * Segunda camada de defesa contra payload grande além do limite de body da
 * rota /recompensas (server.js) — aqui é o tamanho da própria string.
 */
const IMAGEM_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const IMAGEM_TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB de base64 (~3.7MB de imagem real)

function validarImagem(imagem) {
    if (typeof imagem !== "string" || !IMAGEM_REGEX.test(imagem)) {
        return "Campo 'imagem' deve ser uma imagem jpeg, png ou webp válida";
    }

    if (imagem.length > IMAGEM_TAMANHO_MAXIMO) {
        return "Imagem excede o tamanho máximo permitido";
    }

    return null;
}

module.exports = { validarImagem };
