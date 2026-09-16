/**
 * Pool de RUNTIME da aplicação — ETAPA 3C-13 (RLS).
 *
 * Conecta como `app_runtime` (NOSUPERUSER, NOBYPASSRLS — ver
 * migrate-rls-role.js), nunca mais como `postgres`. É por isso que as
 * políticas RLS criadas nas migrations desta etapa passam a valer de
 * verdade: um superusuário/dono de tabela sempre ignora RLS, `app_runtime`
 * não.
 *
 * A interface pública não muda: `pool.query(sql, params)` continua
 * funcionando exatamente como antes em todo o código que já a usa (nenhum
 * controller precisou ser alterado por causa disto) — só que agora, por
 * baixo, cada chamada:
 *
 *   1) pega uma conexão do pool;
 *   2) BEGIN;
 *   3) `set_config('app.tenant_id', ..., true)` OU
 *      `set_config('app.bypass_tenant_rls', 'on', true)` — nunca os dois,
 *      nunca nenhum literal concatenado na query (sempre via parâmetro
 *      `$1`, exceto o próprio nome da chave/valor 'on', que não vêm de
 *      lugar nenhum externo);
 *   4) roda a query original;
 *   5) COMMIT (ou ROLLBACK em caso de erro);
 *   6) devolve a conexão ao pool.
 *
 * O `true` em `set_config(..., true)` é o `is_local` — a variável de sessão
 * vale só ATÉ O FIM DESTA TRANSAÇÃO. Isso é o que garante que ela nunca
 * sobrevive ao COMMIT/ROLLBACK, e portanto nunca "vaza" para a próxima
 * requisição que pegar essa mesma conexão física de volta do pool — o
 * risco que motivou esta etapa inteira (nunca usar `SET` global numa
 * conexão compartilhada por um pool).
 *
 * DE ONDE VEM O CONTEXTO: exclusivamente de `requestContext.js`
 * (`AsyncLocalStorage`), nunca lido de `req` diretamente aqui — este
 * módulo não sabe nem precisa saber o que é Express. Quem decide o
 * contexto é sempre código que já validou a autenticação (authMiddleware,
 * authPlataformaMiddleware, o login de plataforma, ou um job interno).
 *
 * SEM CONTEXTO NENHUM (`requestContext.getContext()` devolve `null`): a
 * query roda "crua", sem BEGIN/set_config nenhum — nunca assume Movement,
 * nunca assume tenant 1, nunca assume bypass. Para as 7 tabelas com RLS
 * (ver migrate-rls-dominio.js) isso resulta em fail-closed automático
 * (zero linhas visíveis, escrita rejeitada), porque `current_setting(...,
 * true)` sem nenhuma variável definida devolve NULL, e NULL nunca bate com
 * nada nas políticas. Para `tenants` (SELECT sempre aberto) e para
 * `password_reset_tokens` (sem RLS nesta etapa), rodar sem contexto é o
 * comportamento correto e esperado — nenhuma das duas depende disso.
 *
 * `pool.connect()` continua devolvendo um client CRU do `pg`, sem nenhuma
 * decoração — os poucos arquivos que já gerenciam sua própria transação
 * (`user.controller.js`, `points.controller.js`, `redemption.controller.js`,
 * `auth.controller.js:redefinirSenha`, `plataformaTenant.controller.js`,
 * `notificationHistory.js`, `resgateExpiracao.service.js`) continuam
 * fazendo seu próprio BEGIN/COMMIT exatamente como antes, só adicionando
 * uma chamada explícita de `set_config` própria (ver cada um desses
 * arquivos) — nunca uma transação aninhada dentro da transação deles.
 */
require("dotenv").config();

const { Pool } = require("pg");
const requestContext = require("./requestContext");

// TLS — mesmo raciocínio de databaseAdmin.js (ver comentário lá, com o
// achado completo do primeiro deploy real): só em produção, `sslmode=require`
// equivalente ao documentado pela External Database URL do Render — TLS
// sempre obrigatório, sem validar a cadeia do certificado do servidor
// (`rejectUnauthorized: false` só neste `Pool` do `pg`, nunca
// `NODE_TLS_REJECT_UNAUTHORIZED` global). Local de desenvolvimento continua
// idêntico a antes, sem SSL nenhum.
const SSL_HABILITADO = process.env.NODE_ENV === "production";

const pool = new Pool({
    user: process.env.APP_RUNTIME_DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.APP_RUNTIME_DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: SSL_HABILITADO ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
    const contexto = requestContext.getContext();

    if (!contexto) {
        return pool.query(text, params);
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        if (contexto.bypass) {
            await client.query("SELECT set_config('app.bypass_tenant_rls', 'on', true)");
        } else {
            await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(contexto.tenantId)]);
        }

        const resultado = await client.query(text, params);

        await client.query("COMMIT");
        return resultado;

    } catch (erro) {
        await client.query("ROLLBACK").catch(function () {});
        throw erro;

    } finally {
        client.release();
    }
}

module.exports = {
    query,
    connect: pool.connect.bind(pool),
    end: pool.end.bind(pool)
};
