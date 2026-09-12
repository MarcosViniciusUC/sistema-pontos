/**
 * ============================================================================
 * PROPOSTA DE SCHEMA — Bloco 3 (Motor de Engajamento).
 *
 * ESTE ARQUIVO NÃO FOI EXECUTADO E NÃO ESTÁ REGISTRADO EM scripts/migrate.js.
 * Existe só para REVISÃO — mostrar exatamente que tabelas/colunas seriam
 * necessárias, e por quê, antes de qualquer execução real. Não rode este
 * arquivo manualmente nem o adicione ao orquestrador sem decisão explícita.
 * ============================================================================
 *
 * ATUALIZAÇÃO (Bloco 3, etapa 2): `notificacoes_historico` SAIU desta
 * proposta e virou uma migration real — ver
 * scripts/migrate-engajamento-historico.js (já executada localmente). As
 * duas tabelas abaixo continuam só propostas, ainda não implementadas.
 *
 * Por que cada tabela é necessária:
 *
 * 1) preferencias_notificacao
 *    Hoje: não existe NENHUM registro de opt-in/opt-out nem canal
 *    preferido — mandar qualquer coisa sem isso seria um risco real
 *    (spam/reclamação), por isso o Bloco 3 não envia nada de verdade ainda.
 *
 *    Colunas:
 *      usuario_id       INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE
 *                         (1 linha por usuário; cascade aqui é seguro pelo
 *                         mesmo motivo de recompensas_favoritas — é só uma
 *                         preferência, não um registro histórico)
 *      opt_in           BOOLEAN  -- NULL = "nunca perguntado" (não confundir
 *                         com false = "recusou"); o valor DEFAULT (opt-in
 *                         automático? opt-out por padrão?) é uma decisão
 *                         comercial/jurídica, não técnica — não decidido aqui.
 *      canal_preferido  VARCHAR(20)  -- nullable
 *      atualizado_em    TIMESTAMP NOT NULL DEFAULT now()
 *
 * 2) automacoes
 *    Hoje: src/services/engagement/automationRegistry.js guarda a lista em
 *    CÓDIGO (array congelado) — qualquer mudança exige deploy. Esta tabela
 *    é o que permitiria um admin futuro ativar/editar automações sem
 *    depender de um novo deploy. NÃO implementada agora porque a seção 14
 *    do pedido explicitamente pede pra não construir a interface de admin
 *    sem antes apresentar a proposta.
 *
 *    Colunas:
 *      id                    SERIAL PRIMARY KEY
 *      nome                  VARCHAR(100) NOT NULL UNIQUE
 *      evento                VARCHAR(50) NOT NULL
 *      canal                 VARCHAR(20) NOT NULL
 *      template              TEXT NOT NULL
 *      ativa                 BOOLEAN NOT NULL DEFAULT false
 *      condicoes             JSONB  -- regras extra livres, não interpretadas ainda
 *      limite_por_periodo    INTEGER   -- nullable; ver notificationHistory.js
 *      periodo_limite_horas  INTEGER   -- nullable
 *      criado_em             TIMESTAMP NOT NULL DEFAULT now()
 *      atualizado_em         TIMESTAMP NOT NULL DEFAULT now()
 *
 * Nenhum valor comercial (limite_por_periodo, periodo_limite_horas, o texto
 * de nenhum template real, quais automações ficam `ativa=true`) é definido
 * por esta proposta — todas as linhas que existissem aqui viriam com
 * `ativa=false` até o negócio decidir.
 */

// Deliberadamente sem função migrar() nem chamada de execução — isto é só
// documentação executável (os comentários acima SÃO a proposta). Se/quando
// aprovado, o código real de CREATE TABLE seguiria o mesmo padrão de
// scripts/migrate-recompensas-favoritas.js (CREATE TABLE IF NOT EXISTS,
// transação, sem inventar dado nenhum) e só então seria adicionado à lista
// MIGRATIONS de scripts/migrate.js.
