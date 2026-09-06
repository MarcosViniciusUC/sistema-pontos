/**
 * Cria o primeiro usuário administrador do sistema.
 *
 * Não existe (e não deve existir) uma rota pública que aceite tipo=admin —
 * este script é a única forma de criar um admin, roda localmente por quem
 * tem acesso ao banco/servidor, e nunca fica exposto pela API.
 *
 * Uso:
 *   node scripts/create-admin.js "Nome Completo" "email@exemplo.com" "senhaSegura123"
 *
 * Se algum argumento não for informado, o script pergunta interativamente.
 */
const readline = require("readline");
const bcrypt = require("bcrypt");
const pool = require("../src/config/database");
const { gerarQrTokenUsuario } = require("../src/utils/qrTokenUsuario");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TENTATIVAS_QR_TOKEN = 5;

// Exceção estreita pra conta de teste fixa "admin" — precisa continuar
// aceita aqui e em src/middlewares/validateLogin.js (que valida o login
// depois de criada). Nenhum outro valor sem formato de email é aceito.
const IDENTIFICADOR_SEM_EMAIL = "admin";

function perguntar(pergunta) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(pergunta, (resposta) => {
            rl.close();
            resolve(resposta.trim());
        });
    });
}

async function obterDados() {
    const [nomeArg, emailArg, senhaArg] = process.argv.slice(2);

    const nome = nomeArg || await perguntar("Nome do administrador: ");
    const email = emailArg || await perguntar("Email do administrador: ");
    const senha = senhaArg || await perguntar("Senha do administrador (mínimo 6 caracteres): ");

    return { nome, email, senha };
}

function validar({ nome, email, senha }) {
    if (!nome || nome.trim().length < 2) {
        return "Nome é obrigatório e deve ter no mínimo 2 caracteres";
    }

    if (!email || (!EMAIL_REGEX.test(email) && email !== IDENTIFICADOR_SEM_EMAIL)) {
        return "Email é obrigatório e deve ter um formato válido";
    }

    if (!senha || senha.length < 6) {
        return "Senha é obrigatória e deve ter no mínimo 6 caracteres";
    }

    return null;
}

async function criarAdmin() {
    const dados = await obterDados();

    const erroDeValidacao = validar(dados);

    if (erroDeValidacao) {
        console.error("Erro: " + erroDeValidacao);
        process.exitCode = 1;
        return;
    }

    // Mesmo mecanismo de hash usado no cadastro público (bcrypt, 10 rounds) —
    // a senha em texto puro nunca é armazenada, só o hash.
    const senhaHash = await bcrypt.hash(dados.senha, 10);

    // usuarios.qr_token é NOT NULL/UNIQUE — mesmo um admin (que não usa QR de
    // cliente) precisa de um valor aqui. Colisão é praticamente impossível
    // (256 bits de entropia), mas em caso de colisão tenta de novo com um
    // token novo, em vez de falhar a criação inteira.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_QR_TOKEN; tentativa++) {
        const qrToken = gerarQrTokenUsuario();

        try {
            const resultado = await pool.query(
                `INSERT INTO usuarios (nome, email, senha, tipo, qr_token)
                 VALUES ($1, $2, $3, 'admin', $4)
                 RETURNING id, nome, email, tipo, criado_em`,
                [dados.nome, dados.email, senhaHash, qrToken]
            );

            console.log("Administrador criado com sucesso:");
            console.log(resultado.rows[0]);
            return;

        } catch (erro) {
            if (erro.code === "23505" && erro.constraint === "usuarios_email_key") {
                console.error("Erro: já existe um usuário cadastrado com este email.");
                process.exitCode = 1;
                return;
            }

            const foiColisaoDeQrToken = erro.code === "23505" && erro.constraint === "usuarios_qr_token_key";

            if (!foiColisaoDeQrToken) {
                console.error("Erro ao criar administrador:", erro.message);
                process.exitCode = 1;
                return;
            }
            // colisão de qr_token: tenta de novo com um token novo.
        }
    }

    console.error("Erro: não foi possível gerar um identificador único para o administrador. Tente novamente.");
    process.exitCode = 1;
}

criarAdmin().finally(() => {
    pool.end();
});
