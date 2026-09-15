const pool = require("../config/database");
const { resolverFuncionalidades } = require("../services/planosFuncionalidades.service");

/**
 * Bloqueia POST /empresas quando o tenant já está no limite de
 * empresas/unidades do próprio plano (ver
 * src/services/planosFuncionalidades.service.js — `limiteEmpresas: null`
 * significa sem limite, só tenants legados ou com override explícito
 * nesse sentido).
 *
 * Conta só empresas ATIVAS (`ativo = true`) — desativar uma empresa libera
 * uma vaga; isto é o que permite um admin "trocar" uma unidade fechada por
 * uma nova sem precisar de um plano maior, sem precisar apagar histórico
 * nenhum (desativar nunca é DELETE).
 *
 * Sempre depois de authMiddleware (precisa de `req.tenant`/`req.usuario`).
 */
async function exigirLimiteDeEmpresasNaoAtingido(req, res, next) {
    if (!req.tenant) {
        return res.status(401).json({
            mensagem: "Tenant não autenticado"
        });
    }

    try {
        const { limiteEmpresas } = await resolverFuncionalidades(req.tenant);

        if (limiteEmpresas === null) {
            return next();
        }

        const resultado = await pool.query(
            "SELECT count(*) FROM empresas WHERE tenant_id = $1 AND ativo = true",
            [req.usuario.tenant_id]
        );

        const quantidadeAtual = Number(resultado.rows[0].count);

        if (quantidadeAtual >= limiteEmpresas) {
            return res.status(403).json({
                mensagem: `Limite de ${limiteEmpresas} empresa(s)/unidade(s) do plano atual já foi atingido`
            });
        }

        next();

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao verificar limite de empresas do plano"
        });
    }
}

module.exports = exigirLimiteDeEmpresasNaoAtingido;
