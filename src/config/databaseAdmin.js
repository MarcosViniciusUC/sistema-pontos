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
// exigir). `rejectUnauthorized` fica no padrão seguro do Node (`true` —
// verifica a cadeia de certificado do servidor contra as CAs confiáveis do
// próprio sistema) — nunca desabilitado aqui, mesmo que o motivo original
// desta mudança tenha sido um erro de conexão (ECONNRESET): a causa era
// ausência de SSL, não um certificado inválido, e habilitar verificação
// insegura (`rejectUnauthorized: false`) esconderia um problema real de
// certificado em vez de resolver a causa raiz.
const SSL_HABILITADO = process.env.NODE_ENV === "production";

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: SSL_HABILITADO ? { rejectUnauthorized: true } : false
});

module.exports = pool;
