/**
 * Migração: campo de imagem para recompensas.
 *
 * O que muda na tabela `recompensas`:
 *   - nova coluna `imagem` (TEXT, opcional) — guarda a foto como data URL
 *     base64 (ex: "data:image/jpeg;base64,...") diretamente no Postgres, não
 *     em arquivo no disco do servidor. Isso é proposital: o serviço web no
 *     Render tem filesystem efêmero (qualquer arquivo escrito localmente é
 *     perdido a cada redeploy/restart), enquanto o Postgres gerenciado é
 *     persistente. Sem custo/serviço externo novo, sem dependência nova.
 *
 * Nenhuma linha existente é apagada ou alterada — recompensas já cadastradas
 * simplesmente ficam com imagem = NULL (o frontend já sabia lidar com "sem
 * imagem" antes desta mudança, mostrando o gradiente + monograma de sempre).
 *
 * Uso: node scripts/migrate-recompensas-imagem.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("Adicionando coluna 'imagem' (TEXT, opcional) em recompensas...");
        await client.query("ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS imagem TEXT");

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
