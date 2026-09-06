/**
 * Migração: novo fluxo de resgates (desconto imediato de pontos + código
 * de reserva único), em vez de pendente → aprovação manual do admin.
 *
 * O que muda na tabela `resgates`:
 *   - nova coluna `codigo` (VARCHAR, UNIQUE, NOT NULL) — código de reserva.
 *   - `status` passa a aceitar apenas: pendente_validacao, utilizado,
 *     cancelado (em vez de pendente/aprovado/recusado).
 *   - novo valor padrão de `status`: 'pendente_validacao'.
 *
 * Dados existentes são preservados, não apagados. Se houver linhas com o
 * status antigo, o remapeamento é:
 *   - 'aprovado'  -> 'pendente_validacao'
 *       (pontos já haviam sido descontados pelo admin; no novo modelo isso
 *        equivale a "resgate válido, ainda não utilizado pelo funcionário")
 *   - 'pendente' ou 'recusado' -> 'cancelado'
 *       (pontos nunca chegaram a ser descontados nesses dois casos antigos)
 * Cada linha existente recebe um código de reserva real, gerado pela mesma
 * função usada nos resgates novos (não um valor de preenchimento falso).
 *
 * Uso: node scripts/migrate-resgates-fluxo-imediato.js
 */
const pool = require("../src/config/database");
const { gerarCodigoResgate } = require("../src/utils/codigoResgate");

async function gerarCodigoUnicoNaTransacao(client) {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
        const codigo = gerarCodigoResgate();
        const existe = await client.query("SELECT 1 FROM resgates WHERE codigo = $1", [codigo]);

        if (existe.rows.length === 0) {
            return codigo;
        }
    }

    throw new Error("Não foi possível gerar um código de reserva único para a migração.");
}

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Adicionando coluna 'codigo' (ainda sem NOT NULL/UNIQUE)...");
        await client.query("ALTER TABLE resgates ADD COLUMN IF NOT EXISTS codigo VARCHAR(12)");

        console.log("2) Preenchendo código de reserva real para linhas existentes...");
        const linhasExistentes = await client.query("SELECT id FROM resgates WHERE codigo IS NULL");

        for (const linha of linhasExistentes.rows) {
            const codigo = await gerarCodigoUnicoNaTransacao(client);
            await client.query("UPDATE resgates SET codigo = $1 WHERE id = $2", [codigo, linha.id]);
            console.log(`   - resgate #${linha.id} recebeu o código ${codigo}`);
        }

        console.log("3) Aplicando NOT NULL e UNIQUE em 'codigo'...");
        await client.query("ALTER TABLE resgates ALTER COLUMN codigo SET NOT NULL");
        await client.query(`
            ALTER TABLE resgates
            ADD CONSTRAINT resgates_codigo_key UNIQUE (codigo)
        `);

        console.log("4) Removendo a restrição CHECK antiga (bloquearia os novos valores de status)...");
        await client.query("ALTER TABLE resgates DROP CONSTRAINT resgates_status_check");

        console.log("5) Remapeando status antigos para o novo modelo...");
        const remapAprovado = await client.query(
            "UPDATE resgates SET status = 'pendente_validacao' WHERE status = 'aprovado' RETURNING id"
        );
        console.log(`   - 'aprovado' -> 'pendente_validacao': ${remapAprovado.rows.length} linha(s)`);

        const remapCancelado = await client.query(
            "UPDATE resgates SET status = 'cancelado' WHERE status IN ('pendente', 'recusado') RETURNING id"
        );
        console.log(`   - 'pendente'/'recusado' -> 'cancelado': ${remapCancelado.rows.length} linha(s)`);

        console.log("6) Aplicando a nova restrição CHECK e o novo valor padrão de 'status'...");
        await client.query("ALTER TABLE resgates ALTER COLUMN status SET DEFAULT 'pendente_validacao'");
        await client.query(`
            ALTER TABLE resgates
            ADD CONSTRAINT resgates_status_check
            CHECK (status IN ('pendente_validacao', 'utilizado', 'cancelado'))
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
