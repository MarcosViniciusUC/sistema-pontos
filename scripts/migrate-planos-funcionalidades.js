/**
 * Migração: base de PLANOS COMERCIAIS + FUNCIONALIDADES por tenant.
 *
 * PROBLEMA que isto resolve: até aqui, `tenants.plano` era só uma coluna
 * livre (VARCHAR nullable, ver migrate-tenants.js) sem nenhuma regra
 * associada — qualquer verificação de "este tenant pode fazer X" teria que
 * virar `if (tenant.plano === "profissional")` espalhado pelos
 * controllers. Esta migração cria uma fonte central de verdade: plano ->
 * funcionalidades padrão, com espaço para exceções por tenant (liberação
 * administrativa da Maple Tech sem mudar o plano comercial).
 *
 * O QUE MUDA:
 *
 *   1) `funcionalidades` — catálogo das funcionalidades que podem ser
 *      LIGADAS/DESLIGADAS por plano. Só entram aqui recursos OPCIONAIS,
 *      que já existem de verdade no sistema hoje — nunca recursos da
 *      linha de base do produto (programa de pontos, QR Code, recompensas,
 *      resgates, cadastro de funcionários, histórico, recuperação de
 *      senha), que continuam disponíveis para QUALQUER tenant
 *      incondicionalmente, sem precisar de flag nenhuma (são o próprio
 *      produto, não um upsell).
 *
 *   2) `planos` — catálogo dos planos comerciais (essencial/profissional/
 *      premium), com o limite de empresas/unidades de cada um. Preço NÃO
 *      é armazenado aqui de propósito — isto não é um sistema de cobrança
 *      (ver `docs`/instruções desta etapa: nada de Stripe/Mercado
 *      Pago/inadimplência), só o metadado necessário para decidir
 *      funcionalidades.
 *
 *   3) `plano_funcionalidades` — relação N:N: quais funcionalidades cada
 *      plano inclui por padrão.
 *
 *   4) `tenant_funcionalidades_override` — exceção por tenant: força uma
 *      funcionalidade específica ligada OU desligada para UM tenant,
 *      independente do plano dele. É o mecanismo que permite a Maple Tech
 *      liberar algo extra (ou revogar algo do próprio plano) para um
 *      tenant específico sem mudar o `plano` comercial dele nem duplicar
 *      catálogo nenhum.
 *
 *   5) `tenants.limite_empresas_override` — mesma ideia do item 4, mas para
 *      o limite NUMÉRICO de empresas (não cabe no modelo booleano de
 *      funcionalidades) — NULL (padrão) usa o limite do plano; um número
 *      aqui substitui esse limite só para este tenant.
 *
 * RESOLUÇÃO (ver src/services/planosFuncionalidades.service.js, única fonte
 * de verdade em código — nenhum controller consulta estas tabelas
 * diretamente):
 *   funcionalidade final = override do tenant, se existir
 *                           SENÃO funcionalidade do plano do tenant
 *                           SENÃO (plano NULL — tenant legado) tudo ligado
 *
 * COMPATIBILIDADE — Movement (tenant 1) tem `plano IS NULL` hoje (nenhum
 * plano comercial foi definido ainda para ele; ver migrate-tenants.js, que
 * já deixava `plano` nullable de propósito). Esta migração NÃO inventa um
 * plano para o Movement (nenhum UPDATE em `tenants` aqui) — a camada de
 * resolução trata `plano IS NULL` como "tenant legado, todas as
 * funcionalidades ligadas, sem limite de empresas", preservando 100% do
 * comportamento atual dele (que já usa favoritos, destaque e múltiplas
 * empresas hoje). Quando a Maple Tech decidir formalmente qual plano
 * comercial o Movement assina, um simples
 * `UPDATE tenants SET plano = '...' WHERE id = 1` resolve — sem migração
 * nova.
 *
 * RLS: `funcionalidades`/`planos`/`plano_funcionalidades` recebem a MESMA
 * política de `tenants` (ver migrate-rls-tenants.js) — SELECT sempre
 * aberto (catálogo público, sem dado de negócio de nenhum tenant) e
 * mutação só em bypass (só a Maple Tech, via ferramenta interna, define
 * planos/funcionalidades — nunca um tenant comum).
 * `tenant_funcionalidades_override` recebe a política PADRÃO das 7 tabelas
 * de domínio (ver migrate-rls-dominio.js) — tenant só vê/mexe no próprio
 * override, bypass vê/mexe em todos.
 *
 * Nenhuma tabela existente perde dado. Idempotente: `CREATE TABLE IF NOT
 * EXISTS`, `ON CONFLICT DO NOTHING` no seed, `DROP POLICY IF EXISTS` antes
 * de recriar.
 *
 * Uso: node scripts/migrate-planos-funcionalidades.js
 */
const pool = require("../src/config/databaseAdmin");

const ROLE = "app_runtime";
const CONDICAO_BYPASS = "current_setting('app.bypass_tenant_rls', true) = 'on'";
const CONDICAO_TENANT_ISOLATION = `(
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR ${CONDICAO_BYPASS}
)`;

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Criando tabela 'funcionalidades' (catálogo)...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS funcionalidades (
                chave VARCHAR(50) PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                descricao TEXT,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("2) Criando tabela 'planos' (catálogo comercial)...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS planos (
                codigo VARCHAR(30) PRIMARY KEY,
                nome VARCHAR(60) NOT NULL,
                limite_empresas INTEGER NOT NULL,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("3) Criando tabela 'plano_funcionalidades' (plano -> funcionalidades padrão)...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS plano_funcionalidades (
                plano_codigo VARCHAR(30) NOT NULL REFERENCES planos(codigo) ON DELETE CASCADE,
                funcionalidade_chave VARCHAR(50) NOT NULL REFERENCES funcionalidades(chave) ON DELETE CASCADE,
                PRIMARY KEY (plano_codigo, funcionalidade_chave)
            )
        `);

        console.log("4) Criando tabela 'tenant_funcionalidades_override' (exceção por tenant)...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenant_funcionalidades_override (
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                funcionalidade_chave VARCHAR(50) NOT NULL REFERENCES funcionalidades(chave) ON DELETE CASCADE,
                habilitada BOOLEAN NOT NULL,
                criado_em TIMESTAMP NOT NULL DEFAULT now(),
                PRIMARY KEY (tenant_id, funcionalidade_chave)
            )
        `);

        console.log("5) Adicionando 'tenants.limite_empresas_override' (NULL = usa o limite do plano)...");
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limite_empresas_override INTEGER`);

        console.log("6) Semeando catálogo de funcionalidades...");
        const FUNCIONALIDADES = [
            ["favoritos", "Favoritar recompensas", "Cliente marcar recompensas como favoritas (POST/DELETE /favoritos/:id)."],
            ["recompensas_destaque", "Destacar recompensas", "Admin/funcionário marcar recompensas como destaque global (PATCH /recompensas/:id/destacar)."],
            ["gamificacao_progresso", "Progresso e sugestão de recompensa", "Barra de progresso e 'quase lá' no dashboard do cliente (dashboard completo)."]
        ];
        for (const [chave, nome, descricao] of FUNCIONALIDADES) {
            await client.query(
                `INSERT INTO funcionalidades (chave, nome, descricao) VALUES ($1, $2, $3) ON CONFLICT (chave) DO NOTHING`,
                [chave, nome, descricao]
            );
            console.log(`   - ${chave}`);
        }

        console.log("7) Semeando catálogo de planos...");
        const PLANOS = [
            ["essencial", "Essencial", 1],
            ["profissional", "Profissional", 3],
            ["premium", "Premium", 10]
        ];
        for (const [codigo, nome, limiteEmpresas] of PLANOS) {
            await client.query(
                `INSERT INTO planos (codigo, nome, limite_empresas) VALUES ($1, $2, $3) ON CONFLICT (codigo) DO NOTHING`,
                [codigo, nome, limiteEmpresas]
            );
            console.log(`   - ${codigo} (limite_empresas=${limiteEmpresas})`);
        }

        console.log("8) Semeando plano_funcionalidades (essencial não ganha nenhuma extra)...");
        const PLANO_FUNCIONALIDADES = [
            ["profissional", "favoritos"],
            ["profissional", "recompensas_destaque"],
            ["profissional", "gamificacao_progresso"],
            ["premium", "favoritos"],
            ["premium", "recompensas_destaque"],
            ["premium", "gamificacao_progresso"]
        ];
        for (const [planoCodigo, funcionalidadeChave] of PLANO_FUNCIONALIDADES) {
            await client.query(
                `INSERT INTO plano_funcionalidades (plano_codigo, funcionalidade_chave) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [planoCodigo, funcionalidadeChave]
            );
            console.log(`   - ${planoCodigo} -> ${funcionalidadeChave}`);
        }

        console.log("9) RLS: 'funcionalidades'/'planos'/'plano_funcionalidades' (SELECT aberto, mutação só em bypass)...");
        for (const tabela of ["funcionalidades", "planos", "plano_funcionalidades"]) {
            await client.query(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY`);
            await client.query(`ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY`);

            await client.query(`DROP POLICY IF EXISTS ${tabela}_select_publico ON ${tabela}`);
            await client.query(`
                CREATE POLICY ${tabela}_select_publico ON ${tabela}
                FOR SELECT
                USING (true)
            `);

            await client.query(`DROP POLICY IF EXISTS ${tabela}_mutacao_bypass ON ${tabela}`);
            await client.query(`
                CREATE POLICY ${tabela}_mutacao_bypass ON ${tabela}
                FOR ALL
                USING (${CONDICAO_BYPASS})
                WITH CHECK (${CONDICAO_BYPASS})
            `);
            console.log(`   - ${tabela}`);
        }

        console.log("10) RLS: 'tenant_funcionalidades_override' (mesma política tenant_isolation das tabelas de domínio)...");
        await client.query(`ALTER TABLE tenant_funcionalidades_override ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE tenant_funcionalidades_override FORCE ROW LEVEL SECURITY`);
        await client.query(`DROP POLICY IF EXISTS tenant_isolation ON tenant_funcionalidades_override`);
        await client.query(`
            CREATE POLICY tenant_isolation ON tenant_funcionalidades_override
            FOR ALL
            USING (${CONDICAO_TENANT_ISOLATION})
            WITH CHECK (${CONDICAO_TENANT_ISOLATION})
        `);

        console.log("11) Grants para app_runtime (SELECT/INSERT/UPDATE/DELETE — sem CREATE/ALTER/DROP)...");
        for (const tabela of ["funcionalidades", "planos", "plano_funcionalidades", "tenant_funcionalidades_override"]) {
            await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tabela} TO ${ROLE}`);
            console.log(`   - ${tabela}`);
        }

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("Nenhum plano foi atribuído ao Movement (tenant 1) — continua com plano NULL, tratado como legado (todas as funcionalidades ligadas) pela camada de resolução.");

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
