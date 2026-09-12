const engine = require("../services/engagement/engine");
const scheduler = require("../services/engagement/scheduler");

/**
 * Simulação do Motor de Engajamento (Bloco 3) — admin apenas (ver
 * roleMiddleware na rota). Gera a mensagem que uma automação mandaria para
 * um cliente específico, SEM enviar nada de verdade (nenhum provider é
 * chamado — ver services/engagement/engine.js:simular).
 *
 * `usuario_id` vem do corpo da requisição porque quem simula é sempre o
 * admin testando o sistema PARA outro cliente (o próprio admin não tem
 * saldo/recompensas de fidelidade) — mesmo padrão já usado em
 * GET /usuarios/qr/:qr_token (admin/funcionário podem consultar dados de
 * qualquer cliente, nunca de si mesmos nesse fluxo). Isto NUNCA concede
 * nenhum benefício real nem alta nenhum dado — é só leitura + composição de
 * texto.
 */
async function simular(req, res) {
    const usuarioId = Number(req.body.usuario_id);

    if (!Number.isInteger(usuarioId)) {
        return res.status(400).json({
            mensagem: "Campo 'usuario_id' é obrigatório e deve ser um número inteiro"
        });
    }

    // horas_para_avisar_expiracao é opcional e só afeta a SIMULAÇÃO desta
    // chamada — nunca persiste, nunca é uma automação real (ver
    // automationRegistry.js: nenhuma automação de RESGATE_PROXIMO_DE_EXPIRAR
    // está ativa hoje). Serve pra quem estiver revisando o sistema poder
    // testar "e se avisássemos com 2h de antecedência?" sem precisar
    // decidir esse número agora.
    const horasParaAvisarExpiracao = req.body.horas_para_avisar_expiracao !== undefined
        ? Number(req.body.horas_para_avisar_expiracao)
        : undefined;

    if (horasParaAvisarExpiracao !== undefined && !(horasParaAvisarExpiracao > 0)) {
        return res.status(400).json({
            mensagem: "Campo 'horas_para_avisar_expiracao', quando enviado, deve ser um número maior que zero"
        });
    }

    try {
        const resultado = await engine.simular(usuarioId, { horasParaAvisarExpiracao });

        if (resultado.erro) {
            return res.status(404).json({ mensagem: resultado.erro });
        }

        res.json(resultado);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao simular engajamento"
        });
    }
}

/**
 * Executa uma rodada do scheduler AGORA, sob demanda — admin apenas. Mesma
 * função que o intervalo automático chamaria (ver scheduler.js), incluindo
 * a mesma proteção contra sobreposição (se uma rodada já estiver rodando,
 * esta chamada é pulada, nunca roda em paralelo). SEMPRE em modo simulação
 * — não existe parâmetro nenhum aqui que troque isso; ver
 * engine.js:avaliarParaSimulacaoDeLote, que é fisicamente incapaz de
 * enviar algo real.
 */
async function executarSchedulerAgora(req, res) {
    const horasParaAvisarExpiracao = req.body.horas_para_avisar_expiracao !== undefined
        ? Number(req.body.horas_para_avisar_expiracao)
        : undefined;

    if (horasParaAvisarExpiracao !== undefined && !(horasParaAvisarExpiracao > 0)) {
        return res.status(400).json({
            mensagem: "Campo 'horas_para_avisar_expiracao', quando enviado, deve ser um número maior que zero"
        });
    }

    try {
        const resultado = await scheduler.executarManualmente({ horasParaAvisarExpiracao });
        res.json(resultado);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao executar o scheduler manualmente"
        });
    }
}

module.exports = { simular, executarSchedulerAgora };
