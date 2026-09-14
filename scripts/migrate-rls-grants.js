/**
 * Migração: concede a `app_runtime` só os privilégios estritamente
 * necessários — ETAPA 3C-13 (RLS).
 *
 * Três grupos de tabelas, três níveis de acesso:
 *
 *   1) TENANT-AWARE (vão ganhar RLS de verdade em migrate-rls-dominio.js):
 *      usuarios, empresas, movimentacoes_pontos, recompensas, resgates,
 *      recompensas_favoritas, notificacoes_historico.
 *      SELECT/INSERT/UPDATE/DELETE — a restrição por tenant não vem daqui,
 *      vem das políticas RLS que ainda serão criadas. O GRANT aqui só diz
 *      "esta operação é permitida em tese"; a política decide QUAIS linhas.
 *
 *   2) ESPECIAIS (RLS com política própria, não tenant-based — ver
 *      migrate-rls-tenants.js e migrate-rls-admins-plataforma.js):
 *      tenants, admins_plataforma.
 *      Mesmos verbos concedidos (SELECT/INSERT/UPDATE/DELETE) — de novo, é
 *      a política RLS (ainda não criada neste script) que vai restringir de
 *      verdade quem consegue o quê.
 *
 *   3) FORA DO ESCOPO DE RLS NESTA ETAPA (decisão explícita, ver relatório
 *      da 3C-13): password_reset_tokens.
 *      Continua precisando de SELECT/INSERT/UPDATE (nunca DELETE — a
 *      aplicação nunca apaga token, só marca `usado_em`) para o fluxo de
 *      recuperação de senha (fora do checkpoint, mas que precisa continuar
 *      funcionando localmente) não quebrar quando a aplicação trocar de
 *      `postgres` para `app_runtime`. SEM política RLS nenhuma — controle
 *      fica só no nível de GRANT, exatamente como era implicitamente antes.
 *
 * DELIBERADAMENTE NÃO CONCEDIDO (nenhum destes, em nenhuma tabela):
 *   - CREATE no schema public (app_runtime nunca cria tabela/sequence)
 *   - ALTER / DROP / TRUNCATE
 *   - GRANT OPTION (app_runtime nunca pode repassar privilégio a outro papel)
 *   - qualquer privilégio em `migration_history` (bookkeeping exclusivo do
 *     orquestrador, que roda como `postgres`/databaseAdmin.js — a aplicação
 *     em runtime nunca toca essa tabela)
 *
 * SEQUENCES: `USAGE` (não `SELECT`/`UPDATE`) em cada `<tabela>_id_seq` das
 * tabelas onde app_runtime pode fazer INSERT — é o mínimo necessário para
 * `nextval()` funcionar num `SERIAL`/`id` default.
 *
 * Idempotente: `GRANT` pode ser reaplicado quantas vezes for preciso, sem
 * erro, mesmo que o privilégio já exista.
 *
 * Uso: node scripts/migrate-rls-grants.js
 */
const pool = require("../src/config/databaseAdmin");

const ROLE = "app_runtime";

const TABELAS_TENANT_AWARE = [
    "usuarios",
    "empresas",
    "movimentacoes_pontos",
    "recompensas",
    "resgates",
    "recompensas_favoritas",
    "notificacoes_historico"
];

const TABELAS_ESPECIAIS = ["tenants", "admins_plataforma"];

// password_reset_tokens: nunca DELETE (a aplicação só marca usado_em).
const TABELA_PASSWORD_RESET = "password_reset_tokens";

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Tabelas tenant-aware (SELECT/INSERT/UPDATE/DELETE + USAGE na sequence)...");
        for (const tabela of TABELAS_TENANT_AWARE) {
            await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tabela} TO ${ROLE}`);
            await client.query(`GRANT USAGE ON SEQUENCE ${tabela}_id_seq TO ${ROLE}`);
            console.log(`   - ${tabela}`);
        }

        console.log("\n2) Tabelas especiais (tenants, admins_plataforma) — mesmos verbos, restrição vem da política RLS...");
        for (const tabela of TABELAS_ESPECIAIS) {
            await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tabela} TO ${ROLE}`);
            await client.query(`GRANT USAGE ON SEQUENCE ${tabela}_id_seq TO ${ROLE}`);
            console.log(`   - ${tabela}`);
        }

        console.log("\n3) password_reset_tokens (fora do escopo de RLS nesta etapa — sem DELETE)...");
        await client.query(`GRANT SELECT, INSERT, UPDATE ON ${TABELA_PASSWORD_RESET} TO ${ROLE}`);
        await client.query(`GRANT USAGE ON SEQUENCE ${TABELA_PASSWORD_RESET}_id_seq TO ${ROLE}`);
        console.log(`   - ${TABELA_PASSWORD_RESET}`);

        await client.query("COMMIT");
        console.log("\nGrants concluídos. Nada de CREATE/ALTER/DROP/TRUNCATE/GRANT OPTION concedido, e migration_history permanece inacessível a app_runtime.");

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
