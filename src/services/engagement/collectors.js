/**
 * Coleta de dados do MOTOR DE ENGAJAMENTO — Bloco 3.
 *
 * Cada função aqui busca exatamente os dados que os detectores de evento
 * (ver eventDetector.js) precisam para UM cliente específico. As consultas
 * são deliberadamente as MESMAS já usadas em reward.controller.js/
 * favorito.controller.js/redemption.controller.js — não reinventamos
 * critério nenhum (o que é "ativo", o que é "pendente", etc.), só
 * reaproveitamos o que o resto do sistema já considera verdade.
 *
 * SEGURANÇA: toda função aqui recebe `usuarioId` como parâmetro explícito,
 * nunca o lê de um objeto de requisição. Quem decide qual usuarioId é
 * legítimo é sempre a camada que chama o motor (ver engine.js e
 * engagement.controller.js) — nunca este arquivo.
 *
 * PERFORMANCE: 4 consultas fixas por cliente (saldo, recompensas ativas,
 * favoritos, resgates pendentes), nenhuma delas dentro de um loop. Avaliar
 * N clientes de uma vez (um futuro cron/lote) da forma como este arquivo
 * está feito seria 4×N consultas — aceitável para simulação sob demanda
 * (1 cliente por vez, que é o único uso real desta etapa), mas NÃO deve ser
 * usado assim num lote grande sem antes reescrever para consultas agregadas
 * (todas os clientes de uma vez, com JOIN/GROUP BY) — ver seção de
 * performance do relatório final.
 */
const pool = require("../../config/database");

async function coletarSaldo(usuarioId) {
    const resultado = await pool.query(
        `SELECT COALESCE(SUM(
            CASE
                WHEN tipo = 'entrada' THEN quantidade
                WHEN tipo = 'saida' THEN -quantidade
            END
        ), 0) AS saldo
         FROM movimentacoes_pontos
         WHERE usuario_id = $1`,
        [usuarioId]
    );

    return Number(resultado.rows[0].saldo);
}

// Mesmo critério de reward.controller.js:listar — só recompensas ativas,
// mesmas colunas relevantes para os detectores (nome, custo, favorita).
async function coletarRecompensasAtivas(usuarioId) {
    const resultado = await pool.query(
        `SELECT r.id, r.nome, r.pontos_necessarios, r.empresa_id, e.nome AS empresa_nome,
                EXISTS (
                    SELECT 1 FROM recompensas_favoritas rf
                    WHERE rf.recompensa_id = r.id AND rf.usuario_id = $1
                ) AS favorita
         FROM recompensas r
         LEFT JOIN empresas e ON e.id = r.empresa_id
         WHERE r.ativo = true
         ORDER BY r.pontos_necessarios ASC`,
        [usuarioId]
    );

    return resultado.rows;
}

// Último movimento de pontos do cliente (qualquer tipo) — usado por
// detectores que dependem de "há quanto tempo o cliente não interage"
// (ver eventDetector.js:CLIENTE_INATIVO/CLIENTE_RETORNOU). Retorna null se
// o cliente nunca teve nenhuma movimentação.
async function coletarUltimaMovimentacao(usuarioId) {
    const resultado = await pool.query(
        `SELECT criado_em FROM movimentacoes_pontos
         WHERE usuario_id = $1
         ORDER BY criado_em DESC
         LIMIT 1`,
        [usuarioId]
    );

    return resultado.rows.length > 0 ? resultado.rows[0].criado_em : null;
}

// Mesmo critério de redemption.controller.js — resgates ainda não
// utilizados/cancelados, com o tempo restante calculado no PRÓPRIO
// PostgreSQL (nunca no Node) para nunca divergir da regra real de
// expiração em resgateExpiracao.service.js.
async function coletarResgatesPendentes(usuarioId, horasParaExpirar) {
    const resultado = await pool.query(
        `SELECT r.id, r.codigo, r.pontos, r.criado_em, rc.nome AS recompensa_nome,
                EXTRACT(EPOCH FROM (
                    (r.criado_em + ($2 || ' hours')::interval) - NOW()
                )) / 3600 AS horas_restantes
         FROM resgates r
         LEFT JOIN recompensas rc ON rc.id = r.recompensa_id
         WHERE r.usuario_id = $1 AND r.status = 'pendente_validacao'
         ORDER BY r.criado_em ASC`,
        [usuarioId, horasParaExpirar]
    );

    return resultado.rows.map(function (linha) {
        return {
            id: linha.id,
            codigo: linha.codigo,
            pontos: linha.pontos,
            recompensa_nome: linha.recompensa_nome,
            horas_restantes: Number(linha.horas_restantes)
        };
    });
}

// Dados básicos do próprio cliente (nome, email) — só o que os templates
// hoje sabem preencher (ver templates.js) e nada além disso: não existe
// telefone confirmado nem data de nascimento com garantia de preenchimento
// (telefone é opcional; data de nascimento não existe na tabela `usuarios`
// — ver ANIVERSARIO em eventCatalog.js).
async function coletarDadosCliente(usuarioId) {
    const resultado = await pool.query(
        `SELECT id, nome, email, tipo FROM usuarios WHERE id = $1`,
        [usuarioId]
    );

    return resultado.rows[0] || null;
}

module.exports = {
    coletarSaldo,
    coletarRecompensasAtivas,
    coletarUltimaMovimentacao,
    coletarResgatesPendentes,
    coletarDadosCliente
};
