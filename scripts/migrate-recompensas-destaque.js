/**
 * Migração: destaque GLOBAL de recompensa (admin/funcionário).
 *
 * O que muda na tabela `recompensas`:
 *   - nova coluna `destacada` (BOOLEAN, NOT NULL, DEFAULT false) — controla
 *     se a recompensa aparece na seção "Recompensas em destaque" da área
 *     inicial do cliente. É GLOBAL (vale para todos os clientes), diferente
 *     do favorito individual de cada cliente (ver
 *     migrate-recompensas-favoritas.js, tabela separada).
 *
 * Como o valor é uma constante (false) e não depende de nenhum dado já
 * existente, ADD COLUMN ... NOT NULL DEFAULT false preenche as linhas atuais
 * na mesma instrução, sem precisar do passo extra de "adicionar nullable,
 * preencher, depois aplicar NOT NULL" usado em migrações anteriores (esse
 * passo extra só é necessário quando o valor de preenchimento varia por
 * linha, como em migrate-movimentacoes-origem.js).
 *
 * Nenhuma linha existente é apagada ou tem outro dado alterado — todas as
 * recompensas já cadastradas simplesmente começam com destacada = false.
 *
 * Uso: node scripts/migrate-recompensas-destaque.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("Adicionando coluna 'destacada' (BOOLEAN NOT NULL DEFAULT false) em recompensas...");
        await client.query("ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS destacada BOOLEAN NOT NULL DEFAULT false");

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
