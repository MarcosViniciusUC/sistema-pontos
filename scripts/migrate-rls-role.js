/**
 * Migração: cria o papel de banco `app_runtime` — ETAPA 3C-13 (RLS).
 *
 * POR QUE ISTO EXISTE: RLS nunca tem efeito sobre um superusuário nem sobre
 * o dono da tabela (regra fixa do PostgreSQL, sem exceção). Hoje a aplicação
 * conecta como `postgres`, que é as DUAS coisas ao mesmo tempo — ou seja,
 * qualquer política criada seria inteiramente ignorada, sem erro, sem
 * aviso. `app_runtime` é o papel que vai realmente estar sujeito às
 * políticas: NOSUPERUSER, NOBYPASSRLS, e nunca dono de tabela nenhuma
 * (ownership continua 100% com `postgres`).
 *
 * `app_runtime`:
 *   - LOGIN (precisa, é quem a aplicação usa pra conectar)
 *   - NOSUPERUSER
 *   - NOBYPASSRLS
 *   - NOCREATEDB
 *   - NOCREATEROLE
 *   - NOREPLICATION
 *
 * Não recebe NENHUM privilégio de tabela aqui — isso é
 * migrate-rls-grants.js, separado de propósito (criar o papel e conceder
 * acesso são decisões independentes, mais fácil auditar cada uma).
 *
 * SENHA: nunca hardcoded neste arquivo. Vem de
 * `APP_RUNTIME_DB_PASSWORD` (variável de ambiente, `.env` local — nunca
 * versionado). Sem essa variável, a migração aborta sem criar nada.
 * Reaplicável: se `app_runtime` já existir, só sincroniza os atributos e a
 * senha (permite rotacionar a senha rodando este script de novo, sem
 * precisar de uma migration nova para isso).
 *
 * Uso: node scripts/migrate-rls-role.js
 */
const pool = require("../src/config/databaseAdmin");

const NOME_ROLE = "app_runtime";

// PASSWORD/ALTER ROLE ... PASSWORD não aceita parâmetro ($1) — é uma
// exigência da gramática SQL (precisa ser uma string literal), não um
// jeito de rodar a query. Por isso o valor é escapado manualmente (aspas
// simples dobradas, mesma regra do próprio Postgres para literais) e
// embutido na string — a fonte do valor é sempre uma variável de ambiente
// do servidor, nunca input de usuário/HTTP.
function escaparLiteralSql(valor) {
    return valor.replace(/'/g, "''");
}

async function migrar() {
    const senha = process.env.APP_RUNTIME_DB_PASSWORD;

    if (!senha || senha.trim().length === 0) {
        console.error("Erro: variável de ambiente APP_RUNTIME_DB_PASSWORD não definida — nada foi criado.");
        process.exitCode = 1;
        return;
    }

    const senhaEscapada = escaparLiteralSql(senha);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existente = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [NOME_ROLE]);

        if (existente.rows.length === 0) {
            console.log(`Criando role '${NOME_ROLE}'...`);
            await client.query(
                `CREATE ROLE ${NOME_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senhaEscapada}'`
            );
        } else {
            console.log(`Role '${NOME_ROLE}' já existe — sincronizando atributos e senha...`);
            await client.query(
                `ALTER ROLE ${NOME_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${senhaEscapada}'`
            );
        }

        await client.query("COMMIT");
        console.log(`\nRole '${NOME_ROLE}' pronta (LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION).`);
        console.log("Nenhum privilégio de tabela concedido ainda — ver migrate-rls-grants.js.");

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
