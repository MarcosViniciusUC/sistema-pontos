const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const requestContext = require("../config/requestContext");

/**
 * Autenticação de PLATAFORMA (Maple Tech) — separada e paralela a
 * `authMiddleware.js` (tenant), nunca misturada com ela.
 *
 * Formato de token de PLATAFORMA:
 *   { id: number, escopo: "plataforma" }
 *
 * Nunca tem `tipo` nem `tenant_id` — são campos do modelo de TENANT (ver
 * auth.controller.js:login). Um admin de plataforma não pertence a nenhum
 * tenant, então não faz sentido (e seria perigoso) inventar um `tenant_id`
 * qualquer só para reaproveitar `authMiddleware`.
 *
 * VALIDAÇÃO DE FORMATO estrita: além de `id` numérico e `escopo ===
 * "plataforma"`, exige que `tenant_id` e `tipo` estejam AUSENTES do
 * payload. Isso rejeita explicitamente um JWT de tenant (que nunca tem
 * `escopo`, então já cairia aqui de qualquer forma) e também qualquer
 * token ambíguo/malformado que por engano carregasse os dois conjuntos de
 * campos ao mesmo tempo — um token assim é tratado como inválido, nunca
 * aceito "só porque tinha escopo certo".
 *
 * 401 vs 403: um token ausente, mal formado, com assinatura inválida ou
 * expirado é 401 — não dá pra saber quem está pedindo. Um token com
 * ASSINATURA VÁLIDA mas de formato errado (ex: um JWT de tenant genuíno,
 * `{id, tipo, tenant_id}`) é 403 — sabemos exatamente quem é (um admin de
 * tenant autenticado de verdade), só que essa identidade não tem acesso a
 * este recurso, que é sempre de plataforma. Mesma distinção semântica já
 * usada no resto do projeto (ex: tenant inativo também é 403, não 401).
 *
 * REVALIDAÇÃO CONTRA O BANCO: mesmo princípio de `authMiddleware.js` —
 * nunca confia só na assinatura. Se o admin foi removido de
 * `admins_plataforma` depois do login, o token (ainda com assinatura
 * válida até expirar) passa a ser rejeitado no próximo request.
 *
 * Disponibiliza `req.adminPlataforma = { id, escopo }` — NUNCA
 * `req.usuario` (esse campo é do modelo de tenant; um controller que lesse
 * `req.usuario` por engano numa rota de plataforma deve ver `undefined` e
 * falhar visivelmente, não um objeto parcialmente preenchido).
 *
 * ETAPA 3C-13 (RLS) — a partir do momento em que o FORMATO do JWT já foi
 * validado como sendo de plataforma (linha 71-80, acima), tanto a própria
 * revalidação contra `admins_plataforma` quanto o restante da cadeia
 * (`next()`) rodam dentro de `requestContext.runAsBypass(...)`.
 * `admins_plataforma` tem RLS bypass-only mesmo para SELECT (ver
 * migrate-rls-admins-plataforma.js) — sem isto, a própria revalidação
 * abaixo nunca encontraria nenhuma linha (fail-closed) e todo admin de
 * plataforma real seria rejeitado com "Sessão expirada". Bypass nunca vem
 * de header/body/query — é ativado aqui só depois de assinatura E formato
 * já terem sido confirmados; um JWT de tenant nunca chega até este ponto
 * (é rejeitado antes, com 401/403, ver acima).
 */
async function authPlataformaMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            mensagem: "Token não informado"
        });
    }

    const partes = authHeader.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
        return res.status(401).json({
            mensagem: "Token em formato inválido"
        });
    }

    const token = partes[1];

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (erro) {
        return res.status(401).json({
            mensagem: "Token inválido ou expirado"
        });
    }

    const formatoValido = typeof decoded.id === "number"
        && decoded.escopo === "plataforma"
        && decoded.tenant_id === undefined
        && decoded.tipo === undefined;

    if (!formatoValido) {
        return res.status(403).json({
            mensagem: "Esta ação requer um administrador de plataforma"
        });
    }

    try {
        await requestContext.runAsBypass(async () => {
            const resultado = await pool.query(
                "SELECT id FROM admins_plataforma WHERE id = $1",
                [decoded.id]
            );

            if (resultado.rows.length === 0) {
                return res.status(401).json({
                    mensagem: "Sessão expirada. Faça login novamente."
                });
            }

            req.adminPlataforma = { id: decoded.id, escopo: decoded.escopo };

            next();
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao validar administrador de plataforma"
        });
    }
}

module.exports = authPlataformaMiddleware;
