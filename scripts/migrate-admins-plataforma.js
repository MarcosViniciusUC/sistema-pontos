/**
 * Migração: fundação do modelo multi-tenant — ETAPA 1 (continuação).
 *
 * O que muda:
 *   - nova tabela `admins_plataforma` (id, nome, email UNIQUE, senha,
 *     criado_em).
 *
 * Representa administradores da Maple Tech — a empresa dona da plataforma
 * SaaS. DELIBERADAMENTE fora do modelo de tenant: esta tabela nunca tem
 * `tenant_id`, e nunca é a mesma coisa que `usuarios` (que é sempre
 * escopada a um tenant, quando essa coluna existir — etapa futura). Um
 * admin da Maple Tech administra a plataforma inteira (múltiplos tenants),
 * não um tenant específico — por isso a separação em uma tabela própria,
 * em vez de um novo valor de `usuarios.tipo` ou uma linha com tenant_id
 * nulo.
 *
 * IMPORTANTE — o que esta migração NÃO faz, de propósito (etapas futuras):
 *   - NÃO cria nenhuma linha nesta tabela — nenhum admin real da Maple Tech
 *     é criado agora, só a estrutura vazia;
 *   - NÃO cria login, JWT, middleware de autorização nem rotas para esta
 *     tabela (isso é o painel da Maple Tech, etapa separada);
 *   - NÃO altera `usuarios` nem nenhuma outra tabela existente.
 *
 * Nenhuma linha de nenhuma tabela existente é apagada, movida ou alterada.
 *
 * Uso: node scripts/migrate-admins-plataforma.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("Criando tabela 'admins_plataforma'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins_plataforma (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso. Tabela criada vazia, de propósito.");

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
