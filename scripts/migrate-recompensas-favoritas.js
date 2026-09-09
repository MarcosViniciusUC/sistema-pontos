/**
 * Migração: favoritos INDIVIDUAIS de cliente, separados do destaque global
 * (ver migrate-recompensas-destaque.js — conceitos diferentes, tabelas
 * diferentes de propósito, para nunca serem confundidos).
 *
 * O que muda:
 *   - nova tabela `recompensas_favoritas` (associação usuario <-> recompensa):
 *       - id SERIAL PRIMARY KEY
 *       - usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
 *       - recompensa_id INTEGER NOT NULL REFERENCES recompensas(id) ON DELETE CASCADE
 *       - criado_em TIMESTAMP NOT NULL DEFAULT now()
 *       - UNIQUE (usuario_id, recompensa_id) — impede duplicidade; favoritar
 *         a mesma recompensa duas vezes vira um no-op (ver
 *         favorito.controller.js:favoritar, ON CONFLICT DO NOTHING), nunca
 *         uma segunda linha.
 *
 * ON DELETE CASCADE nas duas FKs é seguro aqui porque esta tabela só existe
 * para representar a RELAÇÃO — nunca o contrário: apagar uma linha desta
 * tabela (desfavoritar) nunca apaga usuário nem recompensa; o cascade só
 * roda no sentido usuário/recompensa -> linhas desta tabela, nunca a partir
 * dela. Isso significa que se um usuário ou uma recompensa forem removidos
 * de verdade (hoje o sistema só desativa recompensa via `ativo`, nunca
 * DELETE — ver reward.controller.js:remover), os favoritos órfãos somem
 * junto automaticamente, em vez de violar a FK ou ficar lixo no banco.
 *
 * Nenhuma tabela/coluna existente é alterada. Nenhuma linha é apagada.
 *
 * Uso: node scripts/migrate-recompensas-favoritas.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("Criando tabela 'recompensas_favoritas'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS recompensas_favoritas (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                recompensa_id INTEGER NOT NULL REFERENCES recompensas(id) ON DELETE CASCADE,
                criado_em TIMESTAMP NOT NULL DEFAULT now(),
                UNIQUE (usuario_id, recompensa_id)
            )
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
