/**
 * Cria um administrador da PLATAFORMA Maple Tech diretamente no banco —
 * `admins_plataforma`, nunca `usuarios`. Não confundir com
 * scripts/create-admin.js, que cria um admin do tenant Movement; são
 * tabelas e conceitos completamente diferentes (ver comentário de
 * migrate-admins-plataforma.js).
 *
 * POR QUE NÃO EXISTIA ATÉ AGORA: migrate-admins-plataforma.js cria a
 * tabela sempre VAZIA, de propósito — nenhuma migration insere o primeiro
 * admin. Sem nenhum script de bootstrap, a tabela fica vazia em qualquer
 * banco recém-migrado (incluindo produção), e todo login de plataforma
 * responde "Email ou senha inválidos" (ver plataforma.controller.js:login),
 * porque a linha buscada por email simplesmente não existe.
 *
 * BYPASS DE RLS OBRIGATÓRIO: `admins_plataforma` tem
 * `FORCE ROW LEVEL SECURITY` com uma política única, bypass-only, para
 * TODA operação — inclusive INSERT (ver migrate-rls-admins-plataforma.js).
 * Como este script usa databaseAdmin.js (conecta como DB_USER, dono da
 * tabela mas não necessariamente superusuário — ver achado da etapa de
 * correção de migrate-tenant-identidade.js), um INSERT sem ativar bypass
 * seria rejeitado pelo Postgres com "new row violates row-level security
 * policy" (erro explícito, não uma falha silenciosa — diferente de um
 * UPDATE, que só afetaria 0 linhas sem avisar). Por isso,
 * `SELECT set_config('app.bypass_tenant_rls', 'on', true)` roda logo após
 * o BEGIN, ANTES do INSERT — mesmo padrão já usado em
 * plataformaTenant.controller.js e na correção de
 * migrate-tenant-identidade.js. `true` = is_local, escopado só a esta
 * transação, revertido automaticamente no COMMIT/ROLLBACK.
 *
 * Nunca cria endpoint HTTP para isto — ferramenta de linha de comando,
 * rodada por quem já tem acesso direto ao banco/servidor, nunca exposta
 * pela API (mesmo princípio de create-admin.js).
 *
 * Uso:
 *   node scripts/create-admin-plataforma.js "Nome Completo" "email@mapletech.com.br" "senhaSegura123"
 *
 * Se algum argumento não for informado, o script pergunta interativamente
 * (senha digitada não fica ecoada em texto puro no terminal via readline
 * simples, mas por segurança prefira sempre passar os 3 argumentos numa
 * sessão de shell que você confia — mesmo comportamento de create-admin.js).
 */
const readline = require("readline");
const bcrypt = require("bcrypt");
const pool = require("../src/config/databaseAdmin");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function perguntar(pergunta) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(pergunta, (resposta) => {
            rl.close();
            resolve(resposta.trim());
        });
    });
}

async function obterDados() {
    const [nomeArg, emailArg, senhaArg] = process.argv.slice(2);

    const nome = nomeArg || await perguntar("Nome do administrador de plataforma: ");
    const email = emailArg || await perguntar("Email do administrador de plataforma: ");
    const senha = senhaArg || await perguntar("Senha do administrador (mínimo 6 caracteres): ");

    return { nome, email, senha };
}

function validar({ nome, email, senha }) {
    if (!nome || nome.trim().length < 2) {
        return "Nome é obrigatório e deve ter no mínimo 2 caracteres";
    }

    if (!email || !EMAIL_REGEX.test(email)) {
        return "Email é obrigatório e deve ter um formato válido";
    }

    if (!senha || senha.length < 6) {
        return "Senha é obrigatória e deve ter no mínimo 6 caracteres";
    }

    return null;
}

async function criarAdminPlataforma() {
    const dados = await obterDados();

    const erroDeValidacao = validar(dados);

    if (erroDeValidacao) {
        console.error("Erro: " + erroDeValidacao);
        process.exitCode = 1;
        return;
    }

    // Mesmo mecanismo de hash usado em todo o resto do projeto (bcrypt, 10
    // rounds) — a senha em texto puro nunca é armazenada, nem impressa: só
    // o hash chega ao banco, e nem ele aparece em nenhum console.log abaixo.
    const senhaHash = await bcrypt.hash(dados.senha, 10);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Ver comentário no topo do arquivo — sem isto, o INSERT abaixo é
        // rejeitado pela política RLS bypass-only de 'admins_plataforma'.
        await client.query("SELECT set_config('app.bypass_tenant_rls', 'on', true)");

        const resultado = await client.query(
            `INSERT INTO admins_plataforma (nome, email, senha)
             VALUES ($1, $2, $3)
             RETURNING id, nome, email, criado_em`,
            [dados.nome.trim(), dados.email.trim(), senhaHash]
        );

        await client.query("COMMIT");

        console.log("Administrador de plataforma criado com sucesso:");
        console.log(resultado.rows[0]);

    } catch (erro) {
        await client.query("ROLLBACK");

        if (erro.code === "23505") {
            console.error("Erro: já existe um administrador de plataforma cadastrado com este email.");
            process.exitCode = 1;
            return;
        }

        console.error("Erro ao criar administrador de plataforma:", erro.message);
        process.exitCode = 1;

    } finally {
        client.release();
    }
}

criarAdminPlataforma().finally(() => {
    pool.end();
});
