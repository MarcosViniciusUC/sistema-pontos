/**
 * Detectores de evento — funções PURAS (sem acesso a banco, sem I/O): dado
 * o contexto já coletado de um cliente (ver collectors.js), retornam a
 * lista de eventos aplicáveis agora, cada um com o payload (dados prontos
 * para os templates — ver templates.js).
 *
 * A regra de "quase lá" é EXATAMENTE a mesma do Bloco 1
 * (frontend/assets/js/ui.js:calcularProgresso — 80% do caminho até o custo
 * da recompensa) — reimplementada aqui porque o motor roda no backend, mas
 * deliberadamente com o MESMO número, para uma notificação nunca dizer
 * "quase lá" sobre algo que o próprio dashboard do cliente ainda mostraria
 * como "faltam muitos pontos".
 */
const QUASE_LA_PERCENTUAL = 0.8;

function calcularProgresso(saldo, pontosNecessarios) {
    const razao = pontosNecessarios > 0 ? saldo / pontosNecessarios : 1;
    const disponivel = saldo >= pontosNecessarios;

    return {
        disponivel: disponivel,
        faltam: Math.max(0, pontosNecessarios - saldo),
        quaseLa: !disponivel && razao >= QUASE_LA_PERCENTUAL
    };
}

/**
 * RECOMPENSA_DESBLOQUEADA / RECOMPENSA_QUASE_DESBLOQUEADA — olha para TODAS
 * as recompensas ativas; se `apenasFavoritas` for true, filtra para gerar
 * FAVORITO_DISPONIVEL / FAVORITO_QUASE_DESBLOQUEADO com a mesma lógica.
 *
 * Só retorna a OPORTUNIDADE MAIS RELEVANTE de cada tipo (a mais barata
 * desbloqueada; a mais próxima entre as ainda não desbloqueadas) — mesmo
 * princípio de "não parecer que existe só uma quando há várias, mas focar
 * na mais relevante" já usado no Bloco 1.
 */
function detectarEventosDeRecompensa(saldo, recompensasAtivas, apenasFavoritas) {
    const eventos = [];
    const lista = apenasFavoritas
        ? recompensasAtivas.filter(function (r) { return r.favorita; })
        : recompensasAtivas;

    const desbloqueadas = lista
        .filter(function (r) { return saldo >= r.pontos_necessarios; })
        .sort(function (a, b) { return a.pontos_necessarios - b.pontos_necessarios; });

    if (desbloqueadas.length > 0) {
        const maisBarata = desbloqueadas[0];
        eventos.push({
            tipo: apenasFavoritas ? "FAVORITO_DISPONIVEL" : "RECOMPENSA_DESBLOQUEADA",
            payload: {
                saldo: saldo,
                recompensa: maisBarata.nome,
                pontos_recompensa: maisBarata.pontos_necessarios,
                empresa: maisBarata.empresa_nome || null
            }
        });
    }

    const candidatasProgresso = lista.filter(function (r) { return saldo < r.pontos_necessarios; });

    const maisProxima = candidatasProgresso.reduce(function (menor, atual) {
        if (!menor || atual.pontos_necessarios < menor.pontos_necessarios) {
            return atual;
        }
        return menor;
    }, null);

    if (maisProxima) {
        const progresso = calcularProgresso(saldo, maisProxima.pontos_necessarios);

        if (progresso.quaseLa) {
            eventos.push({
                tipo: apenasFavoritas ? "FAVORITO_QUASE_DESBLOQUEADO" : "RECOMPENSA_QUASE_DESBLOQUEADA",
                payload: {
                    saldo: saldo,
                    recompensa: maisProxima.nome,
                    pontos_recompensa: maisProxima.pontos_necessarios,
                    pontos_faltantes: progresso.faltam,
                    empresa: maisProxima.empresa_nome || null
                }
            });
        }
    }

    return eventos;
}

/**
 * RESGATE_PROXIMO_DE_EXPIRAR — usa `horasParaAvisar` como parâmetro
 * explícito (nunca um número mágico aqui dentro): a decisão de "quanto
 * antes avisar" é de automação/negócio, não deste detector. Sem um valor
 * configurado ainda, o motor simplesmente não gera este evento — ver
 * engine.js.
 */
function detectarResgatesProximosDeExpirar(resgatesPendentes, horasParaAvisar) {
    if (!(horasParaAvisar > 0)) {
        return [];
    }

    return resgatesPendentes
        .filter(function (r) { return r.horas_restantes > 0 && r.horas_restantes <= horasParaAvisar; })
        .map(function (r) {
            return {
                tipo: "RESGATE_PROXIMO_DE_EXPIRAR",
                payload: {
                    recompensa: r.recompensa_nome,
                    horas_restantes: Math.max(0, Math.round(r.horas_restantes * 10) / 10),
                    codigo_resgate: r.codigo
                }
            };
        });
}

module.exports = {
    calcularProgresso,
    detectarEventosDeRecompensa,
    detectarResgatesProximosDeExpirar
};
