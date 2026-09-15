const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { normalizarSlug } = require("../utils/empresas");
const { gerarQrTokenUsuario } = require("../utils/qrTokenUsuario");
const { resolverFuncionalidades } = require("../services/planosFuncionalidades.service");

const MAX_TENTATIVAS_QR_TOKEN = 5;

/**
 * Gestão de TENANTS — exclusiva da plataforma Maple Tech (ver
 * plataforma.routes.js: toda rota aqui exige authPlataformaMiddleware +
 * exigirEscopoPlataforma, nunca um JWT de tenant). Opera FORA do contexto
 * de qualquer tenant — nunca usa req.tenantId/req.usuario (esses são do
 * modelo de tenant, inexistentes numa requisição de plataforma).
 */

/**
 * Listagem administrativa básica — só as colunas que a plataforma precisa
 * para gerenciar tenants (nome, slug, plano, status, criado_em). Nunca
 * inclui dados de usuários/pontos/recompensas individuais: essa é
 * exatamente a linha que "gestão de tenants" não deve cruzar (ver
 * detalhar() abaixo para estatísticas agregadas, nunca dado individual).
 */
async function listar(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT id, nome, slug, plano, status, criado_em FROM tenants ORDER BY criado_em DESC"
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar tenants"
        });
    }
}

/**
 * Detalhe de UM tenant + estatísticas AGREGADAS (contagens, nunca listas de
 * usuários/recompensas/resgates individuais — isso exporia dado privado do
 * tenant para a plataforma sem necessidade). Cada contagem é uma consulta
 * simples e independente (5 consultas fixas, em paralelo) — nenhuma junta
 * dados entre si, então não há risco de fan-out nem de vazar uma linha que
 * não seja só o número.
 */
async function detalhar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const tenantResultado = await pool.query(
            "SELECT id, nome, slug, plano, status, criado_em, limite_empresas_override, logo_url, cor_primaria, telefone, whatsapp FROM tenants WHERE id = $1",
            [id]
        );

        if (tenantResultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Tenant não encontrado"
            });
        }

        const tenant = tenantResultado.rows[0];

        const [usuarios, empresas, recompensas, resgates, movimentacoes, configuracao] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM empresas WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM recompensas WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM resgates WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM movimentacoes_pontos WHERE tenant_id = $1", [id]),
            // Mesma fonte central de verdade do backend/frontend do tenant
            // (ver planosFuncionalidades.service.js) — a plataforma vê
            // exatamente o que o próprio tenant veria em
            // GET /tenant/funcionalidades, nunca uma segunda lógica paralela.
            resolverFuncionalidades(tenant)
        ]);

        res.json({
            tenant: {
                id: tenant.id, nome: tenant.nome, slug: tenant.slug, plano: tenant.plano, status: tenant.status, criado_em: tenant.criado_em,
                // Identidade — editável exclusivamente pela Maple Tech via
                // PATCH /plataforma/tenants/:id (ver atualizarConfiguracao
                // acima). `logoUrl` é só leitura em qualquer lugar: não é
                // mais configurável por ninguém nesta fase.
                logoUrl: tenant.logo_url, corPrimaria: tenant.cor_primaria, telefone: tenant.telefone, whatsapp: tenant.whatsapp
            },
            estatisticas: {
                usuarios: usuarios.rows[0].total,
                empresas: empresas.rows[0].total,
                recompensas: recompensas.rows[0].total,
                resgates: resgates.rows[0].total,
                movimentacoes_pontos: movimentacoes.rows[0].total
            },
            funcionalidades: configuracao.funcionalidades,
            limiteEmpresas: configuracao.limiteEmpresas
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar tenant"
        });
    }
}

/**
 * Cria um tenant NOVO — sempre VAZIO, de propósito: nenhuma linha de
 * usuarios/empresas/recompensas/resgates/movimentacoes_pontos/
 * recompensas_favoritas/notificacoes_historico é copiada da Movement nem
 * de nenhum outro tenant. O `INSERT` abaixo só grava a linha da própria
 * tabela `tenants` — não existe nenhum outro `INSERT` nesta função.
 *
 * `status` é sempre gravado explicitamente como 'ativo' (nunca deixado
 * para o DEFAULT da coluna) — "seguro e explícito" aqui significa não
 * depender de um valor implícito do schema, e sim decidir e escrever o
 * estado inicial aqui mesmo, poderendo ser revisto por
 * PATCH /plataforma/tenants/:id/status a qualquer momento.
 *
 * `plano` é só informação administrativa (ver validatePlataformaTenantCreate,
 * que já validou contra a lista fechada de valores conhecidos) — nunca
 * cria cobrança, nunca bloqueia nada.
 *
 * `tenant_id`/`id` nunca são lidos do body — o `id` é sempre gerado pelo
 * PostgreSQL (SERIAL).
 */
async function criar(req, res) {
    const { nome, slug, plano } = req.body;
    const slugNormalizado = normalizarSlug(slug);

    if (slugNormalizado.length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'slug' inválido — use letras, números e hífen"
        });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO tenants (nome, slug, plano, status)
             VALUES ($1, $2, $3, 'ativo')
             RETURNING id, nome, slug, plano, status, criado_em`,
            [nome.trim(), slugNormalizado, plano || null]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        if (erro.code === "23505") {
            return res.status(409).json({
                mensagem: "Este slug já está em uso"
            });
        }

        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao criar tenant"
        });
    }
}

/**
 * Ativa/desativa um tenant — única forma de mudar `status` depois da
 * criação (nunca por PUT/PATCH genérico em outro campo). `status` já
 * validado contra a lista fechada ('ativo'/'inativo', a mesma da CHECK
 * constraint do banco) por validatePlataformaTenantStatus antes de chegar
 * aqui.
 */
async function atualizarStatus(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { status } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE tenants
             SET status = $1
             WHERE id = $2
             RETURNING id, nome, slug, plano, status, criado_em`,
            [status, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Tenant não encontrado"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar status do tenant"
        });
    }
}

/**
 * PATCH /plataforma/tenants/:id — MUDANÇA DE ARQUITETURA: identidade
 * comercial do tenant (nome/cor/telefone/whatsapp/plano/status) passa a
 * ser administrada exclusivamente pela Maple Tech (antes: nome/cor/
 * telefone/whatsapp eram editáveis pelo próprio admin do tenant via
 * `PATCH /tenant/config`, removido nesta etapa — ver tenant.routes.js).
 *
 * `logoUrl` NUNCA aparece aqui de propósito — não é mais configurável por
 * ninguém nesta fase (ver validatePlataformaTenantEdit.js, que nem aceita
 * essa chave). `tenant_id`/`id` também nunca vêm do body — o tenant
 * afetado é sempre o `:id` da própria URL, mesmo padrão de
 * `atualizarStatus`/`criarAdmin` acima.
 *
 * `COALESCE` em cada campo — PATCH parcial: um campo omitido mantém o
 * valor atual. Roda como toda rota de plataforma (`pool.query` direto,
 * sem `client.connect()` manual) porque `authPlataformaMiddleware` já
 * ativou bypass de RLS pra esta requisição inteira (ver seu próprio
 * comentário) — sem isso, mesmo esta única tabela (`tenants`, com SELECT
 * público mas UPDATE restrito) rejeitaria a escrita.
 */
async function atualizarConfiguracao(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { nome, corPrimaria, telefone, whatsapp, plano, status } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE tenants
             SET nome = COALESCE($1, nome),
                 cor_primaria = COALESCE($2, cor_primaria),
                 telefone = COALESCE($3, telefone),
                 whatsapp = COALESCE($4, whatsapp),
                 plano = COALESCE($5, plano),
                 status = COALESCE($6, status)
             WHERE id = $7
             RETURNING id, nome, slug, plano, status, criado_em, logo_url, cor_primaria, telefone, whatsapp`,
            [nome ?? null, corPrimaria ?? null, telefone ?? null, whatsapp ?? null, plano ?? null, status ?? null, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensagem: "Tenant não encontrado" });
        }

        const tenant = resultado.rows[0];

        res.json({
            id: tenant.id,
            nome: tenant.nome,
            slug: tenant.slug,
            plano: tenant.plano,
            status: tenant.status,
            criado_em: tenant.criado_em,
            logoUrl: tenant.logo_url,
            corPrimaria: tenant.cor_primaria,
            telefone: tenant.telefone,
            whatsapp: tenant.whatsapp
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar tenant"
        });
    }
}

/**
 * INSERT do admin inicial, com retry de qr_token em SAVEPOINT — extraído de
 * criarAdmin() para ser reaproveitado também por onboarding() abaixo, sem
 * duplicar a lógica (só este INSERT tem complexidade real o suficiente pra
 * valer a pena extrair; o resto de cada função é específico o bastante pra
 * não compensar uma abstração maior).
 *
 * `client` já deve estar dentro de uma transação com bypass RLS ativo (ver
 * chamadores). Lança um erro com `.tipoErro` ('EMAIL_DUPLICADO' |
 * 'CPF_DUPLICADO' | 'SEM_QR_TOKEN') nos casos esperados, para o chamador
 * decidir a resposta HTTP e o ROLLBACK — nunca faz ROLLBACK/COMMIT sozinha,
 * isso continua sendo responsabilidade de quem gerencia a transação.
 */
async function inserirAdminInicial(client, tenantId, dadosAdmin) {
    const { nome, email, senha, telefone, cpf } = dadosAdmin;
    const senhaHash = await bcrypt.hash(senha, 10);

    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_QR_TOKEN; tentativa++) {
        const qrToken = gerarQrTokenUsuario();

        await client.query("SAVEPOINT tentativa_qr_token");

        try {
            const resultado = await client.query(
                `INSERT INTO usuarios (nome, email, senha, telefone, tipo, qr_token, cpf, tenant_id)
                 VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7)
                 RETURNING id, nome, email, telefone, tipo, criado_em`,
                [nome, email, senhaHash, telefone ?? null, qrToken, cpf, tenantId]
            );

            await client.query("RELEASE SAVEPOINT tentativa_qr_token");
            return resultado.rows[0];

        } catch (erroInsercao) {
            await client.query("ROLLBACK TO SAVEPOINT tentativa_qr_token");

            if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_email_key") {
                const erro = new Error("Este email já está cadastrado neste tenant");
                erro.tipoErro = "EMAIL_DUPLICADO";
                throw erro;
            }

            if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_cpf_key") {
                const erro = new Error("Este CPF já está cadastrado neste tenant");
                erro.tipoErro = "CPF_DUPLICADO";
                throw erro;
            }

            const foiColisaoDeQrToken = erroInsercao.code === "23505"
                && erroInsercao.constraint === "usuarios_qr_token_key";

            if (!foiColisaoDeQrToken) {
                throw erroInsercao;
            }
            // colisão de qr_token (extremamente improvável): tenta de novo
            // com um token novo, sem perder o restante da transação.
        }
    }

    const erroSemQrToken = new Error("Não foi possível gerar um identificador único para o admin. Tente novamente.");
    erroSemQrToken.tipoErro = "SEM_QR_TOKEN";
    throw erroSemQrToken;
}

/**
 * Cria o PRIMEIRO admin de um tenant — mesmo padrão de
 * user.controller.js:cadastrar() (bcrypt 10 rounds, qr_token gerado com
 * retry em SAVEPOINT em caso de colisão improvável — ver
 * inserirAdminInicial acima), com duas diferenças deliberadas:
 *   - `tipo` é sempre 'admin' (nunca lido do body — só a plataforma decide
 *     que esta é a conta administrativa inicial);
 *   - `tenant_id` vem SEMPRE de `req.params.id` (a URL), nunca do body —
 *     a plataforma escolhe em qual tenant o admin é criado ao escolher a
 *     URL que chama, nunca por um campo que o requisitante pudesse
 *     manipular.
 *
 * Exige CPF real (mesma regra do cadastro público de cliente — nunca
 * inventado) porque quem preenche este formulário é a própria Maple Tech
 * dando onboarding a um cliente real, com os dados reais dele em mãos.
 */
async function criarAdmin(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { nome, email, senha, telefone, cpf } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config. Esta
        // rota já roda inteiramente atrás de authPlataformaMiddleware +
        // exigirEscopoPlataforma (ver plataforma.routes.js) — bypass aqui é
        // herdado dessa autenticação já validada, nunca de dado de request.
        // Necessário porque o admin criado pertence a um tenant escolhido
        // pela plataforma (req.params.id), não ao "tenant da sessão" (que
        // nem existe aqui — quem está autenticado é a plataforma, não um
        // tenant).
        await client.query("SELECT set_config('app.bypass_tenant_rls', 'on', true)");

        const tenantResultado = await client.query(
            "SELECT id FROM tenants WHERE id = $1",
            [id]
        );

        if (tenantResultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                mensagem: "Tenant não encontrado"
            });
        }

        const usuarioCriado = await inserirAdminInicial(client, id, { nome, email, senha, telefone, cpf });

        await client.query("COMMIT");
        res.status(201).json(usuarioCriado);

    } catch (erro) {
        await client.query("ROLLBACK");

        if (erro.tipoErro === "EMAIL_DUPLICADO" || erro.tipoErro === "CPF_DUPLICADO") {
            return res.status(409).json({ mensagem: erro.message });
        }

        if (erro.tipoErro === "SEM_QR_TOKEN") {
            return res.status(500).json({ mensagem: erro.message });
        }

        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao criar administrador do tenant"
        });

    } finally {
        client.release();
    }
}

/**
 * ONBOARDING — cria tenant + administrador inicial + empresa/unidade
 * inicial numa ÚNICA transação (BEGIN...COMMIT), exatamente como pedido:
 * nunca pode existir um tenant "pela metade" (criado, mas sem admin ou sem
 * empresa) — qualquer falha em qualquer uma das três etapas desfaz TUDO
 * (ROLLBACK), inclusive o próprio tenant recém-criado.
 *
 * Reaproveita: `inserirAdminInicial` (mesmo INSERT de criarAdmin, acima) e
 * o mesmo formato de INSERT de empresas usado por
 * empresa.controller.js:criar (nome/slug/tenant_id, sem nenhum outro
 * campo). `req.body` já chega normalizado por validateOnboarding.js
 * (slugs normalizados, cpf normalizado, plano já validado contra o
 * catálogo real) — este controller nunca repete essa validação.
 *
 * NÃO copia nenhum dado do Movement nem de nenhum outro tenant: os três
 * INSERTs abaixo são as ÚNICAS gravações desta função, todas com valores
 * vindos exclusivamente do `req.body` desta própria requisição.
 *
 * Limite de empresas do plano: nunca checado aqui de propósito — é sempre
 * a PRIMEIRA empresa de um tenant recém-criado (zero empresas existentes
 * antes deste INSERT), e todo plano do catálogo permite pelo menos 1 (ver
 * migrate-planos-funcionalidades.js) — não há como esta única inserção
 * violar o limite de nenhum plano válido.
 */
async function onboarding(req, res) {
    const { tenant: dadosTenant, admin: dadosAdmin, empresa: dadosEmpresa } = req.body;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Mesmo motivo de criarAdmin(): client próprio, fora do wrapper de
        // src/config/database.js, precisa do seu próprio set_config —
        // bypass herdado da autenticação de plataforma já validada (ver
        // authPlataformaMiddleware.js), nunca de dado da requisição.
        await client.query("SELECT set_config('app.bypass_tenant_rls', 'on', true)");

        // 1) tenant — mesmo INSERT de criar() acima, só que dentro desta
        // transação (client, não pool) para poder desfazer junto com os
        // dois passos seguintes.
        let tenant;
        try {
            const resultado = await client.query(
                `INSERT INTO tenants (nome, slug, plano, status)
                 VALUES ($1, $2, $3, 'ativo')
                 RETURNING id, nome, slug, plano, status, criado_em`,
                [dadosTenant.nome, dadosTenant.slug, dadosTenant.plano]
            );
            tenant = resultado.rows[0];
        } catch (erroTenant) {
            if (erroTenant.code === "23505") {
                await client.query("ROLLBACK");
                return res.status(409).json({ mensagem: "Este slug de tenant já está em uso" });
            }
            throw erroTenant;
        }

        // 2) administrador inicial
        let admin;
        try {
            admin = await inserirAdminInicial(client, tenant.id, dadosAdmin);
        } catch (erroAdmin) {
            await client.query("ROLLBACK");

            if (erroAdmin.tipoErro === "EMAIL_DUPLICADO" || erroAdmin.tipoErro === "CPF_DUPLICADO" || erroAdmin.tipoErro === "SEM_QR_TOKEN") {
                const status = erroAdmin.tipoErro === "SEM_QR_TOKEN" ? 500 : 409;
                return res.status(status).json({ mensagem: erroAdmin.message });
            }

            throw erroAdmin;
        }

        // 3) empresa/unidade inicial — mesmo formato de INSERT de
        // empresa.controller.js:criar (nome/slug/tenant_id). Nunca precisa
        // checar limite_empresas aqui (ver comentário da função).
        let empresa;
        try {
            const resultado = await client.query(
                `INSERT INTO empresas (nome, slug, tenant_id)
                 VALUES ($1, $2, $3)
                 RETURNING id, nome, slug, ativo, criado_em`,
                [dadosEmpresa.nome, dadosEmpresa.slug, tenant.id]
            );
            empresa = resultado.rows[0];
        } catch (erroEmpresa) {
            await client.query("ROLLBACK");

            if (erroEmpresa.code === "23505") {
                return res.status(409).json({ mensagem: "Este slug de empresa já está em uso" });
            }
            throw erroEmpresa;
        }

        await client.query("COMMIT");

        const configuracao = await resolverFuncionalidades({ id: tenant.id, plano: tenant.plano, limite_empresas_override: null });

        res.status(201).json({
            tenant,
            admin,
            empresa,
            funcionalidades: configuracao.funcionalidades,
            limiteEmpresas: configuracao.limiteEmpresas
        });

    } catch (erro) {
        await client.query("ROLLBACK").catch(function () {});
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao criar tenant. Nenhum dado foi salvo (operação revertida por completo)."
        });

    } finally {
        client.release();
    }
}

module.exports = { listar, detalhar, criar, atualizarStatus, atualizarConfiguracao, criarAdmin, onboarding };
