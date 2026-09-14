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
 * PERFORMANCE: as funções `coletarX(usuarioId)` fazem 1 consulta cada,
 * pensadas para UM cliente por vez (uso real: simulação sob demanda via
 * POST /admin/engajamento/simular). Para processar VÁRIOS clientes de uma
 * rodada (ver scheduler.js), use `coletarContextoEmLote(clientes)` — ela
 * busca os mesmos dados para o lote inteiro em 4 consultas FIXAS (nunca
 * 4×N), agregando por `usuario_id` no Postgres em vez de repetir a mesma
 * consulta num loop do Node.
 *
 * ETAPA 3C-7 — TENANT: o scheduler processa clientes de TODOS os tenants
 * na mesma rodada (não existe "o tenant desta execução"). Por isso, a
 * partir desta etapa, cada registro carrega o PRÓPRIO `tenant_id` (do
 * cliente, da recompensa) e nenhuma consulta aqui assume um tenant único
 * para o lote inteiro — ver coletarContextoEmLote() para como isso é
 * resolvido sem virar uma consulta por cliente.
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
//
// ETAPA 3C-7 — `tenantId` é obrigatório e vem sempre do PRÓPRIO REGISTRO do
// cliente (ver coletarDadosCliente/engine.js:coletarContexto), nunca de um
// tenant assumido/global. Antes desta etapa esta consulta buscava
// recompensas ativas de TODOS os tenants — um cliente do Tenant A podia
// receber um evento "RECOMPENSA_DESBLOQUEADA" sobre uma recompensa que, na
// verdade, pertence ao Tenant B. `rf.tenant_id = $2` no EXISTS impede que
// um favorito (sempre do mesmo tenant do usuário, desde a Etapa 3C-6)
// marque `favorita=true` para uma recompensa que nem deveria estar nesta
// lista, mas a proteção real aqui é o `r.tenant_id = $2` na cláusula WHERE
// externa.
async function coletarRecompensasAtivas(usuarioId, tenantId) {
    const resultado = await pool.query(
        `SELECT r.id, r.nome, r.pontos_necessarios, r.empresa_id, e.nome AS empresa_nome,
                EXISTS (
                    SELECT 1 FROM recompensas_favoritas rf
                    WHERE rf.recompensa_id = r.id AND rf.usuario_id = $1 AND rf.tenant_id = $2
                ) AS favorita
         FROM recompensas r
         LEFT JOIN empresas e ON e.id = r.empresa_id
         WHERE r.ativo = true AND r.tenant_id = $2
         ORDER BY r.pontos_necessarios ASC`,
        [usuarioId, tenantId]
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
//
// ETAPA 3C-7 — `tenant_id` incluído no SELECT: esta é a fonte de verdade do
// tenant de cada cliente para todo o motor de engajamento (ver
// engine.js:coletarContexto, que usa `cliente.tenant_id` para buscar as
// recompensas do tenant certo, nunca um tenant assumido).
async function coletarDadosCliente(usuarioId) {
    const resultado = await pool.query(
        `SELECT id, nome, email, tipo, tenant_id FROM usuarios WHERE id = $1`,
        [usuarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Todos os clientes (tipo='cliente' — nunca admin/funcionário, que não têm
 * saldo de fidelidade) — usado pelo scheduler.js para saber quem processar.
 * Só as colunas que o motor realmente usa (ver coletarDadosCliente).
 *
 * ETAPA 3C-7 — `tenant_id` incluído no SELECT: o scheduler processa
 * clientes de TODOS os tenants na mesma rodada (não existe "tenant da
 * rodada"), então cada cliente precisa carregar o próprio tenant consigo
 * mesmo daqui em diante — nunca inferido de fora.
 */
async function coletarClientesElegiveis() {
    const resultado = await pool.query(
        `SELECT id, nome, email, tenant_id FROM usuarios WHERE tipo = 'cliente' ORDER BY id`
    );

    return resultado.rows;
}

/**
 * Versão EM LOTE de coletarSaldo/coletarRecompensasAtivas/
 * coletarResgatesPendentes — pensada para o scheduler.js, que precisa do
 * contexto de VÁRIOS clientes na mesma rodada. Em vez de repetir as 3
 * consultas por cliente (o que viraria 3×N consultas — exatamente o N+1
 * que este arquivo já alertava contra desde o Bloco 3), busca cada dado
 * UMA VEZ PARA TODOS os clientes de uma vez (agregação/IN, nunca um loop
 * de queries) e devolve um Map<usuarioId, contexto> pronto para
 * eventDetector.js — mesmo formato de dado que coletarSaldo/
 * coletarRecompensasAtivas/coletarResgatesPendentes produziam
 * individualmente, então nenhum detector precisou mudar.
 *
 * Total: sempre 4 consultas, não importa se `clientes` tem 1 ou 10.000
 * elementos.
 *
 * ETAPA 3C-7 — recebe `clientes` (objetos `{id, tenant_id, ...}`, vindos de
 * coletarClientesElegiveis()), não mais uma lista de ids soltos: o lote
 * quase sempre mistura clientes de tenants diferentes na mesma rodada, e
 * cada um só pode enxergar recompensas do PRÓPRIO tenant.
 *
 * BUG CORRIGIDO NESTA ETAPA: a consulta de recompensas ativas buscava
 * `WHERE r.ativo = true` sem filtro de tenant nenhum e aplicava essa MESMA
 * lista global a todo cliente do lote — um cliente do Tenant A podia
 * "desbloquear" (e receber evento sobre) uma recompensa que pertence, na
 * verdade, ao Tenant B. Correção: a consulta agora também traz
 * `r.tenant_id`, e as recompensas são agrupadas por tenant em memória
 * (`recompensasPorTenant`) — continua sendo UMA consulta para o lote
 * inteiro (nunca uma por tenant nem uma por cliente), só a distribuição
 * final é que respeita `cliente.tenant_id` em vez de ser a mesma lista
 * para todo mundo.
 */
async function coletarContextoEmLote(clientes, horasParaExpirar) {
    if (clientes.length === 0) {
        return new Map();
    }

    const usuarioIds = clientes.map(function (c) { return c.id; });

    const [saldosResultado, recompensasResultado, favoritosResultado, resgatesResultado] = await Promise.all([
        pool.query(
            `SELECT usuario_id, COALESCE(SUM(
                CASE WHEN tipo = 'entrada' THEN quantidade WHEN tipo = 'saida' THEN -quantidade END
            ), 0) AS saldo
             FROM movimentacoes_pontos
             WHERE usuario_id = ANY($1)
             GROUP BY usuario_id`,
            [usuarioIds]
        ),
        // Recompensas ativas de TODOS os tenants presentes no lote, numa
        // única consulta — o isolamento por tenant acontece na distribuição
        // abaixo (recompensasPorTenant), nunca aqui no SELECT.
        pool.query(
            `SELECT r.id, r.nome, r.pontos_necessarios, r.empresa_id, e.nome AS empresa_nome, r.tenant_id
             FROM recompensas r
             LEFT JOIN empresas e ON e.id = r.empresa_id
             WHERE r.ativo = true
             ORDER BY r.pontos_necessarios ASC`
        ),
        pool.query(
            `SELECT usuario_id, recompensa_id FROM recompensas_favoritas WHERE usuario_id = ANY($1)`,
            [usuarioIds]
        ),
        pool.query(
            `SELECT r.id, r.usuario_id, r.codigo, r.pontos, r.criado_em, rc.nome AS recompensa_nome,
                    EXTRACT(EPOCH FROM (
                        (r.criado_em + ($2 || ' hours')::interval) - NOW()
                    )) / 3600 AS horas_restantes
             FROM resgates r
             LEFT JOIN recompensas rc ON rc.id = r.recompensa_id
             WHERE r.usuario_id = ANY($1) AND r.status = 'pendente_validacao'`,
            [usuarioIds, horasParaExpirar]
        )
    ]);

    const saldoPorUsuario = new Map(saldosResultado.rows.map(function (l) { return [l.usuario_id, Number(l.saldo)]; }));

    // Agrupamento por tenant — é isto que impede a recompensa de um tenant
    // de "vazar" para o contexto de um cliente de outro tenant no lote.
    const recompensasPorTenant = new Map();
    recompensasResultado.rows.forEach(function (r) {
        if (!recompensasPorTenant.has(r.tenant_id)) {
            recompensasPorTenant.set(r.tenant_id, []);
        }
        recompensasPorTenant.get(r.tenant_id).push(r);
    });

    const favoritosPorUsuario = new Map();
    favoritosResultado.rows.forEach(function (l) {
        if (!favoritosPorUsuario.has(l.usuario_id)) {
            favoritosPorUsuario.set(l.usuario_id, new Set());
        }
        favoritosPorUsuario.get(l.usuario_id).add(l.recompensa_id);
    });

    const resgatesPorUsuario = new Map();
    resgatesResultado.rows.forEach(function (linha) {
        const item = {
            id: linha.id,
            codigo: linha.codigo,
            pontos: linha.pontos,
            recompensa_nome: linha.recompensa_nome,
            horas_restantes: Number(linha.horas_restantes)
        };
        if (!resgatesPorUsuario.has(linha.usuario_id)) {
            resgatesPorUsuario.set(linha.usuario_id, []);
        }
        resgatesPorUsuario.get(linha.usuario_id).push(item);
    });

    const contextoPorUsuario = new Map();

    clientes.forEach(function (cliente) {
        const favoritosDoUsuario = favoritosPorUsuario.get(cliente.id) || new Set();
        const recompensasDoTenant = recompensasPorTenant.get(cliente.tenant_id) || [];

        const recompensasAtivas = recompensasDoTenant.map(function (r) {
            return { ...r, favorita: favoritosDoUsuario.has(r.id) };
        });

        contextoPorUsuario.set(cliente.id, {
            tenantId: cliente.tenant_id,
            saldo: saldoPorUsuario.get(cliente.id) || 0,
            recompensasAtivas: recompensasAtivas,
            resgatesPendentes: resgatesPorUsuario.get(cliente.id) || []
        });
    });

    return contextoPorUsuario;
}

module.exports = {
    coletarSaldo,
    coletarRecompensasAtivas,
    coletarUltimaMovimentacao,
    coletarResgatesPendentes,
    coletarDadosCliente,
    coletarClientesElegiveis,
    coletarContextoEmLote
};
