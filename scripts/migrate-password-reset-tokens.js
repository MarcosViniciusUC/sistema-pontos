/**
 * Migração: recuperação de senha por e-mail.
 *
 * O que muda:
 *   - nova tabela `password_reset_tokens` (usuario_id, token_hash, expira_em,
 *     usado_em, criado_em).
 *
 * Por que uma tabela nova, e por que estas colunas:
 *   - `usuario_id` INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE
 *     — diferente de resgates/movimentacoes_pontos (histórico financeiro que
 *     nunca pode sumir), um token de recuperação é um artefato de segurança
 *     efêmero: se o usuário deixasse de existir, o token não teria mais
 *     nenhum propósito (mesmo raciocínio de cascade já usado em
 *     recompensas_favoritas — ver migrate-recompensas-favoritas.js).
 *   - `token_hash` VARCHAR(64) NOT NULL UNIQUE — SHA-256 hex (64 caracteres)
 *     do token real. O token BRUTO (o que vai na URL do e-mail) NUNCA é
 *     gravado no banco — só o hash, mesmo princípio de nunca guardar senha
 *     em texto puro. UNIQUE porque é a chave de busca ao clicar no link.
 *   - `expira_em` TIMESTAMP NOT NULL — comparado sempre no próprio Postgres
 *     (`expira_em > NOW()`), nunca calculado no Node, mesmo princípio já
 *     usado na expiração de resgates (resgateExpiracao.service.js).
 *   - `usado_em` TIMESTAMP, nullable — NULL significa "ainda não usado";
 *     preenchido no momento em que a senha é efetivamente trocada. Faz
 *     dupla função: é o marcador de "já consumido" (uso único) E o
 *     registro de "quando foi usado", sem precisar de duas colunas.
 *   - `criado_em` TIMESTAMP NOT NULL DEFAULT now() — quando o pedido foi
 *     feito.
 *
 * Índices:
 *   - `password_reset_tokens_usuario_idx` em (usuario_id) — usado para
 *     invalidar tokens antigos do mesmo usuário ao criar um pedido novo
 *     (ver auth.controller.js:esqueciSenha).
 *   - UNIQUE em `token_hash` já cria seu próprio índice — é a consulta que
 *     acontece ao clicar no link de redefinição (busca por hash).
 *
 * Nenhuma tabela/coluna existente é alterada. Nenhuma linha de usuários,
 * pontos, recompensas, resgates, favoritos ou empresas é tocada.
 *
 * Uso: node scripts/migrate-password-reset-tokens.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Criando tabela 'password_reset_tokens'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expira_em TIMESTAMP NOT NULL,
                usado_em TIMESTAMP,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("2) Criando índice de apoio (usuario_id)...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS password_reset_tokens_usuario_idx
            ON password_reset_tokens (usuario_id)
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
