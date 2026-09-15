/**
 * Migração: identidade/configuração básica de cada tenant.
 *
 * PROBLEMA que isto resolve: até aqui, `tenants` só tinha metadado de
 * roteamento/negócio (nome, slug, plano, status) — nenhum lugar para um
 * tenant ter sua própria marca (logo, cor) nem contato básico (telefone,
 * WhatsApp). O frontend do tenant continuava mostrando só texto genérico
 * onde havia identidade (ver Etapa 1/2 do plano de migração SaaS).
 *
 * O QUE MUDA:
 *
 *   1) 4 colunas NOVAS em `tenants` (nunca uma tabela separada — são só 4
 *      campos escalares, relação 1:1 com o tenant, mesmo padrão de
 *      acesso/RLS do resto da linha; uma tabela de configuração à parte só
 *      se justificaria com uma lista maior/crescente de chaves genéricas,
 *      que não é o caso aqui):
 *        - logo_url VARCHAR(500)   — URL da logo (http(s):// ou caminho
 *          raiz "/..." de um asset já servido pelo próprio app; NUNCA um
 *          upload/data URL — ver validarIdentidadeTenant.js). NULL = sem
 *          logo definida (frontend usa o fallback textual de sempre).
 *        - cor_primaria VARCHAR(7) — hex "#RRGGBB", com CHECK de formato
 *          no próprio banco (defesa em profundidade, além da validação na
 *          API). NULL = sem cor definida.
 *        - telefone VARCHAR(20)    — só dígitos/símbolos comuns de
 *          telefone, sem formato imposto pelo banco (variação
 *          internacional razoável) — validação de formato fica na API.
 *        - whatsapp VARCHAR(20)    — mesmo formato de `telefone`.
 *      Todas NULLABLE, sem DEFAULT — nenhuma linha existente perde ou
 *      ganha um valor por engano; nenhum tenant fica com dado inventado.
 *
 *   2) RLS de `tenants` — a política de mutação única "tudo bypass"
 *      (`tenants_mutacao_bypass`, ETAPA 3C-13) é substituída por 3
 *      políticas mais específicas:
 *        - INSERT/DELETE continuam EXATAMENTE bypass-only (nenhuma
 *          mudança de comportamento aqui — só a Maple Tech cria/apaga
 *          tenants, como sempre foi);
 *        - UPDATE passa a permitir TAMBÉM `id = app.tenant_id da sessão`
 *          (além de bypass) — é isto que permite
 *          PATCH /tenant/config (admin do PRÓPRIO tenant editando sua
 *          identidade) funcionar como uma requisição de tenant NORMAL,
 *          sem precisar de bypass nenhum ali (exigência explícita desta
 *          etapa: "não usar bypass em requisições HTTP comuns"). Uma
 *          tentativa de UPDATE em qualquer OUTRO id continua rejeitada
 *          (USING e WITH CHECK idênticos — nem encontra a linha de outro
 *          tenant, nem consegue gravar apontando pra ela). Qual coluna
 *          pode ser alterada é decisão da API (ver
 *          plataformaTenant... não, ver tenant.routes.js:PATCH /tenant/config),
 *          nunca do RLS (RLS é por LINHA, não por coluna).
 *      SELECT continua idêntico (`tenants_select_publico`, aberto) —
 *      mesmo raciocínio de sempre: nome/slug/logo/cor/telefone/whatsapp
 *      são dado de identidade PÚBLICA (a própria tela de login pré-
 *      autenticação de um tenant já precisa disso), nunca dado de
 *      cliente/negócio individual (isso continua 100% nas 7 tabelas de
 *      domínio, com RLS restrito de verdade).
 *
 * COMPATIBILIDADE — Movement (tenant 1): preenchido com os únicos dois
 * valores que JÁ EXISTEM de forma inequívoca no projeto hoje —
 * `logo_url = '/assets/img/logo.png'` (o mesmo arquivo referenciado em
 * TODAS as telas de autenticação do Movement, ver frontend/index.html) e
 * `cor_primaria = '#E30613'` (--color-red em tokens.css, a cor primária
 * real de botões/ações do Movement). `telefone`/`whatsapp` ficam NULL —
 * nenhum valor real existe no projeto para derivar, e esta migração nunca
 * inventa dado (`COALESCE` só preenche se ainda estiver NULL — rodar de
 * novo depois de o Movement editar esses campos manualmente nunca
 * sobrescreve o valor real por engano).
 *
 * Nenhuma coluna existente é removida ou alterada. Idempotente:
 * `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de recriar,
 * `COALESCE` no UPDATE do Movement.
 *
 * Uso: node scripts/migrate-tenant-identidade.js
 */
const pool = require("../src/config/databaseAdmin");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // BUG CORRIGIDO (achado ao testar com um DB_USER fiel à produção,
        // sem superuser): 'tenants' tem FORCE ROW LEVEL SECURITY desde
        // migrate-rls-tenants.js — isso remove a isenção de RLS até do
        // DONO da tabela, então o UPDATE do passo 3 (abaixo) era
        // silenciosamente bloqueado pela política de mutação
        // (nenhum erro, só 0 linhas afetadas) sempre que quem roda esta
        // migration não for um superusuário de verdade. Mesmo mecanismo
        // JÁ USADO em todo outro fluxo confiável que grava em 'tenants'
        // fora de uma requisição de tenant comum — ver
        // plataformaTenant.controller.js (criarAdmin/onboarding) e
        // resgateExpiracao.service.js: `set_config(..., true)` com
        // is_local=true, escopado só a ESTA transação, revertido
        // automaticamente no COMMIT/ROLLBACK — nunca vaza para a próxima
        // vez que esta conexão física for reaproveitada pelo pool. Nunca
        // exposto a `app_runtime` (esta migration sempre roda via
        // databaseAdmin.js, nunca via database.js) e não altera nenhuma
        // policy/RLS/FORCE — só faz esta transação específica passar na
        // condição de bypass que as policies de 'tenants' já previam.
        await client.query("SELECT set_config('app.bypass_tenant_rls', 'on', true)");

        console.log("1) Adicionando colunas de identidade em 'tenants'...");
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cor_primaria VARCHAR(7)`);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS telefone VARCHAR(20)`);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20)`);

        console.log("2) Garantindo formato hexadecimal de 'cor_primaria' (CHECK no banco)...");
        await client.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_cor_primaria_formato`);
        await client.query(`
            ALTER TABLE tenants ADD CONSTRAINT tenants_cor_primaria_formato
            CHECK (cor_primaria IS NULL OR cor_primaria ~ '^#[0-9A-Fa-f]{6}$')
        `);

        console.log("3) Preenchendo identidade do Movement com valores já existentes no projeto (nunca inventados)...");
        const resultadoMovement = await client.query(`
            UPDATE tenants
            SET logo_url = COALESCE(logo_url, '/assets/img/logo.png'),
                cor_primaria = COALESCE(cor_primaria, '#E30613')
            WHERE slug = 'movement'
            RETURNING id, logo_url, cor_primaria
        `);
        if (resultadoMovement.rows.length > 0) {
            console.log("   - Movement:", resultadoMovement.rows[0]);
        } else {
            console.log("   - Tenant 'movement' não encontrado (banco novo?) — nada a preencher.");
        }

        console.log("4) RLS de 'tenants' — separando INSERT/DELETE (bypass-only) de UPDATE (próprio tenant OU bypass)...");
        await client.query(`DROP POLICY IF EXISTS tenants_mutacao_bypass ON tenants`);
        await client.query(`DROP POLICY IF EXISTS tenants_insert_bypass ON tenants`);
        await client.query(`DROP POLICY IF EXISTS tenants_delete_bypass ON tenants`);
        await client.query(`DROP POLICY IF EXISTS tenants_update_proprio_ou_bypass ON tenants`);

        const CONDICAO_BYPASS = "current_setting('app.bypass_tenant_rls', true) = 'on'";
        const CONDICAO_UPDATE = `(
            id = NULLIF(current_setting('app.tenant_id', true), '')::int
            OR ${CONDICAO_BYPASS}
        )`;

        await client.query(`
            CREATE POLICY tenants_insert_bypass ON tenants
            FOR INSERT
            WITH CHECK (${CONDICAO_BYPASS})
        `);

        await client.query(`
            CREATE POLICY tenants_delete_bypass ON tenants
            FOR DELETE
            USING (${CONDICAO_BYPASS})
        `);

        await client.query(`
            CREATE POLICY tenants_update_proprio_ou_bypass ON tenants
            FOR UPDATE
            USING (${CONDICAO_UPDATE})
            WITH CHECK (${CONDICAO_UPDATE})
        `);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("SELECT continua aberto (metadado de roteamento/identidade pública). INSERT/DELETE continuam bypass-only.");
        console.log("UPDATE agora aceita também o próprio tenant autenticado (sem bypass) — nunca outro tenant.");

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
