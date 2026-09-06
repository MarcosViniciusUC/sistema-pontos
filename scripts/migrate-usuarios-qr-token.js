/**
 * Migração: identificador de QR Code individual para cada usuário.
 *
 * O que muda na tabela `usuarios`:
 *   - nova coluna `qr_token` (VARCHAR(64), UNIQUE, NOT NULL) — identificador
 *     aleatório usado no QR Code do cliente (nada de nome/email/senha/PII).
 *
 * Nenhuma linha existente é apagada ou perde dados. Todo usuário já
 * cadastrado (cliente ou admin) recebe um token real, gerado pela mesma
 * função criptograficamente segura usada em cadastros novos
 * (crypto.randomBytes, não Math.random) — não um valor de preenchimento
 * previsível como o próprio id.
 *
 * Uso: node scripts/migrate-usuarios-qr-token.js
 */
const pool = require("../src/config/database");
const { gerarQrTokenUsuario } = require("../src/utils/qrTokenUsuario");

async function gerarTokenUnicoNaTransacao(client) {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
        const token = gerarQrTokenUsuario();
        const existe = await client.query("SELECT 1 FROM usuarios WHERE qr_token = $1", [token]);

        if (existe.rows.length === 0) {
            return token;
        }
    }

    throw new Error("Não foi possível gerar um qr_token único para a migração.");
}

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Adicionando coluna 'qr_token' (ainda sem NOT NULL/UNIQUE)...");
        await client.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64)");

        console.log("2) Gerando qr_token para usuários existentes...");
        const linhasExistentes = await client.query("SELECT id, nome FROM usuarios WHERE qr_token IS NULL");

        for (const linha of linhasExistentes.rows) {
            const token = await gerarTokenUnicoNaTransacao(client);
            await client.query("UPDATE usuarios SET qr_token = $1 WHERE id = $2", [token, linha.id]);
            console.log(`   - usuário #${linha.id} (${linha.nome}) recebeu um qr_token`);
        }

        console.log("3) Aplicando NOT NULL e UNIQUE em 'qr_token'...");
        await client.query("ALTER TABLE usuarios ALTER COLUMN qr_token SET NOT NULL");
        await client.query(`
            ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_qr_token_key UNIQUE (qr_token)
        `);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");

    } catch (erro) {
        await client.query("ROLLBACK");
        console.error("\nErro durante a migração — nada foi alterado (ROLLBACK):", erro.message);
        process.exitCode = 1;

    } finally {
        client.release();
    }
}

migrar().finally(() => {
    pool.end();
});
