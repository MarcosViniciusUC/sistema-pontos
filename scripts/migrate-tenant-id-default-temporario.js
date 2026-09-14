/**
 * Migração: DEFAULT temporário de compatibilidade para `tenant_id` —
 * correção da regressão encontrada ao testar a Etapa 2 (migrate-tenant-id-
 * dominio.js).
 *
 * PROBLEMA QUE ISTO CORRIGE: `tenant_id` ficou NOT NULL nas 8 tabelas de
 * domínio, mas nenhum controller foi alterado para informá-lo em INSERTs
 * novos (correto para esta fase — controllers só mudam numa etapa
 * futura). Sem DEFAULT, todo INSERT novo (cadastro, lançar pontos,
 * favoritar, pedir recuperação de senha) passou a falhar com erro de
 * NOT NULL. Confirmado por teste real antes desta correção existir.
 *
 * O QUE ESTA MIGRAÇÃO FAZ: só `ALTER COLUMN tenant_id SET DEFAULT <id>`
 * nas mesmas 8 tabelas — nada mais. NÃO mexe em NOT NULL (continua),
 * NÃO mexe em nenhuma constraint UNIQUE/FK já criada, NÃO cria tabela
 * nova, NÃO toca em nenhum dado de nenhuma linha existente.
 *
 * COMO O ID DO TENANT É OBTIDO: sempre por `SELECT id FROM tenants WHERE
 * slug = 'movement'`, nunca um literal "1" escrito à mão neste arquivo —
 * mesmo princípio defensivo já usado em migrate-tenant-id-dominio.js. Se
 * o tenant 'movement' não existir, a migração aborta sem alterar nada
 * (ROLLBACK), nunca assume ou inventa um id.
 *
 * ISTO É UM MECANISMO TEMPORÁRIO DE COMPATIBILIDADE — não uma decisão de
 * arquitetura definitiva. Existe só enquanto os controllers atuais ainda
 * fazem INSERT sem conhecer `tenant_id`. Quando os controllers forem
 * atualizados (etapa futura) para informar `tenant_id` explicitamente a
 * partir do usuário autenticado, este DEFAULT deixa de ser necessário —
 * ele pode continuar existindo sem causar dano (nunca é usado se o INSERT
 * já informa o valor), mas deve ser revisado/removido nessa etapa para não
 * mascarar um controller que esqueceu de informar o tenant certo.
 *
 * Idempotente: `SET DEFAULT` no mesmo valor pode ser reaplicado quantas
 * vezes for preciso, sem erro.
 *
 * Uso: node scripts/migrate-tenant-id-default-temporario.js
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

        console.log("0) Confirmando o id real do Tenant 1 (movement)...");
        const tenantResultado = await client.query("SELECT id FROM tenants WHERE slug = 'movement'");

        if (tenantResultado.rows.length === 0) {
            throw new Error("Tenant 'movement' não encontrado — nada foi alterado.");
        }

        const tenantId = tenantResultado.rows[0].id;
        console.log(`   Tenant 'movement' encontrado (id=${tenantId}) — usado como DEFAULT.`);

        console.log("\n1) Aplicando DEFAULT temporário de compatibilidade em 'tenant_id'...");
        for (const tabela of TABELAS_DOMINIO) {
            await client.query(`ALTER TABLE ${tabela} ALTER COLUMN tenant_id SET DEFAULT ${tenantId}`);
            console.log(`   - ${tabela}.tenant_id DEFAULT ${tenantId}`);
        }

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("LEMBRETE: este DEFAULT é temporário — revisar/remover quando os controllers passarem a informar tenant_id explicitamente.");

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
