const pool = require("../config/database");

/**
 * Favorito INDIVIDUAL de cliente — conceito diferente do destaque global de
 * recompensa (ver reward.controller.js:destacar/removerDestaque). Cada
 * função aqui só enxerga o próprio usuário autenticado: usuario_id vem
 * sempre de req.usuario.id (JWT), nunca de body/query/params — não existe
 * caminho de código que permita favoritar/desfavoritar/listar em nome de
 * outra pessoa (roleMiddleware("cliente") nas rotas também impede
 * admin/funcionário de chegar aqui, mas a proteção real é essa: mesmo que
 * chegasse, não haveria como agir sobre outro usuario_id).
 */

/**
 * Lista as recompensas favoritadas pelo cliente autenticado, com o mesmo
 * formato de objeto usado em GET /recompensas (nome, pontos, empresa,
 * imagem, destacada) — os cards do frontend (favoritos.js) reaproveitam a
 * mesma função de renderização por causa disso.
 *
 * Deliberadamente SEM `WHERE r.ativo = true`: uma recompensa favoritada que
 * foi desativada continua aparecendo aqui (a relação de favorito persiste),
 * só que com ativo=false — o frontend decide, a partir desse campo, mostrar
 * como indisponível para resgate em vez de escondê-la da lista.
 */
async function listar(req, res) {
    const usuario_id = req.usuario.id;

    try {
        const resultado = await pool.query(
            `SELECT r.id, r.nome, r.descricao, r.pontos_necessarios, r.ativo, r.criado_em,
                    r.empresa_id, e.nome AS empresa_nome, r.imagem, r.destacada, true AS favorita
             FROM recompensas_favoritas rf
             JOIN recompensas r ON r.id = rf.recompensa_id
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE rf.usuario_id = $1
             ORDER BY rf.criado_em DESC`,
            [usuario_id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar favoritos"
        });
    }
}

/**
 * Favorita uma recompensa para o cliente autenticado. Idempotente: favoritar
 * de novo uma recompensa que já é favorita não cria uma segunda linha
 * (ON CONFLICT DO NOTHING sobre a UNIQUE (usuario_id, recompensa_id) — ver
 * migrate-recompensas-favoritas.js) nem é tratado como erro.
 *
 * Confirma que a recompensa existe antes do INSERT — sem isso, favoritar um
 * id inexistente estouraria a FK como erro 500 em vez de um 404 legível.
 * Não exige ativo=true de propósito: nada nas regras impede favoritar algo
 * temporariamente indisponível.
 */
async function favoritar(req, res) {
    const usuario_id = req.usuario.id;
    const recompensa_id = Number(req.params.id);

    if (!Number.isInteger(recompensa_id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const recompensaResultado = await pool.query(
            "SELECT id FROM recompensas WHERE id = $1",
            [recompensa_id]
        );

        if (recompensaResultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        await pool.query(
            `INSERT INTO recompensas_favoritas (usuario_id, recompensa_id)
             VALUES ($1, $2)
             ON CONFLICT (usuario_id, recompensa_id) DO NOTHING`,
            [usuario_id, recompensa_id]
        );

        res.status(201).json({
            recompensa_id,
            favorita: true
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao favoritar recompensa"
        });
    }
}

/**
 * Remove a recompensa dos favoritos do cliente autenticado. Idempotente:
 * desfavoritar algo que não era favorito não é erro, só confirma o estado
 * atual (mesmo princípio de ativar()/desativar() em empresa.controller.js).
 * Nunca apaga a recompensa em si — só a linha de associação, se existir.
 */
async function desfavoritar(req, res) {
    const usuario_id = req.usuario.id;
    const recompensa_id = Number(req.params.id);

    if (!Number.isInteger(recompensa_id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        await pool.query(
            "DELETE FROM recompensas_favoritas WHERE usuario_id = $1 AND recompensa_id = $2",
            [usuario_id, recompensa_id]
        );

        res.json({
            recompensa_id,
            favorita: false
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao remover recompensa dos favoritos"
        });
    }
}

module.exports = {
    listar,
    favoritar,
    desfavoritar
};
