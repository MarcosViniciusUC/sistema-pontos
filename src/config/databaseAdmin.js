/**
 * Pool de ADMINISTRAÇÃO/DDL — ETAPA 3C-13 (RLS).
 *
 * Conecta como `DB_USER` (hoje `postgres`, dono de todas as tabelas) —
 * exatamente a mesma credencial que o projeto sempre usou, sem nenhuma
 * mudança de valor. Usado exclusivamente por:
 *   - scripts/migrate.js (orquestrador: precisa criar/ler `migration_history`,
 *     que exige CREATE no schema — privilégio que `app_runtime` deliberadamente
 *     não tem);
 *   - migrations que fazem DDL (CREATE ROLE, GRANT, ALTER TABLE, CREATE
 *     POLICY) — só um superuser/dono de tabela pode rodar isso;
 *   - scripts/create-admin.js e scripts/create-funcionario.js — ferramentas
 *     de bootstrap local, nunca expostas pela API, que continuam operando
 *     exatamente como antes (nenhuma mudança de comportamento).
 *
 * NUNCA usado pelo processo HTTP do servidor (server.js e tudo que ele
 * carrega) — esse caminho usa exclusivamente `./database.js`, que conecta
 * como `app_runtime` (sem superuser, sem bypass de RLS) a partir desta
 * etapa. Ver `docs/` / relatório da Etapa 3C-13 para o raciocínio completo
 * por trás dessa separação de papéis.
 */
require("dotenv").config();

const { Pool } = require("pg");

// TLS — só em produção (Render, ou qualquer Postgres gerenciado externo,
// normalmente exige SSL em conexões de fora da própria rede interna dele;
// o Postgres local de desenvolvimento nunca exigiu isso, e continua sem
// exigir).
//
// CORREÇÃO (achado no primeiro deploy real): `rejectUnauthorized: true`
// falhava com "self-signed certificate" contra a External Database URL do
// Render — a documentação do próprio Render confirma que essa conexão
// externa exige TLS, mas no nível equivalente a `sslmode=require` do
// Postgres: TLS sempre obrigatório (a conexão nunca cai para texto puro),
// só SEM validar a cadeia do certificado do servidor contra uma CA
// conhecida. `rejectUnauthorized: false` aqui é exatamente esse modo — não
// é "sem TLS", é "TLS sem verificação de cadeia", e o escopo é só este
// `Pool` do `pg`: nunca afeta nenhuma outra conexão TLS/HTTPS do processo
// (isso seria `NODE_TLS_REJECT_UNAUTHORIZED=0`, uma variável de ambiente
// global — deliberadamente NÃO usada aqui, nem em lugar nenhum do
// projeto). Continua só em produção; local de desenvolvimento continua com
// `ssl: false` (nenhum TLS), sem nenhuma mudança.
const SSL_HABILITADO = process.env.NODE_ENV === "production";

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: SSL_HABILITADO ? { rejectUnauthorized: false } : false
});

module.exports = pool;
