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
 *
 * ETAPA 3C-7 — `usuario_id` sendo lido do body (não do JWT, ao contrário
 * do resto do sistema) é exatamente o tipo de campo que precisa ser
 * validado contra o tenant autenticado: sem isso, um admin do Tenant A
 * podia simular (e ver nome/saldo/recompensas) de um cliente de outro
 * tenant só sabendo o id. `req.usuario.tenant_id` é repassado a
 * `engine.simular` como tenant esperado — engine.js recusa com a mesma
 * mensagem genérica "Usuário não encontrado" se o cliente encontrado
 * pertencer a outro tenant.
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
        const resultado = await engine.simular(usuarioId, req.usuario.tenant_id, { horasParaAvisarExpiracao });

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
 * Executa uma rodada do scheduler AGORA, sob demanda. Mesma função que o
 * intervalo automático chamaria (ver scheduler.js), incluindo a mesma
 * proteção contra sobreposição (se uma rodada já estiver rodando, esta
 * chamada é pulada, nunca roda em paralelo). SEMPRE em modo simulação —
 * não existe parâmetro nenhum aqui que troque isso; ver
 * engine.js:avaliarParaSimulacaoDeLote, que é fisicamente incapaz de
 * enviar algo real.
 *
 * ETAPA 3C-7 — esta rodada processa clientes de TODOS os tenants (isolados
 * entre si, ver scheduler.js/collectors.js), e a resposta JSON devolve o
 * resultado simulado de cada um (nome, tenantId incluído) — dado
 * verdadeiramente global, nunca de um único tenant.
 *
 * ETAPA 3C-7.1 — por isso mesmo, esta rota NÃO é mais admin-comum: a rota
 * (ver engagement.routes.js) exige `exigirEscopoPlataforma` em vez de
 * `roleMiddleware("admin")`, bloqueando qualquer admin de tenant com 403.
 * Só uma futura autenticação de plataforma (Maple Tech, ainda não
 * implementada) poderá chamar isto — este controller e a função interna
 * do scheduler não mudaram, só a autorização na rota.
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
