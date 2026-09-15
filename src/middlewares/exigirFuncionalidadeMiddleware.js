const { tenantTemFuncionalidade } = require("../services/planosFuncionalidades.service");

/**
 * Bloqueia uma rota se a funcionalidade `chave` não estiver habilitada para
 * o tenant da requisição (ver src/services/planosFuncionalidades.service.js
 * para a resolução plano -> funcionalidade -> override). Mesmo espírito de
 * roleMiddleware.js: um `if` central e reutilizável, nunca espalhado pelos
 * controllers.
 *
 * Sempre depois de authMiddleware (precisa de `req.tenant`) — é isto que
 * torna esconder o botão no frontend insuficiente por si só: mesmo uma
 * chamada direta à API, com token válido de um tenant sem a funcionalidade
 * contratada, recebe 403 aqui, antes de qualquer query de negócio rodar.
 */
function exigirFuncionalidade(chave) {
    return async function (req, res, next) {
        if (!req.tenant) {
            return res.status(401).json({
                mensagem: "Tenant não autenticado"
            });
        }

        try {
            const habilitada = await tenantTemFuncionalidade(req.tenant, chave);

            if (!habilitada) {
                return res.status(403).json({
                    mensagem: "Esta funcionalidade não está disponível no plano atual"
                });
            }

            next();

        } catch (erro) {
            console.log(erro);

            res.status(500).json({
                mensagem: "Erro ao verificar funcionalidades do plano"
            });
        }
    };
}

module.exports = exigirFuncionalidade;
