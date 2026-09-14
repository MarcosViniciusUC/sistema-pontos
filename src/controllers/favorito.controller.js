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
 *
 * ETAPA 3C-6 — filtrado também por `rf.tenant_id = req.usuario.tenant_id`
 * (do JWT, nunca de body/query/params). Redundante em termos de resultado
 * hoje (usuario_id já pertence a um único tenant, e favoritar() nesta
 * etapa passa a impedir a criação de qualquer linha cross-tenant), mas
 * deixa a query correta por si só, consistente com o padrão já usado nos
 * outros domínios isolados (usuários, empresas, recompensas, pontos,
 * resgates).
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
             WHERE rf.usuario_id = $1 AND rf.tenant_id = $2
             ORDER BY rf.criado_em DESC`,
            [usuario_id, req.usuario.tenant_id]
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
 *
 * ETAPA 3C-6 — `tenant_id` vem exclusivamente de `req.usuario.tenant_id`
 * (do JWT, nunca do body/query/params) e é gravado explicitamente no
 * INSERT, sem depender do DEFAULT temporário. A checagem de existência da
 * recompensa passa a exigir `tenant_id = $2` também: uma recompensa de
 * outro tenant (mesmo que exista de verdade) recebe o MESMO 404 genérico
 * "Recompensa não encontrada" usado para id inexistente, nunca revelando
 * que aquele id pertence a outro tenant. A constraint UNIQUE
 * (usuario_id, recompensa_id) não precisou incluir tenant_id: como
 * usuario_id e recompensa_id já pertencem, cada um, a exatamente um
 * tenant, essa dupla já é implicitamente única por tenant — não há
 * alteração de schema nesta etapa.
 */
async function favoritar(req, res) {
    const usuario_id = req.usuario.id;
    const recompensa_id = Number(req.params.id);
    const tenantId = req.usuario.tenant_id;

    if (!Number.isInteger(recompensa_id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        const recompensaResultado = await pool.query(
            "SELECT id FROM recompensas WHERE id = $1 AND tenant_id = $2",
            [recompensa_id, tenantId]
        );

        if (recompensaResultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Recompensa não encontrada"
            });
        }

        await pool.query(
            `INSERT INTO recompensas_favoritas (usuario_id, recompensa_id, tenant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (usuario_id, recompensa_id) DO NOTHING`,
            [usuario_id, recompensa_id, tenantId]
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
 *
 * ETAPA 3C-6 — `WHERE usuario_id = $1 AND recompensa_id = $2 AND
 * tenant_id = $3`. Redundante em termos de resultado hoje (uma linha
 * cross-tenant nunca chega a existir, já que favoritar() passou a impedir
 * isso), mas garante explicitamente que um usuário nunca afete uma linha
 * de outro tenant só por adivinhar/enviar um `recompensa_id` alheio —
 * defesa em profundidade, mesmo padrão já usado nos demais domínios.
 */
async function desfavoritar(req, res) {
    const usuario_id = req.usuario.id;
    const recompensa_id = Number(req.params.id);
    const tenantId = req.usuario.tenant_id;

    if (!Number.isInteger(recompensa_id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    try {
        await pool.query(
            "DELETE FROM recompensas_favoritas WHERE usuario_id = $1 AND recompensa_id = $2 AND tenant_id = $3",
            [usuario_id, recompensa_id, tenantId]
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
