const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { normalizarSlug } = require("../utils/empresas");
const { gerarQrTokenUsuario } = require("../utils/qrTokenUsuario");

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
            "SELECT id, nome, slug, plano, status, criado_em FROM tenants WHERE id = $1",
            [id]
        );

        if (tenantResultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Tenant não encontrado"
            });
        }

        const [usuarios, empresas, recompensas, resgates, movimentacoes] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM empresas WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM recompensas WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM resgates WHERE tenant_id = $1", [id]),
            pool.query("SELECT COUNT(*)::int AS total FROM movimentacoes_pontos WHERE tenant_id = $1", [id])
        ]);

        res.json({
            tenant: tenantResultado.rows[0],
            estatisticas: {
                usuarios: usuarios.rows[0].total,
                empresas: empresas.rows[0].total,
                recompensas: recompensas.rows[0].total,
                resgates: resgates.rows[0].total,
                movimentacoes_pontos: movimentacoes.rows[0].total
            }
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
 * Cria o PRIMEIRO admin de um tenant — mesmo padrão de
 * user.controller.js:cadastrar() (bcrypt 10 rounds, qr_token gerado com
 * retry em SAVEPOINT em caso de colisão improvável), com duas diferenças
 * deliberadas:
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

        const senhaHash = await bcrypt.hash(senha, 10);
        let usuarioCriado = null;

        for (let tentativa = 0; tentativa < MAX_TENTATIVAS_QR_TOKEN && !usuarioCriado; tentativa++) {
            const qrToken = gerarQrTokenUsuario();

            await client.query("SAVEPOINT tentativa_qr_token");

            try {
                const resultado = await client.query(
                    `INSERT INTO usuarios (nome, email, senha, telefone, tipo, qr_token, cpf, tenant_id)
                     VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7)
                     RETURNING id, nome, email, telefone, tipo, criado_em`,
                    [nome, email, senhaHash, telefone ?? null, qrToken, cpf, id]
                );

                await client.query("RELEASE SAVEPOINT tentativa_qr_token");
                usuarioCriado = resultado.rows[0];

            } catch (erroInsercao) {
                await client.query("ROLLBACK TO SAVEPOINT tentativa_qr_token");

                if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_email_key") {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        mensagem: "Este email já está cadastrado neste tenant"
                    });
                }

                if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_cpf_key") {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        mensagem: "Este CPF já está cadastrado neste tenant"
                    });
                }

                const foiColisaoDeQrToken = erroInsercao.code === "23505"
                    && erroInsercao.constraint === "usuarios_qr_token_key";

                if (!foiColisaoDeQrToken) {
                    throw erroInsercao;
                }
                // colisão de qr_token (extremamente improvável): tenta de
                // novo com um token novo, sem perder o restante da transação.
            }
        }

        if (!usuarioCriado) {
            await client.query("ROLLBACK");
            return res.status(500).json({
                mensagem: "Não foi possível gerar um identificador único para o admin. Tente novamente."
            });
        }

        await client.query("COMMIT");
        res.status(201).json(usuarioCriado);

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao criar administrador do tenant"
        });

    } finally {
        client.release();
    }
}

module.exports = { listar, detalhar, criar, atualizarStatus, criarAdmin };
