/**
 * Migração: habilita Row Level Security nas 7 tabelas tenant-aware —
 * ETAPA 3C-13 (RLS).
 *
 * Tabelas (todas já com `tenant_id NOT NULL`, sem DEFAULT, desde as Etapas
 * 2 e 3C-12): usuarios, empresas, movimentacoes_pontos, recompensas,
 * resgates, recompensas_favoritas, notificacoes_historico.
 *
 * `password_reset_tokens` fica FORA desta migração de propósito (decisão
 * da Etapa 3C-13): o fluxo de redefinição de senha localiza a linha só
 * pelo token secreto, sem nenhum contexto de tenant disponível nesse
 * momento — o mesmo formato de "ciclo" que motivou tratar `tenants` à
 * parte (ver migrate-rls-tenants.js). Continua protegida só por GRANT
 * (migrate-rls-grants.js), exatamente como decidido no relatório da etapa.
 * `tenants` e `admins_plataforma` também ficam de fora (políticas
 * próprias, não tenant-based — ver os outros dois scripts desta etapa).
 *
 * REGRA DA POLÍTICA (idêntica nas 7 tabelas, por isso uma única política
 * `FOR ALL` por tabela, em vez de 4 separadas):
 *
 *   tenant_id da linha = app.tenant_id da sessão   OU   app.bypass_tenant_rls = 'on'
 *
 * `current_setting(nome, true)` — o segundo argumento (`missing_ok`) faz a
 * função devolver NULL em vez de lançar erro quando a variável nunca foi
 * definida na sessão. Isso é o que garante FAIL-CLOSED: sem contexto
 * nenhum, `tenant_id = NULL` nunca é verdadeiro em SQL (NULL nunca é igual
 * a nada, nem a si mesmo), e a comparação com o bypass também dá falso —
 * a política nega tudo, a query correspondente devolve zero linhas (SELECT)
 * ou falha (INSERT/UPDATE/DELETE), nunca "deixa passar por engano".
 *
 * `WITH CHECK` é a MESMA condição do `USING` — isso é o que impede um
 * UPDATE (ou INSERT) de gravar um `tenant_id` diferente do da sessão: o
 * Postgres avalia o `WITH CHECK` contra a linha RESULTANTE da escrita, não
 * a linha original, então mesmo que o `USING` deixasse a linha ser
 * encontrada, a escrita em si é rejeitada se o valor final de `tenant_id`
 * não bater com a sessão (a não ser que bypass esteja ativo).
 *
 * `FORCE ROW LEVEL SECURITY`: nenhum efeito sobre `app_runtime` (que não é
 * dono das tabelas — dono continua sendo `postgres`), mas é cinto e
 * suspensório: fecha a mesma brecha caso a propriedade das tabelas mude no
 * futuro, sem custo nenhum hoje.
 *
 * Nenhum dado de nenhuma linha existente é alterado — só o comportamento
 * de acesso muda, e só para quem conecta como `app_runtime` (postgres,
 * superusuário, continua enxergando tudo, sempre — ver relatório da etapa).
 *
 * Idempotente: `ENABLE`/`FORCE ROW LEVEL SECURITY` não falham se já
 * ativos; a política é recriada (`DROP POLICY IF EXISTS` + `CREATE`) para
 * permitir reaplicar este script depois de um ajuste na condição, sem
 * precisar de uma migration de "remover política antiga" separada.
 *
 * Uso: node scripts/migrate-rls-dominio.js
 */
const pool = require("../src/config/databaseAdmin");

const TABELAS = [
    "usuarios",
    "empresas",
    "movimentacoes_pontos",
    "recompensas",
    "resgates",
    "recompensas_favoritas",
    "notificacoes_historico"
];

const NOME_POLITICA = "tenant_isolation";

const CONDICAO = `(
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR current_setting('app.bypass_tenant_rls', true) = 'on'
)`;

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const tabela of TABELAS) {
            console.log(`- ${tabela}`);

            await client.query(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY`);
            await client.query(`ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY`);

            await client.query(`DROP POLICY IF EXISTS ${NOME_POLITICA} ON ${tabela}`);
            await client.query(`
                CREATE POLICY ${NOME_POLITICA} ON ${tabela}
                FOR ALL
                USING (${CONDICAO})
                WITH CHECK (${CONDICAO})
            `);
        }

        await client.query("COMMIT");
        console.log("\nRLS habilitado e política 'tenant_isolation' criada nas 7 tabelas tenant-aware.");
        console.log("Sem contexto de sessão definido: nenhuma linha visível/gravável (fail-closed).");

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
