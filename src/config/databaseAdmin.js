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

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

module.exports = pool;
