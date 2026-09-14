/**
 * Migração: RLS especial para `admins_plataforma` — ETAPA 3C-13 (RLS).
 *
 * Diferente de `tenants`, aqui NENHUMA operação — nem SELECT — pode ficar
 * aberta para uma sessão de tenant comum: o conteúdo (hash de senha de
 * administrador da Maple Tech) é sensível de verdade. Uma política
 * `USING(true)` como a de `tenants` seria uma regressão de segurança, não
 * uma solução.
 *
 * `admins_plataforma` não tem `tenant_id` — não existe "linha de um
 * tenant" aqui, então não há condição por tenant nenhuma pra escrever. A
 * única condição é: modo bypass ligado, ponto final. Para TODAS as
 * operações (SELECT/INSERT/UPDATE/DELETE), inclusive o SELECT usado por
 * `POST /plataforma/login` — que roda ANTES de existir qualquer JWT de
 * plataforma. Isso é seguro porque bypass, nesse caso específico, nunca é
 * decidido por dado de request nenhum: é ativado pelo PRÓPRIO CÓDIGO do
 * controller de login de plataforma (ver plataforma.controller.js e
 * requestContext.js), que só é alcançável por `plataforma.routes.js` —
 * nenhuma rota de tenant importa esse controller, então uma sessão de
 * tenant nunca tem como fazer esse código rodar. Para as demais rotas de
 * plataforma (já autenticadas), bypass vem de `authPlataformaMiddleware`
 * ter validado o JWT antes.
 *
 * `FORCE ROW LEVEL SECURITY`: mesmo raciocínio das outras migrations desta
 * etapa.
 *
 * Uso: node scripts/migrate-rls-admins-plataforma.js
 */
const pool = require("../src/config/databaseAdmin");

const TABELA = "admins_plataforma";
const CONDICAO_BYPASS = "current_setting('app.bypass_tenant_rls', true) = 'on'";

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log(`- ${TABELA}: habilitando RLS...`);
        await client.query(`ALTER TABLE ${TABELA} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${TABELA} FORCE ROW LEVEL SECURITY`);

        await client.query(`DROP POLICY IF EXISTS admins_plataforma_bypass_only ON ${TABELA}`);

        console.log("  política única: TODAS as operações só em modo bypass (nem SELECT é aberto)...");
        await client.query(`
            CREATE POLICY admins_plataforma_bypass_only ON ${TABELA}
            FOR ALL
            USING (${CONDICAO_BYPASS})
            WITH CHECK (${CONDICAO_BYPASS})
        `);

        await client.query("COMMIT");
        console.log("\nRLS de 'admins_plataforma' concluído: acesso zero para sessão de tenant comum, inclusive leitura.");

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
