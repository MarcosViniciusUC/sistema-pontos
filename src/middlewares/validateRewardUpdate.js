const { validarImagem } = require("../utils/validarImagem");

// "ativo" não é validado aqui de propósito: PUT não aceita mais esse campo
// (status muda só por DELETE /recompensas/:id e PATCH /recompensas/:id/reativar).
function validateRewardUpdate(req, res, next) {
    const { nome, descricao, pontos_necessarios, empresa_id, imagem } = req.body;

    if (nome !== undefined && (typeof nome !== "string" || nome.trim().length === 0)) {
        return res.status(400).json({
            mensagem: "Campo 'nome' não pode ser vazio"
        });
    }

    if (descricao !== undefined && typeof descricao !== "string") {
        return res.status(400).json({
            mensagem: "Campo 'descricao' deve ser uma string"
        });
    }

    if (
        pontos_necessarios !== undefined &&
        (!Number.isInteger(pontos_necessarios) || pontos_necessarios <= 0)
    ) {
        return res.status(400).json({
            mensagem: "Campo 'pontos_necessarios' deve ser um número inteiro maior que 0"
        });
    }

    // Opcional aqui (igual aos outros campos): se enviado, precisa ter
    // formato válido. A existência real da empresa é conferida no
    // controller. Se omitido, a recompensa mantém a empresa atual.
    if (empresa_id !== undefined && (!Number.isInteger(empresa_id) || empresa_id <= 0)) {
        return res.status(400).json({
            mensagem: "Campo 'empresa_id' deve ser um número inteiro válido"
        });
    }

    // imagem: null explícito = "remover a foto atual" (ver reward.controller.js
    // atualizar()); imagem ausente = "não mexer na foto atual"; qualquer outro
    // valor precisa ser uma data URL de imagem válida.
    if (imagem !== undefined && imagem !== null) {
        const erroImagem = validarImagem(imagem);

        if (erroImagem) {
            return res.status(400).json({
                mensagem: erroImagem
            });
        }
    }

    next();
}

module.exports = validateRewardUpdate;
