/**
 * Migração: origem estruturada dos lançamentos de pontos.
 *
 * O que muda na tabela `movimentacoes_pontos`:
 *   - nova coluna `origem` (VARCHAR(20), NOT NULL, DEFAULT 'outro'), com
 *     CHECK restringindo aos 5 valores permitidos: oficina, academia,
 *     promocao, ajuste, outro.
 *
 * Por que DEFAULT 'outro' (e não só NOT NULL sem default): esta etapa não
 * altera POST /pontos/saida — o INSERT de lá continua sem mencionar
 * `origem`, então precisa de um valor automático do banco para continuar
 * funcionando sem nenhuma mudança de código nesse fluxo. Entradas novas
 * SEMPRE informam a origem explicitamente (passa a ser obrigatória na
 * validação de POST /pontos/entrada) — o default nunca é usado nesse
 * caminho, só existe pra não quebrar `saida`.
 *
 * Dados existentes são preservados, não apagados: quantidade, tipo,
 * descrição e datas de todas as movimentações continuam intactas. Toda
 * movimentação anterior a esta migração (entrada ou saída) recebe
 * origem = 'outro'.
 *
 * Uso: node scripts/migrate-movimentacoes-origem.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Adicionando coluna 'origem' (ainda sem NOT NULL/CHECK)...");
        await client.query("ALTER TABLE movimentacoes_pontos ADD COLUMN IF NOT EXISTS origem VARCHAR(20)");

        console.log("2) Preenchendo 'outro' nas movimentações existentes...");
        const atualizadas = await client.query(
            "UPDATE movimentacoes_pontos SET origem = 'outro' WHERE origem IS NULL RETURNING id"
        );
        console.log(`   - ${atualizadas.rows.length} linha(s) existente(s) receberam origem = 'outro'`);

        console.log("3) Aplicando NOT NULL e DEFAULT 'outro'...");
        await client.query("ALTER TABLE movimentacoes_pontos ALTER COLUMN origem SET NOT NULL");
        await client.query("ALTER TABLE movimentacoes_pontos ALTER COLUMN origem SET DEFAULT 'outro'");

        console.log("4) Aplicando CHECK restringindo os valores permitidos...");
        await client.query(`
            ALTER TABLE movimentacoes_pontos
            ADD CONSTRAINT movimentacoes_pontos_origem_check
            CHECK (origem IN ('oficina', 'academia', 'promocao', 'ajuste', 'outro'))
        `);

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
