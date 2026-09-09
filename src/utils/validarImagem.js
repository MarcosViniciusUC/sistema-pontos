/**
 * Validação da imagem de recompensa (data URL base64) — usada tanto na
 * criação quanto na edição (validateRewardCreate.js / validateRewardUpdate.js),
 * pra não ter duas regras que podem divergir sobre o mesmo formato aceito.
 *
 * Duas camadas de verificação de CONTEÚDO real, além do que já existia
 * (rótulo declarado + tamanho da string), nessa ordem:
 *
 *   1. Formato real pelos magic bytes: decodifica o base64 e identifica o
 *      tipo verdadeiro pelos primeiros bytes do arquivo — a mesma técnica
 *      que qualquer visualizador de imagem usa, nunca o texto
 *      "data:image/png;base64,..." que o próprio cliente escreveu. Rejeita
 *      se o conteúdo não é nenhum dos três formatos reconhecidos (bloqueia
 *      texto/HTML/JS disfarçado de imagem) e rejeita se o formato real não
 *      bate com o que foi declarado no rótulo.
 *
 *   2. Dimensões reais: com o formato já confirmado, lê a largura/altura
 *      reais diretamente da estrutura do arquivo (cada formato guarda isso
 *      em posição fixa/bem documentada) e rejeita valores acima do limite —
 *      protege contra uma imagem pequena em bytes que declara dimensões de
 *      pixel absurdas ("decompression bomb": consome memória excessiva no
 *      navegador de quem visualiza a recompensa, sem precisar de um arquivo
 *      grande).
 *
 * Nenhuma biblioteca de imagem foi adicionada — os três formatos aceitos
 * guardam largura/altura em posições fixas e documentadas do próprio
 * arquivo, então dá pra ler isso com Buffer puro.
 *
 * Segunda camada de defesa contra payload grande além do limite de body da
 * rota /recompensas (server.js) — aqui é o tamanho da própria string.
 */
const IMAGEM_REGEX = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;
const IMAGEM_TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB de base64 (~3.7MB de imagem real)

// O editor de recorte do admin sempre gera exatamente 1000x750 (ver
// RECORTE_LARGURA/RECORTE_ALTURA em admin-recompensas.js) — é o único
// tamanho que o fluxo real da aplicação produz hoje, sempre em JPEG. Os
// limites abaixo dão 4x de margem em cada dimensão (espaço de sobra para
// uma foto de resolução bem mais alta enviada fora do editor, ou pra um
// recorte maior no futuro), e mesmo assim bloqueiam o cenário de
// "decompression bomb" — um arquivo de poucos KB que declara dimensões de
// dezenas de milhares de pixels.
const LARGURA_MAXIMA = 4000;
const ALTURA_MAXIMA = 4000;

/**
 * Identifica o formato real pelos magic bytes — nunca pelo rótulo que o
 * cliente declarou. As três assinaturas são estáveis e documentadas há
 * décadas nos respectivos formatos.
 */
function detectarFormatoReal(buffer) {
    // PNG: assinatura fixa de 8 bytes.
    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        return "png";
    }

    // JPEG: todo arquivo começa com o marcador SOI (FF D8) seguido de FF.
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "jpeg";
    }

    // WEBP: contêiner RIFF com FourCC "WEBP" no byte 8.
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "webp";
    }

    return null;
}

/**
 * PNG: logo após a assinatura de 8 bytes vem sempre o chunk IHDR (4 bytes
 * de tamanho + 4 bytes do tipo "IHDR" + os dados) — é obrigatoriamente o
 * primeiro chunk do arquivo, nunca varia de posição. Largura e altura são
 * os primeiros 8 bytes dos dados do IHDR, 4 bytes cada, big-endian.
 */
function obterDimensoesPng(buffer) {
    if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") {
        return null;
    }

    return {
        largura: buffer.readUInt32BE(16),
        altura: buffer.readUInt32BE(20)
    };
}

/**
 * JPEG: sequência de marcadores (0xFF + código). Percorre os segmentos até
 * achar um marcador SOF ("Start Of Frame", 0xC0–0xCF exceto 0xC4/0xC8/0xCC,
 * que são outra coisa — tabelas Huffman e reservados) — o corpo de um SOF
 * sempre começa com 1 byte de precisão, depois altura e largura (2 bytes
 * cada, big-endian). Qualquer outro marcador é pulado usando o próprio
 * comprimento declarado do segmento, sem precisar entender o conteúdo dele.
 */
function obterDimensoesJpeg(buffer) {
    let offset = 2; // pula o SOI (FF D8)

    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        const marcador = buffer[offset + 1];

        // Marcadores sem segmento de tamanho (SOI, TEM, RSTn, EOI).
        if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
            if (marcador === 0xd9) {
                break; // EOI — fim do arquivo, nenhum SOF encontrado
            }
            offset += 2;
            continue;
        }

        const tamanhoSegmento = buffer.readUInt16BE(offset + 2);
        const ehMarcadorDeQuadro = marcador >= 0xc0 && marcador <= 0xcf
            && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;

        if (ehMarcadorDeQuadro) {
            if (offset + 9 > buffer.length) {
                return null;
            }

            return {
                altura: buffer.readUInt16BE(offset + 5),
                largura: buffer.readUInt16BE(offset + 7)
            };
        }

        offset += 2 + tamanhoSegmento;
    }

    return null;
}

/**
 * WEBP: depois do cabeçalho RIFF/WEBP (12 bytes) vem o primeiro chunk —
 * 4 bytes de FourCC + 4 bytes de tamanho (LE) + dados a partir do byte 20.
 * As dimensões vivem em lugares diferentes dependendo do subformato:
 *   - "VP8 " (lossy): 3 bytes de tag do frame + 3 bytes de código de
 *     sincronismo, depois largura/altura em 2 bytes cada (LE, só os 14 bits
 *     menos significativos valem).
 *   - "VP8L" (lossless): 1 byte de assinatura (0x2F) + 4 bytes com
 *     (largura-1) e (altura-1) empacotados em 14 bits cada (LE).
 *   - "VP8X" (extended): 1 byte de flags + 3 reservados, depois
 *     (largura-1) e (altura-1) em 3 bytes cada (LE).
 * Layout estável, parte da especificação WebP (RFC 9649 / documentação
 * original do Google).
 */
function obterDimensoesWebp(buffer) {
    if (buffer.length < 30) {
        return null;
    }

    const fourCC = buffer.toString("ascii", 12, 16);
    const inicioDados = 20;

    if (fourCC === "VP8 ") {
        const inicio = inicioDados + 3 + 3;
        if (buffer.length < inicio + 4) {
            return null;
        }
        return {
            largura: buffer.readUInt16LE(inicio) & 0x3fff,
            altura: buffer.readUInt16LE(inicio + 2) & 0x3fff
        };
    }

    if (fourCC === "VP8L") {
        if (buffer.length < inicioDados + 5 || buffer[inicioDados] !== 0x2f) {
            return null;
        }
        const bits = buffer.readUInt32LE(inicioDados + 1);
        return {
            largura: (bits & 0x3fff) + 1,
            altura: ((bits >>> 14) & 0x3fff) + 1
        };
    }

    if (fourCC === "VP8X") {
        const inicioCanvas = inicioDados + 4;
        if (buffer.length < inicioCanvas + 6) {
            return null;
        }
        return {
            largura: buffer.readUIntLE(inicioCanvas, 3) + 1,
            altura: buffer.readUIntLE(inicioCanvas + 3, 3) + 1
        };
    }

    return null;
}

function obterDimensoes(formato, buffer) {
    if (formato === "png") return obterDimensoesPng(buffer);
    if (formato === "jpeg") return obterDimensoesJpeg(buffer);
    return obterDimensoesWebp(buffer);
}

function validarImagem(imagem) {
    if (typeof imagem !== "string") {
        return "Campo 'imagem' deve ser uma imagem jpeg, png ou webp válida";
    }

    const correspondencia = IMAGEM_REGEX.exec(imagem);

    if (!correspondencia) {
        return "Campo 'imagem' deve ser uma imagem jpeg, png ou webp válida";
    }

    if (imagem.length > IMAGEM_TAMANHO_MAXIMO) {
        return "Imagem excede o tamanho máximo permitido";
    }

    const mimeDeclarado = correspondencia[1];
    const base64 = correspondencia[2];
    const buffer = Buffer.from(base64, "base64");

    const formatoReal = detectarFormatoReal(buffer);

    if (!formatoReal) {
        return "O conteúdo enviado não corresponde a uma imagem jpeg, png ou webp válida";
    }

    if (formatoReal !== mimeDeclarado) {
        return "O conteúdo da imagem não corresponde ao formato declarado";
    }

    const dimensoes = obterDimensoes(formatoReal, buffer);

    if (!dimensoes || dimensoes.largura <= 0 || dimensoes.altura <= 0) {
        return "Não foi possível determinar as dimensões da imagem";
    }

    if (dimensoes.largura > LARGURA_MAXIMA || dimensoes.altura > ALTURA_MAXIMA) {
        return `Imagem excede as dimensões máximas permitidas (${LARGURA_MAXIMA}x${ALTURA_MAXIMA}px)`;
    }

    return null;
}

module.exports = { validarImagem };
