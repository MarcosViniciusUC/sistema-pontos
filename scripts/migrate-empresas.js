/**
 * Migração: estrutura de EMPRESAS (estabelecimentos parceiros), separada
 * do conceito de "origem/motivo" que já existe em movimentacoes_pontos.
 *
 * O que muda:
 *   - nova tabela `empresas` (id, nome, slug UNIQUE, ativo, criado_em),
 *     semeada com Oficina e Academia.
 *   - `recompensas.empresa_id` — FK nullable pra empresas. Toda recompensa
 *     NOVA passa a exigir empresa (aplicado na validação da API, não aqui).
 *     Recompensas existentes são preenchidas quando dá pra inferir com
 *     segurança pelo nome ("mensalidade" -> Academia); as ambíguas ficam
 *     NULL de propósito — ver relatório no final da execução.
 *   - `movimentacoes_pontos.empresa_id` — FK nullable pra empresas,
 *     permanentemente nullable: movimentações antigas não têm como saber
 *     a empresa real, e não inventamos uma. Novas ENTRADAS passam a exigir
 *     empresa (aplicado na validação da API).
 *   - `resgates.empresa_id` — FK nullable pra empresas, preenchida por
 *     cópia do empresa_id da recompensa relacionada (snapshot). Se a
 *     recompensa não tem empresa definida, o resgate também fica NULL.
 *
 * IMPORTANTE: nenhuma coluna existente é alterada. Nenhuma linha é
 * apagada. `recompensas.empresa_id` e `resgates.empresa_id` NÃO recebem
 * NOT NULL nesta migração — ver relatório de registros pendentes no final.
 *
 * Uso: node scripts/migrate-empresas.js
 */
const pool = require("../src/config/database");

// Inferência segura por nome — só os casos inequívocos do pedido original.
// Qualquer recompensa que não bater aqui fica sem empresa (NULL) de
// propósito, para decisão manual do admin.
function inferirSlugEmpresa(nome) {
    const nomeNormalizado = nome.toLowerCase();

    if (nomeNormalizado.includes("mensalidade")) {
        return "academia";
    }

    return null;
}

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Criando tabela 'empresas'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS empresas (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                slug VARCHAR(50) NOT NULL UNIQUE,
                ativo BOOLEAN NOT NULL DEFAULT true,
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("2) Semeando Oficina e Academia (se ainda não existirem)...");
        await client.query(`
            INSERT INTO empresas (nome, slug)
            VALUES ('Oficina', 'oficina'), ('Academia', 'academia')
            ON CONFLICT (slug) DO NOTHING
        `);

        const empresasResultado = await client.query("SELECT id, nome, slug FROM empresas ORDER BY id");
        console.log("   Empresas cadastradas:", JSON.stringify(empresasResultado.rows));
        const idPorSlug = {};
        empresasResultado.rows.forEach(function (linha) {
            idPorSlug[linha.slug] = linha.id;
        });

        console.log("3) Adicionando 'empresa_id' em recompensas (nullable)...");
        await client.query("ALTER TABLE recompensas ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)");

        console.log("4) Inferindo empresa das recompensas existentes onde for seguro...");
        const recompensasExistentes = await client.query(
            "SELECT id, nome FROM recompensas WHERE empresa_id IS NULL"
        );

        const recompensasPendentes = [];

        for (const recompensa of recompensasExistentes.rows) {
            const slug = inferirSlugEmpresa(recompensa.nome);

            if (slug && idPorSlug[slug]) {
                await client.query("UPDATE recompensas SET empresa_id = $1 WHERE id = $2", [idPorSlug[slug], recompensa.id]);
                console.log(`   - recompensa #${recompensa.id} ("${recompensa.nome}") -> ${slug}`);
            } else {
                recompensasPendentes.push(recompensa);
                console.log(`   - recompensa #${recompensa.id} ("${recompensa.nome}") -> AMBÍGUA, mantida sem empresa (NULL)`);
            }
        }

        console.log("5) Adicionando 'empresa_id' em movimentacoes_pontos (nullable, permanente)...");
        await client.query("ALTER TABLE movimentacoes_pontos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)");
        console.log("   Movimentações existentes ficam com empresa_id = NULL (não há como inferir com segurança).");

        console.log("6) Adicionando 'empresa_id' em resgates (nullable) e copiando da recompensa relacionada...");
        await client.query("ALTER TABLE resgates ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)");
        const resgatesAtualizados = await client.query(`
            UPDATE resgates r
            SET empresa_id = rec.empresa_id
            FROM recompensas rec
            WHERE rec.id = r.recompensa_id
            RETURNING r.id, r.empresa_id
        `);
        console.log("   Resgates atualizados (snapshot da empresa da recompensa):", JSON.stringify(resgatesAtualizados.rows));

        await client.query("COMMIT");

        console.log("\nMigração concluída com sucesso.");

        if (recompensasPendentes.length > 0) {
            console.log("\n=== ATENÇÃO: recompensas sem empresa definida (decisão manual necessária) ===");
            recompensasPendentes.forEach(function (r) {
                console.log(`   - #${r.id}: "${r.nome}"`);
            });
            console.log("Nenhum NOT NULL foi aplicado em recompensas.empresa_id por causa disso.");
            console.log("O admin deve editar essas recompensas pela tela (agora com o campo Empresa) para resolver.");
        }

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
