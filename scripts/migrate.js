/**
 * Orquestrador de migrations — controle de quais scripts em `scripts/`
 * (migrate-*.js) já foram aplicados neste banco, para que rodar `npm run
 * migrate` seja sempre seguro: nunca repete uma migration já aplicada,
 * sempre roda na ordem certa, e para no primeiro erro.
 *
 * Por que isto existe: 3 das 8 migrations atuais (movimentacoes-origem,
 * resgates-fluxo-imediato, usuarios-qr-token) fazem `ADD CONSTRAINT` sem
 * `IF NOT EXISTS` — rodar o arquivo duas vezes falha com "constraint already
 * exists". Nunca tocamos nesses arquivos (continuam podendo ser rodados
 * manualmente, um por um, exatamente como antes); este orquestrador só
 * garante que cada um roda exatamente uma vez.
 *
 * Como funciona:
 *   1) Garante que a tabela `migration_history` existe (id, nome UNIQUE,
 *      executado_em) — criada automaticamente, sem precisar de uma
 *      migration própria para isso.
 *   2) Para cada migration da lista ORDENAMENTO abaixo (nunca a ordem
 *      alfabética do diretório — não bate com a ordem de dependência real):
 *        a) já tem registro em migration_history? -> pula (rápido, sem
 *           tocar no schema de novo).
 *        b) sem registro, mas o schema já mostra o efeito dela (ex: a
 *           coluna que ela cria já existe)? -> REGISTRA sem executar de
 *           novo. Isso é o que permite rodar este orquestrador pela
 *           primeira vez num banco que já tem as 8 migrations aplicadas à
 *           mão (local e Render, hoje) sem estourar os erros de constraint
 *           duplicada acima.
 *        c) sem registro e sem o efeito no schema? -> executa de verdade
 *           (`node scripts/<arquivo>.js`, processo filho isolado — mesma
 *           forma que sempre rodamos manualmente, cada uma com sua própria
 *           conexão/transação), confirma o efeito esperado no schema depois,
 *           e só então registra.
 *   3) Qualquer migration que falhe (código de saída != 0, ou o schema não
 *      mostrar o efeito esperado depois) interrompe TUDO na hora — nenhuma
 *      migration seguinte roda, e nada é registrado como aplicado.
 *
 * Local e Render usam exatamente este mesmo arquivo e a mesma lista — a
 * única coisa que muda é para qual banco as variáveis DB_* do ambiente
 * apontam (src/config/database.js, igual a todo o resto do projeto). Nunca
 * copia dado nenhum entre ambientes; só aplica a mesma migration nos dois.
 *
 * Uso: node scripts/migrate.js   (ou: npm run migrate)
 */
const path = require("path");
const { spawn } = require("child_process");
// ETAPA 3C-13 — o orquestrador precisa criar/ler `migration_history`, o
// que exige privilégio de CREATE no schema — `app_runtime` (a partir desta
// etapa, o papel usado por src/config/database.js) deliberadamente NÃO tem
// esse privilégio. databaseAdmin.js conecta com a mesma credencial de
// sempre (`postgres`, DB_USER/DB_PASSWORD, inalterada) — só o nome do
// módulo muda, para deixar explícito que este arquivo é uma ferramenta de
// administração, nunca o caminho usado pelo processo HTTP da aplicação.
const pool = require("../src/config/databaseAdmin");

async function colunaExiste(tabela, coluna) {
    const resultado = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [tabela, coluna]
    );
    return resultado.rows.length > 0;
}

async function tabelaExiste(tabela) {
    const resultado = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [tabela]
    );
    return resultado.rows.length > 0;
}

// Usado por migrations que só aplicam um DEFAULT (nunca mudam
// nullable/NOT NULL) — checa se a coluna já tem qualquer valor padrão
// definido, não importa qual.
async function colunaTemDefault(tabela, coluna) {
    const resultado = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 AND column_default IS NOT NULL`,
        [tabela, coluna]
    );
    return resultado.rows.length > 0;
}

// Diferente de colunaExiste: aqui importa que a coluna não só exista, mas
// já esteja endurecida (NOT NULL) — usado por migrations com fase A
// (nullable) e fase B (NOT NULL) na mesma transação, onde só o estado
// final da fase B conta como "aplicada" de verdade.
async function colunaNotNull(tabela, coluna) {
    const resultado = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 AND is_nullable = 'NO'`,
        [tabela, coluna]
    );
    return resultado.rows.length > 0;
}

// ETAPA 3C-13 (RLS) — três checagens novas de reconciliação.
async function roleExiste(nomeRole) {
    const resultado = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [nomeRole]);
    return resultado.rows.length > 0;
}

async function roleTemPrivilegioNaTabela(nomeRole, tabela, privilegio) {
    const resultado = await pool.query("SELECT has_table_privilege($1, $2, $3) AS tem", [nomeRole, tabela, privilegio]);
    return resultado.rows[0].tem === true;
}

async function politicaExiste(tabela, nomePolitica) {
    const resultado = await pool.query(
        "SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2",
        [tabela, nomePolitica]
    );
    return resultado.rows.length > 0;
}

// Ordem real de dependência (ver seção 6 do docs/PROJETO-MOVEMENT-BENEFICIOS.md)
// — não é a ordem alfabética dos arquivos. `jaAplicada` é o único jeito do
// orquestrador saber, na primeira vez que vê uma migration sem registro, se
// o efeito dela já existe no banco (reconciliação) ou se precisa executar
// de verdade. Cada checagem olha só a MUDANÇA PRINCIPAL daquela migration —
// não precisa reproduzir o schema inteiro, só o suficiente pra decidir.
//
// `usaPoolRuntime: true` — marca as migrations que fazem
// `require("../src/config/database")` (a partir desta etapa, esse pool
// conecta como `APP_RUNTIME_DB_USER`, não mais como `postgres`/`DB_USER`).
// Existe só para resolverEnvDaMigration() (abaixo) saber quais migrations
// precisam de tratamento especial ENQUANTO `app_runtime` ainda não existe —
// nunca para nenhuma outra decisão. As migrations 16+ (todas
// `databaseAdmin.js`) nunca levam essa marca.
const MIGRATIONS = [
    {
        nome: "migrate-empresas.js",
        jaAplicada: () => tabelaExiste("empresas")
    },
    {
        nome: "migrate-movimentacoes-origem.js",
        jaAplicada: () => colunaExiste("movimentacoes_pontos", "origem")
    },
    {
        nome: "migrate-recompensas-imagem.js",
        jaAplicada: () => colunaExiste("recompensas", "imagem")
    },
    {
        nome: "migrate-resgates-fluxo-imediato.js",
        jaAplicada: () => colunaExiste("resgates", "codigo")
    },
    {
        nome: "migrate-usuarios-qr-token.js",
        jaAplicada: () => colunaExiste("usuarios", "qr_token")
    },
    {
        nome: "migrate-recompensas-destaque.js",
        jaAplicada: () => colunaExiste("recompensas", "destacada")
    },
    {
        nome: "migrate-recompensas-favoritas.js",
        jaAplicada: () => tabelaExiste("recompensas_favoritas")
    },
    {
        nome: "migrate-usuarios-cpf.js",
        jaAplicada: () => colunaExiste("usuarios", "cpf")
    },
    {
        nome: "migrate-engajamento-historico.js",
        jaAplicada: () => tabelaExiste("notificacoes_historico")
    },
    {
        nome: "migrate-password-reset-tokens.js",
        jaAplicada: () => tabelaExiste("password_reset_tokens"),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-tenants.js",
        jaAplicada: () => tabelaExiste("tenants"),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-admins-plataforma.js",
        jaAplicada: () => tabelaExiste("admins_plataforma"),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-tenant-id-dominio.js",
        // Checa o estado FINAL (fase B — NOT NULL), não só a existência da
        // coluna — uma tabela representativa basta porque a migration
        // inteira roda numa única transação (ou todas as 8 tabelas chegam
        // a NOT NULL juntas, ou nenhuma chega, por causa do ROLLBACK).
        jaAplicada: () => colunaNotNull("usuarios", "tenant_id"),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-tenant-id-default-temporario.js",
        // Correção de compatibilidade (ver comentário no próprio arquivo) —
        // TEMPORÁRIA enquanto os controllers não informam tenant_id. Uma
        // tabela representativa basta pelo mesmo motivo (transação única).
        jaAplicada: () => colunaTemDefault("usuarios", "tenant_id"),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-tenant-id-remover-default.js",
        // Etapa 3C-12 — auditoria confirmou que todo INSERT real já informa
        // tenant_id explicitamente; o DEFAULT temporário acima deixou de
        // ser necessário. "Aplicada" = a coluna NÃO tem mais DEFAULT
        // nenhum (oposto exato da migration anterior). Uma tabela
        // representativa basta pelo mesmo motivo (transação única).
        jaAplicada: async () => !(await colunaTemDefault("usuarios", "tenant_id")),
        usaPoolRuntime: true
    },
    {
        nome: "migrate-rls-role.js",
        // Etapa 3C-13 — cria o papel `app_runtime` (NOSUPERUSER,
        // NOBYPASSRLS), sem o qual nenhuma política RLS criada mais abaixo
        // teria efeito nenhum sobre a aplicação (superusuário/dono de
        // tabela sempre ignora RLS). "Aplicada" = o papel existe.
        jaAplicada: () => roleExiste("app_runtime")
    },
    {
        nome: "migrate-rls-grants.js",
        // Concede a app_runtime só os privilégios de tabela/sequence
        // estritamente necessários (nunca CREATE/ALTER/DROP/TRUNCATE). Uma
        // tabela representativa (usuarios, SELECT) basta — a migration
        // sempre concede todas de uma vez, numa única transação.
        jaAplicada: () => roleTemPrivilegioNaTabela("app_runtime", "usuarios", "SELECT")
    },
    {
        nome: "migrate-rls-dominio.js",
        // Habilita RLS + política 'tenant_isolation' nas 7 tabelas
        // tenant-aware (nunca em password_reset_tokens, fora do escopo
        // desta etapa — ver relatório da 3C-13). Uma tabela representativa
        // basta pelo mesmo motivo de sempre (transação única, todas as 7
        // ficam prontas juntas ou nenhuma fica).
        jaAplicada: () => politicaExiste("usuarios", "tenant_isolation")
    },
    {
        nome: "migrate-rls-tenants.js",
        // Política especial de 'tenants' (SELECT aberto, mutação só em
        // bypass) — nunca a política tenant-based padrão, que criaria um
        // ciclo com a resolução de tenant por slug (ver relatório da
        // 3C-13).
        jaAplicada: () => politicaExiste("tenants", "tenants_mutacao_bypass")
    },
    {
        nome: "migrate-rls-admins-plataforma.js",
        // Política especial de 'admins_plataforma' (bypass-only, inclusive
        // SELECT) — tabela sensível, sem tenant_id, sem exceção de leitura
        // aberta como em 'tenants'.
        jaAplicada: () => politicaExiste("admins_plataforma", "admins_plataforma_bypass_only")
    },
    {
        nome: "migrate-planos-funcionalidades.js",
        // Base de planos comerciais + funcionalidades por tenant (catálogo
        // 'funcionalidades'/'planos'/'plano_funcionalidades' +
        // 'tenant_funcionalidades_override' + coluna
        // 'tenants.limite_empresas_override'). Uma tabela representativa
        // basta pelo mesmo motivo de sempre (transação única, tudo aplicado
        // junto ou nada).
        jaAplicada: () => tabelaExiste("planos")
    },
    {
        nome: "migrate-tenant-identidade.js",
        // Colunas de identidade (logo_url/cor_primaria/telefone/whatsapp)
        // em 'tenants' + RLS de UPDATE passando a aceitar também o próprio
        // tenant (não só bypass). Uma coluna representativa basta pelo
        // mesmo motivo de sempre (transação única).
        jaAplicada: () => colunaExiste("tenants", "cor_primaria")
    }
];

async function garantirTabelaHistorico() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL UNIQUE,
            executado_em TIMESTAMP NOT NULL DEFAULT now()
        )
    `);
}

async function jaRegistrada(nome) {
    const resultado = await pool.query("SELECT 1 FROM migration_history WHERE nome = $1", [nome]);
    return resultado.rows.length > 0;
}

async function registrar(nome) {
    await pool.query("INSERT INTO migration_history (nome) VALUES ($1)", [nome]);
}

// BOOTSTRAP de `app_runtime` para start command único (Render Free, sem
// Pre-Deploy Command: `npm run migrate && node server.js`) — ver relatório
// da etapa "adaptar migration para Render Free".
//
// PROBLEMA: migrations 10–15 (usaPoolRuntime: true) conectam via
// `database.js`, ou seja, como `APP_RUNTIME_DB_USER`. Num banco novo,
// `app_runtime` ainda não existe (só nasce na migration 16, mais abaixo
// nesta mesma lista) — sem tratamento especial, a 10 falharia por
// autenticação (role inexistente) e `node server.js` nunca chegaria a
// rodar, travando o deploy inteiro.
//
// SOLUÇÃO: só para o `env` do PROCESSO FILHO de uma migration marcada
// `usaPoolRuntime`, e só enquanto `roleExiste("app_runtime")` for falso,
// empresta `DB_USER`/`DB_PASSWORD` (a mesma credencial que databaseAdmin.js
// já usa — nunca um valor novo) no lugar de `APP_RUNTIME_DB_USER`/
// `APP_RUNTIME_DB_PASSWORD`. Isso é suficiente porque essas 6 migrations só
// fazem CREATE TABLE/ALTER TABLE em tabelas que `DB_USER` já é dono (ou cujo
// schema ele já pode criar) — nunca precisam de `app_runtime` de verdade
// para nada.
//
// `process.env` do processo PAI nunca é alterado (`{ ...process.env, ... }`
// cria um objeto novo, só para este `spawn`) — nenhuma outra migration,
// nem o restante deste próprio processo, enxerga a substituição. Nada é
// gravado em disco nem logado: a troca vive só neste objeto, em memória,
// pelo tempo de vida de um único processo filho.
//
// A partir da migration 16 (`migrate-rls-role.js`, sem `usaPoolRuntime`),
// `resolverEnvDaMigration` devolve `process.env` sem nenhuma alteração —
// essa migration precisa ler o `APP_RUNTIME_DB_PASSWORD` REAL (a senha
// definitiva já configurada no ambiente), nunca a credencial emprestada,
// porque é o valor que vai virar a senha de verdade do papel.
//
// Em qualquer boot onde `app_runtime` já existir (todo boot depois do
// primeiro bem-sucedido) ou para qualquer migration sem a marca, esta
// função é um passthrough puro — comportamento local e o de qualquer banco
// já bootstrapado continuam idênticos a antes desta mudança.
async function resolverEnvDaMigration(migration) {
    if (!migration.usaPoolRuntime) {
        return process.env;
    }

    const appRuntimeExiste = await roleExiste("app_runtime");

    if (appRuntimeExiste) {
        return process.env;
    }

    console.log(`   ('${migration.nome}' rodando com credencial de bootstrap — 'app_runtime' ainda não existe)`);

    return {
        ...process.env,
        APP_RUNTIME_DB_USER: process.env.DB_USER,
        APP_RUNTIME_DB_PASSWORD: process.env.DB_PASSWORD
    };
}

// Roda a migration como processo filho. Fora do bootstrap acima, sempre
// herda as mesmas variáveis de ambiente do processo pai (é assim que a
// mesma lista funciona local e no Render — nunca há lógica de "qual banco"
// aqui, só o env que já decide isso em src/config/database.js). stdio
// "inherit" deixa o log de cada migration aparecer em tempo real, igual a
// rodar manualmente.
function executarComoProcesso(nomeArquivo, env) {
    return new Promise((resolve, reject) => {
        const caminho = path.join(__dirname, nomeArquivo);
        const processo = spawn(process.execPath, [caminho], { stdio: "inherit", env });

        processo.on("error", reject);
        processo.on("exit", function (codigo) {
            if (codigo === 0) {
                resolve();
            } else {
                reject(new Error(`processo terminou com código de saída ${codigo}`));
            }
        });
    });
}

async function executarTudo() {
    await garantirTabelaHistorico();

    for (const migration of MIGRATIONS) {
        if (await jaRegistrada(migration.nome)) {
            console.log(`[já aplicada] ${migration.nome}`);
            continue;
        }

        if (await migration.jaAplicada()) {
            console.log(`[reconciliação] ${migration.nome} — schema já reflete esta migration (aplicada manualmente antes deste sistema existir); registrando sem executar de novo.`);
            await registrar(migration.nome);
            continue;
        }

        console.log(`[executando] ${migration.nome}...`);

        try {
            const env = await resolverEnvDaMigration(migration);
            await executarComoProcesso(migration.nome, env);
        } catch (erro) {
            console.error(`\nERRO: ${migration.nome} falhou (${erro.message}).`);
            console.error("Interrompido — nenhuma migration seguinte foi executada, e esta não foi registrada como aplicada.");
            process.exitCode = 1;
            return;
        }

        if (!(await migration.jaAplicada())) {
            console.error(`\nERRO: ${migration.nome} terminou sem erro, mas o schema esperado não foi encontrado depois.`);
            console.error("Interrompido — esta migration NÃO foi registrada como aplicada. Investigue antes de rodar de novo.");
            process.exitCode = 1;
            return;
        }

        await registrar(migration.nome);
        console.log(`[ok] ${migration.nome} aplicada e registrada em migration_history.`);
    }

    console.log("\nNenhuma migration pendente restante.");
}

executarTudo()
    .catch(function (erro) {
        console.error("\nErro inesperado no orquestrador:", erro.message);
        process.exitCode = 1;
    })
    .finally(function () {
        pool.end();
    });
