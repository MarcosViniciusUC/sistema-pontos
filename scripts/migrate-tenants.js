/**
 * Migração: fundação do modelo multi-tenant — ETAPA 1.
 *
 * O que muda:
 *   - nova tabela `tenants` (id, nome, slug UNIQUE, plano, status, criado_em).
 *   - semeia o Tenant 1: o próprio Movement (nome='Movement',
 *     slug='movement', status='ativo') — representa o sistema atual dentro
 *     do novo modelo, sem mover nem duplicar nenhum dado existente.
 *
 * `status` restrito por CHECK a exatamente `ativo`/`inativo` — únicos dois
 * valores compatíveis com o produto atual (sem catálogo de planos/limites
 * ainda; `plano` é só uma coluna livre, nullable, sem nenhuma regra
 * associada nesta etapa).
 *
 * IMPORTANTE — o que esta migração NÃO faz, de propósito (etapas futuras
 * separadas, para poder testar cada mudança isoladamente):
 *   - NÃO adiciona `tenant_id` em nenhuma tabela de domínio (usuarios,
 *     empresas, recompensas, movimentacoes_pontos, resgates,
 *     recompensas_favoritas, notificacoes_historico, password_reset_tokens);
 *   - NÃO cria catálogo de planos nem aplica limite nenhum;
 *   - NÃO altera login, JWT, controllers, rotas nem frontend.
 *
 * Nenhuma linha de nenhuma tabela existente é apagada, movida ou alterada.
 * Idempotente: `ON CONFLICT (slug) DO NOTHING` garante que rodar de novo
 * nunca cria um segundo Tenant 1 nem falha por duplicata.
 *
 * Uso: node scripts/migrate-tenants.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Criando tabela 'tenants'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL,
                plano VARCHAR(50),
                status VARCHAR(20) NOT NULL DEFAULT 'ativo',
                criado_em TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT tenants_status_check CHECK (status IN ('ativo', 'inativo'))
            )
        `);

        console.log("2) Semeando o Tenant 1 (Movement), se ainda não existir...");
        const resultado = await client.query(`
            INSERT INTO tenants (nome, slug, status)
            VALUES ('Movement', 'movement', 'ativo')
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
        `);

        if (resultado.rows.length > 0) {
            console.log(`   - Tenant 'movement' criado com id ${resultado.rows[0].id}`);
        } else {
            console.log("   - Tenant 'movement' já existia — nada foi alterado");
        }

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
