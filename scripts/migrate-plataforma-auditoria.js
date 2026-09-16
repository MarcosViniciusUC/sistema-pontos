/**
 * Migração: histórico/auditoria das ações administrativas da Plataforma
 * Maple Tech — nova tabela `plataforma_auditoria`.
 *
 * PROBLEMA que isto resolve: não existia nenhum registro de quem fez o quê
 * no painel da plataforma (criar tenant, mudar plano, ativar/desativar,
 * editar identidade, criar admin de tenant) — confirmado por busca em todo
 * o projeto antes de criar esta migração; nenhuma tabela/mecanismo de
 * auditoria já existente poderia ser reaproveitado (`notificacoes_historico`
 * é do Motor de Engajamento, sobre clientes de tenant, sem nenhuma relação
 * com ações administrativas da Maple).
 *
 * O QUE MUDA:
 *   - nova tabela `plataforma_auditoria`:
 *       id                    SERIAL PK
 *       admin_plataforma_id   INTEGER NOT NULL REFERENCES admins_plataforma(id)
 *           — quem executou. NUNCA nulo: toda ação auditada nesta etapa só
 *           é alcançável depois de authPlataformaMiddleware validar um JWT
 *           de plataforma de verdade (ver relatório desta etapa).
 *       tenant_id             INTEGER REFERENCES tenants(id), NULLABLE
 *           — em qual tenant a ação foi sobre. NULL de propósito para uma
 *           eventual ação futura de escopo geral da plataforma (nenhuma
 *           existe ainda nesta etapa — todas as 5 ações registradas têm
 *           tenant_id preenchido).
 *       acao                  VARCHAR(50) NOT NULL
 *           — vocabulário fechado (ver ACOES_VALIDAS em
 *           plataformaTenant.controller.js), nunca texto livre.
 *       entidade              VARCHAR(50) NOT NULL
 *           — "tenant" ou "usuario" (o que foi afetado), nunca texto livre.
 *       entidade_id           INTEGER, NULLABLE
 *           — id da linha afetada (tenant ou usuário) — sem FK própria de
 *           propósito: pode apontar tanto para `tenants` quanto para
 *           `usuarios` dependendo de `entidade`, então uma FK única não
 *           faria sentido aqui (mesmo raciocínio de não inventar uma
 *           constraint que não pode ser genuinamente respeitada).
 *       descricao             TEXT NOT NULL
 *           — texto pronto para exibição (ex: "Plano alterado de
 *           profissional para premium"), montado pelo controller no
 *           momento da ação — nunca reconstruído depois a partir de outras
 *           tabelas.
 *       criado_em             TIMESTAMP NOT NULL DEFAULT now()
 *
 *   NUNCA armazenados aqui, por decisão explícita desta etapa: senha, hash,
 *   token JWT, CPF de cliente, ou qualquer outro dado sensível — a tabela
 *   guarda só metadado administrativo (quem/o quê/onde/quando), nunca o
 *   conteúdo sensível da operação em si.
 *
 * RLS: mesmo padrão de `admins_plataforma` (ver
 * migrate-rls-admins-plataforma.js) — tabela sensível, sem "tenant dono" a
 * quem abrir SELECT (diferente de `tenants`), então bypass-only para TODA
 * operação, inclusive leitura. `FORCE ROW LEVEL SECURITY` pelo mesmo motivo
 * de sempre (cinto e suspensório caso a propriedade da tabela mude no
 * futuro).
 *
 * GRANTS: deliberadamente só SELECT e INSERT para `app_runtime` — nunca
 * UPDATE nem DELETE. Um registro de auditoria não deve ser alterável nem
 * apagável pela aplicação em nenhuma circunstância; é o próprio propósito
 * de um histórico. (CREATE/ALTER/DROP continuam nunca concedidos, como em
 * toda outra migration desta linha.)
 *
 * Nenhuma tabela existente é alterada. Idempotente: `CREATE TABLE IF NOT
 * EXISTS`, `DROP POLICY IF EXISTS` antes de recriar, `GRANT` reaplicável.
 *
 * Uso: node scripts/migrate-plataforma-auditoria.js
 */
const pool = require("../src/config/databaseAdmin");

const TABELA = "plataforma_auditoria";
const ROLE = "app_runtime";
const CONDICAO_BYPASS = "current_setting('app.bypass_tenant_rls', true) = 'on'";

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log(`1) Criando tabela '${TABELA}'...`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${TABELA} (
                id SERIAL PRIMARY KEY,
                admin_plataforma_id INTEGER NOT NULL REFERENCES admins_plataforma(id),
                tenant_id INTEGER REFERENCES tenants(id),
                acao VARCHAR(50) NOT NULL,
                entidade VARCHAR(50) NOT NULL,
                entidade_id INTEGER,
                descricao TEXT NOT NULL,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("2) Índice de apoio para a consulta cronológica/por tenant...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS plataforma_auditoria_criado_em_idx
            ON ${TABELA} (criado_em DESC)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS plataforma_auditoria_tenant_id_idx
            ON ${TABELA} (tenant_id)
        `);

        console.log("3) RLS: bypass-only para TODA operação, inclusive SELECT...");
        await client.query(`ALTER TABLE ${TABELA} ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${TABELA} FORCE ROW LEVEL SECURITY`);
        await client.query(`DROP POLICY IF EXISTS plataforma_auditoria_bypass_only ON ${TABELA}`);
        await client.query(`
            CREATE POLICY plataforma_auditoria_bypass_only ON ${TABELA}
            FOR ALL
            USING (${CONDICAO_BYPASS})
            WITH CHECK (${CONDICAO_BYPASS})
        `);

        console.log("4) Grants para app_runtime — SOMENTE SELECT e INSERT (nunca UPDATE/DELETE: histórico é imutável)...");
        await client.query(`GRANT SELECT, INSERT ON ${TABELA} TO ${ROLE}`);
        await client.query(`GRANT USAGE ON SEQUENCE ${TABELA}_id_seq TO ${ROLE}`);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("'plataforma_auditoria' pronta: bypass-only, imutável (sem UPDATE/DELETE para app_runtime).");

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
