/**
 * Migração: coluna `cpf` na tabela `usuarios` — base para o login por CPF.
 *
 * O que muda na tabela `usuarios`:
 *   - nova coluna `cpf` (VARCHAR(11), UNIQUE) — normalizado, só dígitos,
 *     sem pontuação (a máscara "123.456.789-09" é responsabilidade da
 *     interface, nunca do banco).
 *
 * Diferente da migração de `qr_token` (scripts/migrate-usuarios-qr-token.js),
 * esta migração NÃO aplica NOT NULL, e isso é definitivo, não uma etapa
 * intermediária: CPF é obrigatório para todo cadastro novo (validateUser.js)
 * e para o login de qualquer conta comum, mas 3 contas legadas continuam
 * sem CPF por decisão de arquitetura — ver src/utils/identificadoresLegado.js.
 * Nunca inventar um CPF para essas contas só para "completar" a coluna. A
 * constraint UNIQUE já pode ser aplicada mesmo com a coluna nullable porque
 * o Postgres permite múltiplos NULLs numa UNIQUE (não conflitam entre si).
 *
 * Uso: node scripts/migrate-usuarios-cpf.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Adicionando coluna 'cpf' (nullable, ainda sem UNIQUE)...");
        await client.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(11)");

        console.log("2) Aplicando UNIQUE em 'cpf' (NULLs não conflitam entre si)...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_cpf_key'
                ) THEN
                    ALTER TABLE usuarios ADD CONSTRAINT usuarios_cpf_key UNIQUE (cpf);
                END IF;
            END $$;
        `);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");
        console.log("A coluna 'cpf' está pronta. Cadastro novo e login normal exigem CPF.");
        console.log("As 3 contas legadas (src/utils/identificadoresLegado.js) continuam sem CPF, por decisão de arquitetura — não é um estado temporário.");

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
