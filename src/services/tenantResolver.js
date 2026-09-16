/**
 * Resolução de tenant — ETAPA 3A da fundação multi-tenant.
 *
 * Responsabilidade ÚNICA: dado um `req`, descobrir a qual tenant esta
 * requisição pertence, sempre validando contra o banco real — nunca
 * confiando no valor recebido além de usá-lo como filtro de busca. O
 * retorno reflete sempre a linha REAL da tabela `tenants`, nunca o texto
 * de entrada.
 *
 * SEGURANÇA — isto NUNCA concede autorização, só identifica contexto.
 * Quem autoriza continua sendo authMiddleware/roleMiddleware (e,
 * futuramente, o `tenant_id` já validado dentro do JWT). Um slug
 * arbitrário nunca "vira" um tenant válido por si só — se não bate com
 * nenhuma linha em `tenants`, o resultado é sempre NAO_ENCONTRADO,
 * mesmo que o texto pareça plausível.
 *
 * ETAPA 3 (subdomínio) — o tenant agora é identificado, em ordem de
 * prioridade: (1) hostname da requisição (ex: `academia-x.mapletech.com.br`
 * -> slug `academia-x`), (2) header `X-Tenant-Slug`, (3) query param
 * `?tenantSlug=`. Header e query continuam existindo de propósito — são o
 * fallback de desenvolvimento/compatibilidade enquanto nenhum domínio real
 * está configurado (`?tenantSlug=` é como o frontend/testes continuam
 * funcionando em `localhost:3000` puro, sem subdomínio nenhum).
 *
 * ETAPA de fortalecimento para produção — o que acontece quando NENHUM dos
 * três (hostname/header/query) identifica nada passou a depender do
 * ambiente (ver `fallbackParaMovementHabilitado` abaixo):
 *   - DESENVOLVIMENTO (NODE_ENV=development, o valor usado em todo o resto
 *     do projeto para esta mesma distinção — ver loginLimiter em
 *     auth.routes.js): cai no fallback fixo 'movement', exatamente como
 *     sempre — preserva `localhost:3000` puro funcionando sem nenhum
 *     parâmetro extra.
 *   - PRODUÇÃO (qualquer outro valor de NODE_ENV, allow-list nunca
 *     deny-list, mesmo princípio de auth.routes.js): NUNCA cai em
 *     Movement silenciosamente — um hostname desconhecido (o domínio
 *     padrão do provedor, uma entrada de DNS errada, uma tentativa de
 *     acessar sem nenhum dos três mecanismos) devolve NAO_ENCONTRADO. Um
 *     hostname que JÁ identifica um slug candidato (ex:
 *     "errado.mapletech.com.br" -> slug "errado") sempre passou por
 *     NAO_ENCONTRADO se esse slug não existir — isso nunca dependeu do
 *     ambiente, e continua exatamente igual; a mudança aqui é só para o
 *     caso de NENHUM slug ser identificado.
 *
 * AVISO OPERACIONAL — sequenciamento do primeiro deploy: esta mudança só é
 * segura para o Movement se `movement.mapletech.com.br` (ou o mecanismo de
 * compatibilidade via header/query) já estiver resolvendo corretamente NO
 * MOMENTO em que este código for pra produção com NODE_ENV != development.
 * Fazer o deploy deste código em produção ANTES do DNS de
 * `*.mapletech.com.br` apontar pra esta aplicação bloquearia o acesso via
 * qualquer hostname atual do Movement (ex: o domínio padrão do provedor)
 * com "tenant não encontrado" — ver checklist no relatório desta etapa.
 *
 * CORREÇÃO — hostname padrão do Render sem domínio customizado ainda
 * (achado no primeiro teste real em produção): o aviso acima se confirmou —
 * `sistema-pontos-0i0k.onrender.com` (o único hostname público do serviço
 * hoje, antes de qualquer domínio `*.mapletech.com.br` apontar pra cá) não
 * é um subdomínio de nenhum `DOMINIOS_BASE_SUBDOMINIO`, então uma
 * requisição sem header/query (ex: a própria página de login, que só manda
 * `X-Tenant-Slug` quando a URL já tem `?tenantSlug=` — ver app.js) caía
 * direto no branch de produção "nenhum slug identificado" e devolvia 404,
 * mesmo para o Movement. `HOSTNAME_PADRAO_RENDER_ATUAL` (abaixo) é uma
 * EXCEÇÃO ESTRITA, por comparação de string EXATA (nunca sufixo/wildcard):
 * só esse UM hostname literal ganha um fallback pra 'movement', e só
 * quando hostname/header/query não identificaram nada — continua sempre
 * perdendo pra um `?tenantSlug=`/`X-Tenant-Slug` explícito (ex:
 * `?tenantSlug=outro-tenant` neste mesmo hostname resolve pra "outro-tenant"
 * normalmente, nunca é sobrescrito). Isto NUNCA vira um fallback genérico
 * de produção: qualquer OUTRO hostname desconhecido (um erro de DNS, um
 * domínio de preview, etc.) continua devolvendo NAO_ENCONTRADO exatamente
 * como antes. Remover esta constante (e o bloco que a usa, em
 * `resolverTenant`) assim que `movement.mapletech.com.br` (ou equivalente)
 * estiver de fato mapeado e resolvendo para esta aplicação — a partir daí
 * o hostname próprio do Movement volta a ser o único caminho, como o
 * desenho original desta etapa já previa.
 *
 * Esta etapa NÃO altera nenhuma query de negócio existente — nenhum
 * controller atual chama isto diretamente; tudo consome só o resultado já
 * resolvido (`req.tenantId`/`req.tenant`, ver resolverTenantMiddleware.js).
 */
const pool = require("../config/database");

const SLUG_FALLBACK = "movement";
const NODE_ENV_DESENVOLVIMENTO = "development";

// Ver "CORREÇÃO" no comentário do topo do arquivo. Comparação sempre EXATA
// contra `req.hostname` (nunca `.endsWith`/prefixo/sufixo) — propositalmente
// restrita a este único hostname literal.
const HOSTNAME_PADRAO_RENDER_ATUAL = "sistema-pontos-0i0k.onrender.com";

/**
 * Allow-list explícita (nunca deny-list) — mesmo princípio já usado em
 * auth.routes.js/plataforma.routes.js para os limites de rate limit: só
 * relaxa o comportamento (aqui, permitir o fallback pra Movement) quando o
 * ambiente é EXPLICITAMENTE "development". Qualquer outro valor de
 * NODE_ENV (incluindo vazio/indefinido, o caso mais comum de um provedor
 * que nunca configurou essa variável) é tratado como produção — o lado
 * mais seguro por padrão.
 */
function fallbackParaMovementHabilitado() {
    return process.env.NODE_ENV === NODE_ENV_DESENVOLVIMENTO;
}

// Domínios-base sob os quais um subdomínio identifica um tenant (ex:
// "academia-x.mapletech.com.br" ou, em teste local, "academia-x.localhost").
// "localhost" cobre o teste local sem precisar de DNS/hosts real — todo
// navegador/SO moderno já resolve qualquer "*.localhost" para o loopback
// (RFC 6761), então "http://academia-x.localhost:3000" funciona hoje sem
// nenhuma configuração adicional. "mapletech.local" fica disponível para
// quem preferir configurar isso via hosts file local. Nenhum DNS real nem
// domínio comprado é exigido nesta etapa — isto só entra em ação quando um
// desses domínios de fato aparecer no Host da requisição; fora deles
// (ex: o domínio atual do Render), o comportamento de hoje continua
// idêntico (cai em header/query/fallback, exatamente como antes).
const DOMINIOS_BASE_SUBDOMINIO = ["mapletech.com.br", "mapletech.local", "localhost"];

/**
 * Extrai o slug a partir do hostname da requisição, se ele for um
 * subdomínio de um dos DOMINIOS_BASE_SUBDOMINIO. Só o PRIMEIRO rótulo do
 * hostname vira slug (ex: "academia-x" de "academia-x.mapletech.com.br");
 * um hostname com mais de um nível de subdomínio (ex:
 * "www.academia-x.mapletech.com.br") não é tratado como um slug válido
 * (haveria ambiguidade sobre qual rótulo é o tenant) — retorna `null` e a
 * resolução cai para header/query/fallback, nunca lança erro. O próprio
 * domínio base sem nenhum subdomínio (ex: "mapletech.com.br" ou
 * "localhost") também retorna `null` pelo mesmo motivo (não há tenant
 * nenhum identificado por aí).
 */
function obterSlugDoHostname(req) {
    const hostname = req.hostname;

    if (typeof hostname !== "string" || hostname.length === 0) {
        return null;
    }

    const hostnameNormalizado = hostname.toLowerCase();

    for (const dominioBase of DOMINIOS_BASE_SUBDOMINIO) {
        const sufixo = "." + dominioBase;

        if (hostnameNormalizado.length > sufixo.length && hostnameNormalizado.endsWith(sufixo)) {
            const subdominio = hostnameNormalizado.slice(0, -sufixo.length);
            return subdominio.length > 0 && !subdominio.includes(".") ? subdominio : null;
        }
    }

    return null;
}

/**
 * Extrai o slug da requisição, nesta ordem: (1) hostname — ver
 * `obterSlugDoHostname`; (2) header `X-Tenant-Slug`; (3) query param
 * `?tenantSlug=`. Header e query só são considerados quando o hostname não
 * identificou nenhum tenant — mantidos como fallback de
 * desenvolvimento/compatibilidade (ver comentário no topo do arquivo).
 * Nunca lê de `req.body` — o corpo da requisição é dos controllers de
 * negócio, não desta camada.
 */
function obterSlugDaRequisicao(req) {
    const doHostname = obterSlugDoHostname(req);

    if (doHostname) {
        return doHostname;
    }

    const doHeader = req.headers && req.headers["x-tenant-slug"];

    if (typeof doHeader === "string" && doHeader.trim().length > 0) {
        return doHeader.trim();
    }

    const doQuery = req.query && req.query.tenantSlug;

    if (typeof doQuery === "string" && doQuery.trim().length > 0) {
        return doQuery.trim();
    }

    return null;
}

/**
 * Resolve o tenant da requisição contra o banco real.
 *
 * Retorna sempre um dos dois formatos:
 *   { tenant: { id, nome, slug, status } }  — encontrado (qualquer status;
 *                                              esta função NÃO julga se o
 *                                              tenant está ativo — ver
 *                                              exigirTenantAtivoMiddleware.js,
 *                                              responsabilidade separada
 *                                              de propósito)
 *   { erro: "NAO_ENCONTRADO" }              — nenhum tenant com esse slug
 *
 * Nunca lança para um slug inválido — devolve o resultado estruturado
 * acima; quem decide a resposta HTTP é o middleware, não esta função (ela
 * é reutilizável fora de um contexto Express também, se precisar).
 */
async function resolverTenant(req) {
    const slugSolicitado = obterSlugDaRequisicao(req);

    if (!slugSolicitado && !fallbackParaMovementHabilitado()) {
        // Produção, nenhum dos três mecanismos identificou um tenant. Antes
        // de desistir (NAO_ENCONTRADO), uma única exceção estrita: o
        // hostname padrão atual do serviço no Render, por comparação EXATA
        // — ver "CORREÇÃO" no comentário do topo do arquivo. Um
        // `?tenantSlug=`/`X-Tenant-Slug` explícito já teria sido capturado
        // por `obterSlugDaRequisicao` acima e nunca chega aqui — esta
        // exceção só cobre a ausência total dos três mecanismos.
        const hostnameAtual = typeof req.hostname === "string" ? req.hostname.toLowerCase() : "";

        if (hostnameAtual !== HOSTNAME_PADRAO_RENDER_ATUAL) {
            return { erro: "NAO_ENCONTRADO" };
        }
    }

    const slugParaBuscar = slugSolicitado || SLUG_FALLBACK;

    // Inclui as colunas de identidade (etapa de identidade/configuração do
    // tenant) — todas dado público de branding, mesmo raciocínio de
    // nome/slug (ver GET /tenant/config em tenant.routes.js).
    const resultado = await pool.query(
        "SELECT id, nome, slug, status, logo_url, cor_primaria, telefone, whatsapp FROM tenants WHERE slug = $1",
        [slugParaBuscar]
    );

    if (resultado.rows.length === 0) {
        return { erro: "NAO_ENCONTRADO" };
    }

    return { tenant: resultado.rows[0] };
}

/**
 * Busca um tenant pelo `id` — usado pela ETAPA 3B por authMiddleware.js
 * para revalidar, a cada requisição autenticada, que o `tenant_id` já
 * confiado dentro de um JWT assinado ainda corresponde a um tenant real e
 * ativo (o JWT prova só que fomos nós que assinamos aquele tenant_id no
 * momento do login, nunca que ele continua válido AGORA — um tenant pode
 * ser desativado depois de tokens já emitidos, que continuam válidos por
 * até 1h por causa do expiresIn).
 *
 * Diferente de resolverTenant() (que busca por slug, vindo de fora, nunca
 * confiável sozinho): aqui o `tenantId` já veio de dentro de um JWT
 * validado — ele só precisa ser confirmado contra o banco, não
 * "descoberto". Retorna `null` se o id não existir (nunca lança).
 *
 * Inclui `plano` e `limite_empresas_override` (etapa de planos/
 * funcionalidades) e as colunas de identidade (logo_url/cor_primaria/
 * telefone/whatsapp) — authMiddleware.js já expõe o resultado inteiro como
 * `req.tenant`, então isto dá a src/services/planosFuncionalidades.service.js
 * tudo que precisa sem nenhuma consulta extra por requisição. `logo_url`
 * continua aqui só por leitura (Movement ainda a usa) — não é mais
 * configurável por ninguém (ver PATCH /plataforma/tenants/:id em
 * plataforma.routes.js, que nem aceita essa chave).
 */
async function buscarTenantPorId(tenantId) {
    const resultado = await pool.query(
        "SELECT id, nome, slug, status, plano, limite_empresas_override, logo_url, cor_primaria, telefone, whatsapp FROM tenants WHERE id = $1",
        [tenantId]
    );

    return resultado.rows[0] || null;
}

module.exports = { resolverTenant, buscarTenantPorId, obterSlugDaRequisicao, obterSlugDoHostname, fallbackParaMovementHabilitado, SLUG_FALLBACK };
