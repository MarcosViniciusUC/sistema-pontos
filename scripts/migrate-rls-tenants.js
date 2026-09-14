/**
 * Migração: RLS especial para `tenants` — ETAPA 3C-13 (RLS).
 *
 * `tenants` NÃO recebe a política padrão "tenant_id da linha = contexto da
 * sessão" das outras 7 tabelas (ver migrate-rls-dominio.js). Motivo: a
 * resolução de tenant por slug (`resolverTenantMiddleware` /
 * `tenantResolver.resolverTenant()`, usada em `/login`, `/usuarios`
 * (cadastro) e `/login/esqueci-senha`) roda ANTES de existir qualquer
 * `app.tenant_id` de sessão — é literalmente essa consulta que descobre o
 * tenant. Uma política restrita ao próprio tenant criaria um ciclo: nunca
 * haveria contexto pra encontrar o contexto.
 *
 * DECISÃO (documentada no relatório da 3C-13, revisão do plano original):
 *
 *   SELECT  -> liberado sem restrição de linha (USING (true)).
 *              `tenants` guarda só {id, nome, slug, plano, status} — dado
 *              de roteamento, não dado de cliente/negócio de um tenant.
 *              Não há segredo sendo exposto ao permitir a leitura da
 *              tabela inteira; o dado sensível de verdade continua 100%
 *              protegido nas 7 tabelas de domínio.
 *
 *   INSERT/UPDATE/DELETE -> só em modo bypass
 *              (current_setting('app.bypass_tenant_rls', true) = 'on').
 *              Um tenant comum NUNCA tem essa variável setada (ver
 *              requestContext.js — bypass só é ativado por código interno
 *              de plataforma/scheduler, nunca por uma requisição de
 *              tenant), então essas três operações são efetivamente
 *              impossíveis para `app_runtime` fora do modo bypass — sem
 *              precisar checar tenant_id nenhum, porque a própria linha
 *              sendo alterada É a definição de um tenant, não pertence "a"
 *              um tenant.
 *
 * `FORCE ROW LEVEL SECURITY`: mesmo raciocínio de migrate-rls-dominio.js —
 * sem efeito sobre app_runtime hoje (não é dono da tabela), fecha a mesma
 * brecha caso a propriedade mude no futuro.
 *
 * Uso: node scripts/migrate-rls-tenants.js
 */
const pool = require("../src/config/databaseAdmin");

const TABELA = "tenants";
const CONDICAO_BYPASS = "current_setting('app.bypass_tenant_rls', true) = 'on'";

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log(`- ${TABELA}: habilitando RLS...`);
        await client.query(`ALTER TABLE ${TABELA} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${TABELA} FORCE ROW LEVEL SECURITY`);

        await client.query(`DROP POLICY IF EXISTS tenants_select_publico ON ${TABELA}`);
        await client.query(`DROP POLICY IF EXISTS tenants_mutacao_bypass ON ${TABELA}`);

        // Duas políticas permissivas (Postgres combina políticas do mesmo
        // comando com OR): a de SELECT é aberta; a FOR ALL (bypass) cobre
        // INSERT/UPDATE/DELETE normalmente e, para SELECT, só reforça
        // redundantemente a primeira (nunca restringe — políticas
        // permissivas nunca subtraem acesso umas das outras).
        console.log("  política de SELECT: sem restrição de linha (metadado de roteamento, não sensível)...");
        await client.query(`
            CREATE POLICY tenants_select_publico ON ${TABELA}
            FOR SELECT
            USING (true)
        `);

        console.log("  política de INSERT/UPDATE/DELETE: só em modo bypass...");
        await client.query(`
            CREATE POLICY tenants_mutacao_bypass ON ${TABELA}
            FOR ALL
            USING (${CONDICAO_BYPASS})
            WITH CHECK (${CONDICAO_BYPASS})
        `);

        await client.query("COMMIT");
        console.log("\nRLS de 'tenants' concluído: SELECT aberto, INSERT/UPDATE/DELETE só em bypass.");
        console.log("Um tenant comum não consegue alterar a própria linha nem nenhuma outra em 'tenants'.");

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
