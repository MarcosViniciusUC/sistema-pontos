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
const pool = require("../src/config/database");

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

// Ordem real de dependência (ver seção 6 do docs/PROJETO-MOVEMENT-BENEFICIOS.md)
// — não é a ordem alfabética dos arquivos. `jaAplicada` é o único jeito do
// orquestrador saber, na primeira vez que vê uma migration sem registro, se
// o efeito dela já existe no banco (reconciliação) ou se precisa executar
// de verdade. Cada checagem olha só a MUDANÇA PRINCIPAL daquela migration —
// não precisa reproduzir o schema inteiro, só o suficiente pra decidir.
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

// Roda a migration como processo filho, herdando as mesmas variáveis de
// ambiente do processo pai (é assim que a mesma lista funciona local e no
// Render — nunca há lógica de "qual banco" aqui, só o env que já decide
// isso em src/config/database.js). stdio "inherit" deixa o log de cada
// migration aparecer em tempo real, igual a rodar manualmente.
function executarComoProcesso(nomeArquivo) {
    return new Promise((resolve, reject) => {
        const caminho = path.join(__dirname, nomeArquivo);
        const processo = spawn(process.execPath, [caminho], { stdio: "inherit", env: process.env });

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
            await executarComoProcesso(migration.nome);
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
