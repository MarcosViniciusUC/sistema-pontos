/**
 * Migração: remove o DEFAULT temporário de compatibilidade de `tenant_id`
 * (aplicado em migrate-tenant-id-default-temporario.js).
 *
 * ETAPA 3C-12 — AUDITORIA FINAL DE ISOLAMENTO: antes de rodar esta
 * migração, foi feita uma auditoria completa de todo INSERT nas 8 tabelas
 * de domínio (usuarios, empresas, recompensas, resgates,
 * movimentacoes_pontos, recompensas_favoritas, notificacoes_historico,
 * password_reset_tokens) em controllers, services, scripts e migrations.
 * Resultado: todo INSERT real já informa `tenant_id` explicitamente desde
 * as etapas 3B–3C-11 (isolamento de cadastro, empresas, recompensas,
 * pontos, resgates, favoritos, histórico de engajamento, redefinição de
 * senha, criação de admin via painel de plataforma). Os únicos dois
 * arquivos que ainda dependiam do DEFAULT (scripts/create-admin.js e
 * scripts/create-funcionario.js — ferramentas locais de linha de comando,
 * nunca expostas pela API) foram corrigidos nesta mesma etapa para
 * resolver o tenant 'movement' explicitamente antes do INSERT.
 * scripts/migrate-empresas.js também faz INSERT sem tenant_id, mas é uma
 * migration histórica já aplicada (marcada `jaAplicada` via
 * tabelaExiste("empresas") em scripts/migrate.js) que nunca roda de novo, e
 * já está quebrada independentemente disso (seu `ON CONFLICT (slug)` não
 * bate mais com a constraint real desde a Etapa 2, que passou a ser
 * `UNIQUE(tenant_id, slug)`) — por isso foi deliberadamente deixada
 * intocada.
 *
 * O QUE ESTA MIGRAÇÃO FAZ: só `ALTER COLUMN tenant_id DROP DEFAULT` nas
 * mesmas 8 tabelas — nada mais. `tenant_id` continua NOT NULL (não muda).
 * NÃO mexe em nenhuma constraint UNIQUE/FK já criada, NÃO cria/apaga
 * tabela nenhuma, NÃO altera nenhum dado de nenhuma linha existente. A
 * partir de agora, qualquer INSERT que esqueça `tenant_id` falha na hora
 * com erro de NOT NULL, em vez de cair silenciosamente no tenant Movement.
 *
 * Idempotente: `DROP DEFAULT` numa coluna que já não tem DEFAULT não
 * causa erro.
 *
 * Uso: node scripts/migrate-tenant-id-remover-default.js
 */
const pool = require("../src/config/database");

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

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Removendo DEFAULT temporário de 'tenant_id' (NOT NULL continua ativo)...");
        for (const tabela of TABELAS_DOMINIO) {
            await client.query(`ALTER TABLE ${tabela} ALTER COLUMN tenant_id DROP DEFAULT`);
            console.log(`   - ${tabela}.tenant_id sem DEFAULT`);
        }

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("A partir de agora, todo INSERT nas tabelas de domínio precisa informar tenant_id explicitamente.");

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
