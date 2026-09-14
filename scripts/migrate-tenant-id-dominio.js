/**
 * Migração: associação de todo o banco de domínio ao Tenant 1 (Movement) —
 * ETAPA 2 da fundação multi-tenant (ver migrate-tenants.js / etapa 1).
 *
 * Duas fases, na MESMA transação:
 *
 * FASE A — compatibilidade (nada quebra, código atual nem lê a coluna nova):
 *   1. ADD COLUMN tenant_id INTEGER NULL + FK para tenants(id), nas 8
 *      tabelas de domínio confirmadas no schema real (não presumidas):
 *      usuarios, empresas, recompensas, resgates, movimentacoes_pontos,
 *      recompensas_favoritas, notificacoes_historico, password_reset_tokens.
 *   2. Backfill: toda linha existente recebe o id do Tenant 1 (movement).
 *   3. Confirma explicitamente que nenhuma linha ficou com tenant_id NULL
 *      antes de seguir para a Fase B.
 *
 * FASE B — endurecimento:
 *   4. ALTER COLUMN tenant_id SET NOT NULL nas 8 tabelas.
 *   5. Troca as constraints únicas que hoje são globais, mas que no modelo
 *      SaaS devem valer por tenant:
 *        usuarios: UNIQUE(email) -> UNIQUE(tenant_id, email)
 *                  UNIQUE(cpf)   -> UNIQUE(tenant_id, cpf)
 *        empresas: UNIQUE(slug)  -> UNIQUE(tenant_id, slug)
 *      NÃO tocadas (decisão de arquitetura já registrada — permanecem
 *      únicas GLOBALMENTE, de propósito, porque a validação/scan não sabe
 *      o tenant a priori):
 *        usuarios.qr_token
 *        resgates.codigo
 *
 * `tenant_id` é uma coluna PRÓPRIA em cada tabela, nunca derivada via JOIN
 * a partir de `empresa_id` — `empresa_id` é nullable em recompensas,
 * movimentacoes_pontos e resgates (dados históricos), então não serviria
 * como fonte confiável de tenant.
 *
 * `migration_history`, `tenants` e `admins_plataforma` NÃO são tabelas de
 * domínio — nenhuma delas recebe `tenant_id`.
 *
 * NULLs de CPF são preservados corretamente: o Postgres nunca considera
 * dois NULLs conflitantes em nenhuma UNIQUE (simples ou composta) — as 3
 * contas legadas (admin/funcio/maria, todas com cpf NULL) continuam
 * coexistindo sob UNIQUE(tenant_id, cpf) exatamente como já coexistiam sob
 * UNIQUE(cpf) sozinho.
 *
 * SEGURANÇA: a migração confirma que o Tenant 1 (`slug='movement'`) existe
 * ANTES de qualquer ALTER TABLE. Se não existir, aborta imediatamente (a
 * exceção cai no catch normal, que sempre faz ROLLBACK) — nunca cria um
 * tenant novo aqui, nunca assume um id "mágico".
 *
 * IDEMPOTÊNCIA: cada `ALTER TABLE ADD COLUMN`/`ALTER COLUMN ... SET NOT
 * NULL` já é idempotente por natureza (`IF NOT EXISTS`, e o Postgres não
 * reclama de aplicar `NOT NULL` a uma coluna que já é `NOT NULL`). As
 * trocas de constraint única (passo 5) são embrulhadas em `DO $$ ... $$`
 * com checagem de existência antes de `DROP`/`ADD` — diferente de algumas
 * migrations antigas do projeto, esta é segura para rodar isolada mais de
 * uma vez, não só através do orquestrador.
 *
 * Nenhuma linha é apagada. Nenhuma coluna existente muda de valor — só a
 * coluna nova (`tenant_id`) é preenchida.
 *
 * Uso: node scripts/migrate-tenant-id-dominio.js
 */
const pool = require("../src/config/database");

// Confirmadas no schema real nesta etapa (não presumidas) — as únicas 8
// tabelas de domínio hoje. `migration_history`, `tenants` e
// `admins_plataforma` ficam de fora de propósito.
const TABELAS_DOMINIO = [
    "usuarios",
    "empresas",
    "recompensas",
    "resgates",
    "movimentacoes_pontos",
    "recompensas_favoritas",
    "notificacoes_historico",
    "password_reset_tokens"
];

async function trocarConstraintUnica(client, tabela, constraintAntiga, constraintNova, colunas) {
    await client.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintAntiga}') THEN
                ALTER TABLE ${tabela} DROP CONSTRAINT ${constraintAntiga};
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintNova}') THEN
                ALTER TABLE ${tabela} ADD CONSTRAINT ${constraintNova} UNIQUE (${colunas});
            END IF;
        END $$;
    `);
}

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("0) Confirmando que o Tenant 1 (movement) existe...");
        const tenantResultado = await client.query("SELECT id FROM tenants WHERE slug = 'movement'");

        if (tenantResultado.rows.length === 0) {
            throw new Error("Tenant 'movement' não encontrado — rode migrate-tenants.js (etapa 1) antes desta migração.");
        }

        const tenantId = tenantResultado.rows[0].id;
        console.log(`   Tenant 'movement' encontrado (id=${tenantId}).`);

        console.log("\n=== FASE A — compatibilidade ===");

        for (const tabela of TABELAS_DOMINIO) {
            console.log(`1) ${tabela}: adicionando coluna 'tenant_id' (nullable, com FK para tenants)...`);
            await client.query(`
                ALTER TABLE ${tabela}
                ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)
            `);
        }

        for (const tabela of TABELAS_DOMINIO) {
            const resultado = await client.query(
                `UPDATE ${tabela} SET tenant_id = $1 WHERE tenant_id IS NULL`,
                [tenantId]
            );
            console.log(`2) ${tabela}: ${resultado.rowCount} linha(s) associada(s) ao Tenant 1.`);
        }

        console.log("\n3) Confirmando que nenhuma linha ficou sem tenant_id...");
        for (const tabela of TABELAS_DOMINIO) {
            const semTenant = await client.query(`SELECT count(*) AS total FROM ${tabela} WHERE tenant_id IS NULL`);
            const total = Number(semTenant.rows[0].total);

            if (total > 0) {
                throw new Error(`Fase A falhou: ${tabela} ainda tem ${total} linha(s) com tenant_id NULL.`);
            }
        }
        console.log("   Confirmado: 0 linhas sem tenant_id em todas as tabelas de domínio.");

        console.log("\n=== FASE B — endurecimento ===");

        for (const tabela of TABELAS_DOMINIO) {
            console.log(`4) ${tabela}: aplicando NOT NULL em 'tenant_id'...`);
            await client.query(`ALTER TABLE ${tabela} ALTER COLUMN tenant_id SET NOT NULL`);
        }

        console.log("5) Ajustando constraints únicas para o modelo por tenant...");

        console.log("   - usuarios: UNIQUE(email) -> UNIQUE(tenant_id, email)");
        await trocarConstraintUnica(client, "usuarios", "usuarios_email_key", "usuarios_tenant_email_key", "tenant_id, email");

        console.log("   - usuarios: UNIQUE(cpf) -> UNIQUE(tenant_id, cpf)  [NULLs continuam não-conflitantes]");
        await trocarConstraintUnica(client, "usuarios", "usuarios_cpf_key", "usuarios_tenant_cpf_key", "tenant_id, cpf");

        console.log("   - usuarios.qr_token: mantido único GLOBALMENTE — sem mudança, decisão de arquitetura já registrada");

        console.log("   - empresas: UNIQUE(slug) -> UNIQUE(tenant_id, slug)");
        await trocarConstraintUnica(client, "empresas", "empresas_slug_key", "empresas_tenant_slug_key", "tenant_id, slug");

        console.log("   - resgates.codigo: mantido único GLOBALMENTE — sem mudança, decisão de arquitetura já registrada");

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
