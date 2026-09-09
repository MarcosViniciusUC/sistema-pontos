const pool = require("../config/database");
const { empresaAtivaExiste } = require("../utils/empresas");

/**
 * empresa_id é obrigatório em toda recompensa nova (ver validateRewardCreate.js
 * para o formato) — aqui só confirmamos que a empresa existe e está ativa,
 * pra devolver um 400 claro em vez de deixar a FK estourar como erro 500.
 */
async function criar(req, res) {
    const { nome, descricao, pontos_necessarios, empresa_id, imagem } = req.body;

    try {
        if (!(await empresaAtivaExiste(pool, empresa_id))) {
            return res.status(400).json({
                mensagem: "Empresa inválida"
            });
        }

        const resultado = await pool.query(
            `INSERT INTO recompensas (nome, descricao, pontos_necessarios, empresa_id, imagem)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, imagem, destacada, criado_em`,
            [nome, descricao ?? null, pontos_necessarios, empresa_id, imagem ?? null]
        );

        res.status(201).json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao cadastrar recompensa"
        });
    }
}

/**
 * empresa_nome vem de um LEFT JOIN (não INNER) porque algumas recompensas
 * cadastradas antes desta estrutura existir ainda não têm empresa definida
 * (empresa_id NULL) — elas continuam aparecendo normalmente, só com
 * empresa_nome = null, até o admin editá-las e escolher uma empresa.
 *
 * `destacada` é GLOBAL (mesmo valor pra todo mundo, controlado só por
 * admin/funcionário via destacar()/removerDestaque() abaixo). `favorita` é
 * por usuário — um EXISTS correlacionado com req.usuario.id (sempre
 * disponível, esta rota exige authMiddleware), então cada usuário só vê a
 * própria marcação, nunca a de outro. Continua sendo UMA consulta só
 * (nenhum JOIN com recompensas_favoritas que multiplicaria linhas) — o
 * EXISTS não traz colunas da tabela de favoritos, só true/false.
 */
async function listar(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT r.id, r.nome, r.descricao, r.pontos_necessarios, r.ativo, r.criado_em,
                    r.empresa_id, e.nome AS empresa_nome, r.imagem, r.destacada,
                    EXISTS (
                        SELECT 1 FROM recompensas_favoritas rf
                        WHERE rf.recompensa_id = r.id AND rf.usuario_id = $1
                    ) AS favorita
             FROM recompensas r
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE r.ativo = true
             ORDER BY r.pontos_necessarios ASC`,
            [req.usuario.id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar recompensas"
        });
    }
}

/**
 * Listagem administrativa: inclui ativas E inativas. Só admin (ver
 * roleMiddleware na rota) — GET /recompensas público continua devolvendo
 * só ativo=true, sem nenhuma mudança, para não afetar o catálogo do
 * cliente/funcionário.
 *
 * empresa_ativa vem junto (só aqui, não no GET /recompensas público) pra o
 * admin enxergar quando uma recompensa aponta pra uma empresa já
 * desativada — ela continua com nome e histórico intactos (LEFT JOIN não
 * filtra por empresas.ativo), só não pode mais ser escolhida em recompensa
 * NOVA (ver validateRewardCreate/empresaAtivaExiste).
 */
async function listarAdmin(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT r.id, r.nome, r.descricao, r.pontos_necessarios, r.ativo, r.criado_em,
                    r.empresa_id, e.nome AS empresa_nome, e.ativo AS empresa_ativa, r.imagem, r.destacada
             FROM recompensas r
             LEFT JOIN empresas e ON e.id = r.empresa_id
             ORDER BY r.ativo DESC, r.pontos_necessarios ASC`
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar recompensas"
        });
    }
}

/**
 * nome/descricao/pontos_necessarios/empresa_id — nunca o id (vem só da URL,
 * nunca do body) nem "ativo" (status muda exclusivamente por
 * remover()/reativar() abaixo, para não ter dois caminhos diferentes
 * mexendo na mesma coisa). empresa_id segue o mesmo padrão opcional dos
 * outros campos (COALESCE) — se enviado, precisa ser uma empresa
 * ativa existente; se omitido, mantém a empresa atual.
 *
 * Mesmo raciocínio vale para "destacada": nunca lida daqui, mesmo que
 * enviada no body — muda exclusivamente por destacar()/removerDestaque()
 * abaixo. Isso também é o que impede o cliente de virar destaque global por
 * este endpoint (que de qualquer forma já é admin-only — ver reward.routes.js).
 */
async function atualizar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    const { nome, descricao, pontos_necessarios, empresa_id } = req.body;

    if (empresa_id !== undefined && !(await empresaAtivaExiste(pool, empresa_id))) {
        return res.status(400).json({
            mensagem: "Empresa inválida"
        });
    }

    // imagem segue uma regra diferente dos outros campos: aqui "campo
    // ausente" (imagemFornecida = false) e "campo enviado como null" (trocar
    // por vazio, ou seja, remover a foto) precisam de resultados diferentes.
    // Os outros campos usam COALESCE porque nunca há um jeito válido de
    // "esvaziar" nome/pontos/empresa por este endpoint — imagem é o único
    // que precisa disso (botão "Remover foto" no admin).
    const imagemFornecida = Object.prototype.hasOwnProperty.call(req.body, "imagem");
    const novaImagem = imagemFornecida ? (req.body.imagem || null) : null;

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET nome = COALESCE($1, nome),
                 descricao = COALESCE($2, descricao),
                 pontos_necessarios = COALESCE($3, pontos_necessarios),
                 empresa_id = COALESCE($4, empresa_id),
                 imagem = CASE WHEN $6 THEN $7 ELSE imagem END
             WHERE id = $5
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, imagem, destacada, criado_em`,
            [nome ?? null, descricao ?? null, pontos_necessarios ?? null, empresa_id ?? null, id, imagemFornecida, novaImagem]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar recompensa"
        });
    }
}

async function remover(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET ativo = false
             WHERE id = $1
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao remover recompensa"
        });
    }
}

/**
 * Reativa uma recompensa desativada (ativo -> true). Idempotente: se já
 * estiver ativa, não é um erro — só devolve a recompensa como está, sem
 * criar uma segunda linha nem duplicar nada.
 */
async function reativar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET ativo = true
             WHERE id = $1
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao reativar recompensa"
        });
    }
}

/**
 * Destaque GLOBAL da recompensa (⭐ na área administrativa/funcionário) —
 * conceito diferente do favorito individual de cliente (ver
 * favorito.controller.js): vale pra todo mundo, não depende de quem está
 * logado. Só admin e funcionário (ver roleMiddleware em reward.routes.js) —
 * cliente nunca chega a estas duas funções.
 *
 * Idempotente, mesmo padrão de ativar()/desativar() em empresa.controller.js:
 * destacar uma recompensa que já está destacada não é erro, só confirma o
 * estado atual.
 */
async function destacar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET destacada = true
             WHERE id = $1
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, imagem, destacada, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao destacar recompensa"
        });
    }
}

async function removerDestaque(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE recompensas
             SET destacada = false
             WHERE id = $1
             RETURNING id, nome, descricao, pontos_necessarios, ativo, empresa_id, imagem, destacada, criado_em`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao remover destaque da recompensa"
        });
    }
}

module.exports = {
    criar,
    listar,
    listarAdmin,
    atualizar,
    remover,
    reativar,
    destacar,
    removerDestaque
};
