/**
 * CATÁLOGO DE EVENTOS — Bloco 3 (Motor de Engajamento).
 *
 * Fonte única da verdade sobre quais eventos o motor sabe detectar hoje,
 * com dados 100% reais (nunca inventados), e quais dependem de uma decisão
 * ainda não tomada — comercial (um número/prazo que ninguém definiu) ou
 * estrutural (um dado que não existe no banco).
 *
 * `status` tem 3 valores possíveis:
 *   - "suportado": o motor consegue detectar isto HOJE com dados reais.
 *     Ainda assim, QUANDO disparar de verdade (limite, frequência) é uma
 *     automação — configuração futura, não decidida aqui.
 *   - "requer_decisao_comercial": tecnicamente detectável, mas só faz
 *     sentido dar um valor default arbitrário (quantos dias de inatividade
 *     contam? qual o período do resumo?) se o negócio decidir esse número.
 *     O motor expõe o DADO bruto (ex: "há quantos dias desde a última
 *     movimentação"); a REGRA de quando isso vira notificação fica pendente.
 *   - "requer_schema_novo": não dá pra implementar com o schema atual sem
 *     inventar dado que não existe (ex: data de nascimento). Não
 *     implementado; ver `bloqueio` para o que precisaria mudar.
 */

const EVENTOS = Object.freeze({
    RECOMPENSA_QUASE_DESBLOQUEADA: {
        status: "suportado",
        descricao: "Saldo do cliente já cobre boa parte do custo de uma recompensa ativa (mesma regra de 'quase lá' do Bloco 1: >=80% do caminho).",
        variaveis: ["nome", "saldo", "recompensa", "pontos_recompensa", "pontos_faltantes", "empresa"]
    },
    RECOMPENSA_DESBLOQUEADA: {
        status: "suportado",
        descricao: "Saldo do cliente já cobre o custo de uma recompensa ativa (a mais barata que ele pode resgatar).",
        variaveis: ["nome", "saldo", "recompensa", "pontos_recompensa", "empresa"]
    },
    FAVORITO_QUASE_DESBLOQUEADO: {
        status: "suportado",
        descricao: "Mesma regra de RECOMPENSA_QUASE_DESBLOQUEADA, restrita às recompensas que o cliente favoritou.",
        variaveis: ["nome", "saldo", "recompensa", "pontos_recompensa", "pontos_faltantes", "empresa"]
    },
    FAVORITO_DISPONIVEL: {
        status: "suportado",
        descricao: "Mesma regra de RECOMPENSA_DESBLOQUEADA, restrita aos favoritos.",
        variaveis: ["nome", "saldo", "recompensa", "pontos_recompensa", "empresa"]
    },
    RESGATE_PROXIMO_DE_EXPIRAR: {
        status: "suportado",
        descricao: "Resgate 'pendente_validacao' cujo prazo de 5h (regra já existente em resgateExpiracao.service.js, nunca reinventada aqui) está perto do fim.",
        variaveis: ["nome", "recompensa", "horas_restantes", "codigo_resgate"],
        pendente: "O motor calcula horas_restantes com precisão (direto do Postgres). QUÃO PERTO do fim já dispara o aviso ('1h antes'? '30min antes'?) é um parâmetro de automação, não decidido aqui — ver automationRegistry.js."
    },
    RESGATE_EXPIRADO: {
        status: "suportado",
        descricao: "Resgate acabou de ser cancelado automaticamente por expiração (resgateExpiracao.service.js já teria processado isto).",
        variaveis: ["nome", "recompensa", "pontos"]
    },
    SALDO_LEMBRETE: {
        status: "requer_decisao_comercial",
        descricao: "Lembrar o cliente do saldo que ele tem parado. O motor sabe calcular o saldo agora mesmo; o que falta decidir é a CONDIÇÃO de disparo (saldo mínimo? há quanto tempo sem uso?) e a frequência máxima de envio.",
        variaveis: ["nome", "saldo"]
    },
    CLIENTE_INATIVO: {
        status: "requer_decisao_comercial",
        descricao: "O motor já sabe calcular há quantos dias foi a última movimentação de pontos de qualquer cliente (coletarUltimaMovimentacao). O que falta decidir é: quantos dias sem movimentação definem 'inativo'?",
        variaveis: ["nome", "dias_desde_ultima_atividade"]
    },
    CLIENTE_RETORNOU: {
        status: "requer_decisao_comercial",
        descricao: "Mesma base de dados de CLIENTE_INATIVO (comparar a movimentação mais recente com a anterior) — falta decidir o mesmo número de dias que definiria 'tinha ficado inativo antes de voltar'.",
        variaveis: ["nome"]
    },
    RESUMO_PERIODICO: {
        status: "requer_decisao_comercial",
        descricao: "Resumo de atividade num período (pontos ganhos, resgates feitos). Tecnicamente simples de agregar a partir de movimentacoes_pontos/resgates — falta decidir qual período (semanal? mensal?) e o que exatamente deve entrar no resumo.",
        variaveis: ["nome", "saldo"]
    },
    ANIVERSARIO: {
        status: "requer_schema_novo",
        descricao: "Não existe nenhuma coluna de data de nascimento em `usuarios` hoje.",
        bloqueio: "Precisaria de uma nova coluna (ex: usuarios.data_nascimento DATE, nullable — nem todo cliente teria preenchido) mais um campo novo no cadastro/edição de perfil para capturar esse dado. Não implementado nesta etapa — nenhuma migration foi criada nem executada para isto.",
        variaveis: []
    }
});

module.exports = { EVENTOS };
