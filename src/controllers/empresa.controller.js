const pool = require("../config/database");
const { normalizarSlug } = require("../utils/empresas");

/**
 * Lista as empresas/estabelecimentos parceiros ativos. Usada por
 * admin/funcionário para popular o select de "Empresa" ao criar/editar
 * recompensa e ao lançar uma entrada de pontos, e pelo cliente para montar
 * o filtro por empresa na tela de Recompensas (ver roleMiddleware na rota —
 * os três papéis têm acesso). A resposta é sempre só {id, nome, slug} de
 * empresas ativas, sem nenhum dado administrativo, então não há exposição
 * indevida em liberar o mesmo endpoint pro cliente autenticado.
 *
 * Continua só ativo=true e sem paginação/filtro extra — uma empresa
 * desativada precisa sumir daqui (não pode mais ser escolhida em novos
 * lançamentos/recompensas, nem aparecer como filtro pro cliente), mas isso
 * não afeta o histórico: nada aqui apaga ou esconde linhas antigas que já
 * referenciam essa empresa.
 */
async function listar(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT id, nome, slug FROM empresas WHERE ativo = true ORDER BY nome"
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar empresas"
        });
    }
}

/**
 * Listagem administrativa: inclui ativas E inativas, pra o admin conseguir
 * reativar uma empresa desativada ou só conferir o cadastro completo. Só
 * admin (ver roleMiddleware na rota) — GET /empresas continua só ativo=true
 * pros selects, sem nenhuma mudança.
 */
async function listarAdmin(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT id, nome, slug, ativo, criado_em FROM empresas ORDER BY ativo DESC, nome ASC"
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar empresas"
        });
    }
}

/**
 * empresa criada começa sempre ativa (DEFAULT true na coluna). O slug é
 * normalizado aqui (minúsculo, sem acento, só letras/números/hífen) antes
 * de gravar — a unicidade em si é garantida pela constraint UNIQUE no
 * banco (ver scripts/migrate-empresas.js); aqui só traduzimos a violação
 * dela pra uma resposta 409 legível, mesmo padrão já usado em
 * user.controller.js para email duplicado.
 */
async function criar(req, res) {
    const { nome, slug } = req.body;
    const slugNormalizado = normalizarSlug(slug);

    if (slugNormalizado.length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'slug' inválido — use letras, números e hífen"
        });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO empresas (nome, slug)
             VALUES ($1, $2)
             RETURNING id, nome, slug, ativo, criado_em`,
            [nome.trim(), slugNormalizado]
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
            mensagem: "Erro ao cadastrar empresa"
        });
    }
}

/**
 * nome/slug — nunca "ativo" (muda exclusivamente por ativar()/desativar()
 * abaixo, mesmo motivo já documentado em reward.controller.js:atualizar).
 * Campos omitidos mantêm o valor atual (COALESCE); slug, se enviado,
 * passa pela mesma normalização/validação de criar().
 */
async function atualizar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { nome, slug } = req.body;
    const slugNormalizado = slug !== undefined ? normalizarSlug(slug) : null;

    if (slug !== undefined && slugNormalizado.length === 0) {
        return res.status(400).json({
            mensagem: "Campo 'slug' inválido — use letras, números e hífen"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE empresas
             SET nome = COALESCE($1, nome),
                 slug = COALESCE($2, slug)
             WHERE id = $3
             RETURNING id, nome, slug, ativo, criado_em`,
            [nome !== undefined ? nome.trim() : null, slugNormalizado, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Empresa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        if (erro.code === "23505") {
            return res.status(409).json({
                mensagem: "Este slug já está em uso"
            });
        }

        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar empresa"
        });
    }
}

/**
 * Desativa a empresa (ativo -> false). Ela some do GET /empresas usado
 * pelos selects — não pode mais ser escolhida em novo lançamento de
 * pontos ou nova recompensa (ver empresaAtivaExiste em pontos/recompensas)
 * — mas nenhuma linha de movimentacoes_pontos/recompensas/resgates que já
 * aponta pra ela é tocada: continuam com o mesmo empresa_id de sempre, e
 * as listagens administrativas continuam mostrando o nome dela via
 * LEFT JOIN, ativa ou não. Idempotente: desativar de novo só confirma o
 * estado atual, não é erro.
 */
async function desativar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE empresas
             SET ativo = false
             WHERE id = $1
             RETURNING id, nome, slug, ativo, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Empresa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao desativar empresa"
        });
    }
}

/**
 * Reativa a empresa (ativo -> true), voltando a aparecer no GET /empresas
 * dos selects. Idempotente, mesmo padrão de desativar() acima.
 */
async function ativar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE empresas
             SET ativo = true
             WHERE id = $1
             RETURNING id, nome, slug, ativo, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Empresa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao ativar empresa"
        });
    }
}

module.exports = { listar, listarAdmin, criar, atualizar, ativar, desativar };
