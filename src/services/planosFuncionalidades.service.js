/**
 * Fonte central de verdade para PLANOS COMERCIAIS + FUNCIONALIDADES por
 * tenant — ver scripts/migrate-planos-funcionalidades.js para o desenho
 * das tabelas. Nenhum controller consulta `planos`/`funcionalidades`/
 * `plano_funcionalidades`/`tenant_funcionalidades_override` diretamente —
 * todos passam por aqui, para nunca espalhar `if (plano === "...")` pelo
 * projeto.
 *
 * RESOLUÇÃO, em ordem:
 *   1) tenant "legado" (`tenant.plano IS NULL` — hoje, só o Movement,
 *      criado antes do sistema de planos existir; ver
 *      migrate-planos-funcionalidades.js): TODAS as funcionalidades
 *      ligadas, SEM limite de empresas. Estratégia de compatibilidade
 *      explícita — nunca inventamos um plano comercial para um tenant que
 *      nunca escolheu um.
 *   2) senão, o que o PLANO do tenant inclui por padrão
 *      (`plano_funcionalidades`/`planos.limite_empresas`).
 *   3) por cima de 1 ou 2, qualquer override específico do tenant
 *      (`tenant_funcionalidades_override`/`tenants.limite_empresas_override`)
 *      sempre vence — é o mecanismo de "a Maple Tech libera/revoga algo
 *      pontual para este tenant, sem mudar o plano comercial dele".
 */
const pool = require("../config/database");

// Só funcionalidades OPCIONAIS (que variam por plano) entram aqui — nunca a
// linha de base do produto (pontos, QR Code, recompensas, resgates,
// funcionários, histórico, recuperação de senha), disponível para qualquer
// tenant incondicionalmente, sem checagem nenhuma.
const FUNCIONALIDADES_CONHECIDAS = ["favoritos", "recompensas_destaque", "gamificacao_progresso"];

// Fail-safe para um `plano` que passou pela validação na criação do tenant
// mas não existe (mais) no catálogo `planos` (não deveria acontecer nunca,
// dado que planos não são removidos — só existe pela mesma disciplina de
// "nunca confiar cegamente" do resto do projeto): o mais restritivo
// possível, nunca o mais permissivo.
const LIMITE_EMPRESAS_PADRAO_PLANO_DESCONHECIDO = 1;

/**
 * `tenant` é o objeto já resolvido por tenantResolver.buscarTenantPorId()
 * (ver authMiddleware.js, que expõe o resultado como `req.tenant`) — só
 * precisa de `id`, `plano` e `limite_empresas_override`. De propósito não
 * aceita um `tenantId` cru sozinho, para nunca incentivar uma segunda
 * consulta a `tenants` só para isto (o middleware/controller chamador já
 * tem `req.tenant` disponível).
 *
 * Retorna sempre `{ funcionalidades: { <chave>: boolean, ... }, limiteEmpresas: number|null }`.
 * `limiteEmpresas: null` significa "sem limite" (só tenants legados, ou um
 * override explícito nesse sentido).
 */
async function resolverFuncionalidades(tenant) {
    const legado = tenant.plano === null || tenant.plano === undefined;

    const funcionalidades = {};
    let limiteEmpresas;

    if (legado) {
        for (const chave of FUNCIONALIDADES_CONHECIDAS) {
            funcionalidades[chave] = true;
        }
        limiteEmpresas = null;

    } else {
        const [planoResultado, concedidasResultado] = await Promise.all([
            pool.query("SELECT limite_empresas FROM planos WHERE codigo = $1", [tenant.plano]),
            pool.query("SELECT funcionalidade_chave FROM plano_funcionalidades WHERE plano_codigo = $1", [tenant.plano])
        ]);

        const concedidasPeloPlano = new Set(concedidasResultado.rows.map((linha) => linha.funcionalidade_chave));

        for (const chave of FUNCIONALIDADES_CONHECIDAS) {
            funcionalidades[chave] = concedidasPeloPlano.has(chave);
        }

        limiteEmpresas = planoResultado.rows[0]
            ? planoResultado.rows[0].limite_empresas
            : LIMITE_EMPRESAS_PADRAO_PLANO_DESCONHECIDO;
    }

    const overridesResultado = await pool.query(
        "SELECT funcionalidade_chave, habilitada FROM tenant_funcionalidades_override WHERE tenant_id = $1",
        [tenant.id]
    );

    for (const linha of overridesResultado.rows) {
        if (FUNCIONALIDADES_CONHECIDAS.includes(linha.funcionalidade_chave)) {
            funcionalidades[linha.funcionalidade_chave] = linha.habilitada;
        }
    }

    if (tenant.limite_empresas_override !== null && tenant.limite_empresas_override !== undefined) {
        limiteEmpresas = tenant.limite_empresas_override;
    }

    return { funcionalidades, limiteEmpresas };
}

async function tenantTemFuncionalidade(tenant, chave) {
    const resolvido = await resolverFuncionalidades(tenant);
    return Boolean(resolvido.funcionalidades[chave]);
}

/**
 * Catálogo completo de planos + o que cada um inclui — usado pelo
 * onboarding da plataforma (ver plataforma-onboarding.js) para RENDERIZAR
 * a comparação de planos a partir da fonte central de verdade, em vez de
 * duplicar manualmente "profissional tem favoritos, premium tem X, ..." no
 * frontend. Nunca usado para decidir o que um TENANT específico pode
 * fazer (isso continua sendo resolverFuncionalidades(tenant)) — isto é só
 * o catálogo em si, sem tenant nenhum envolvido.
 */
async function listarCatalogoDePlanos() {
    const [planosResultado, relacoesResultado] = await Promise.all([
        pool.query("SELECT codigo, nome, limite_empresas FROM planos ORDER BY limite_empresas ASC"),
        pool.query("SELECT plano_codigo, funcionalidade_chave FROM plano_funcionalidades")
    ]);

    const funcionalidadesPorPlano = {};
    for (const linha of relacoesResultado.rows) {
        if (!funcionalidadesPorPlano[linha.plano_codigo]) {
            funcionalidadesPorPlano[linha.plano_codigo] = [];
        }
        funcionalidadesPorPlano[linha.plano_codigo].push(linha.funcionalidade_chave);
    }

    return planosResultado.rows.map(function (plano) {
        return {
            codigo: plano.codigo,
            nome: plano.nome,
            limiteEmpresas: plano.limite_empresas,
            funcionalidades: funcionalidadesPorPlano[plano.codigo] || []
        };
    });
}

module.exports = {
    FUNCIONALIDADES_CONHECIDAS,
    resolverFuncionalidades,
    tenantTemFuncionalidade,
    listarCatalogoDePlanos
};
