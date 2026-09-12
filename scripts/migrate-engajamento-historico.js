/**
 * Migração: tabela `notificacoes_historico` — persistência real do histórico
 * de notificações do Motor de Engajamento (Bloco 3), substituindo o array em
 * memória de src/services/engagement/notificationHistory.js.
 *
 * Por que agora: a regra "no máximo 1 mensagem de automação por usuário a
 * cada 7 dias corridos" (única regra de frequência autorizada nesta etapa)
 * PRECISA sobreviver a reinício de processo/deploy — em memória, um restart
 * do Render apagaria o histórico e qualquer usuário poderia receber
 * mensagens de novo antes da hora.
 *
 * O que muda:
 *   - nova tabela `notificacoes_historico` (usuario_id, evento,
 *     automacao_nome, canal, status, mensagem, erro,
 *     identificador_externo, criado_em).
 *   - `status` restrito por CHECK a exatamente 3 valores: 'enviado',
 *     'falhou', 'bloqueado_por_limite' — só 'enviado' conta para a regra
 *     de 7 dias (ver notificationHistory.js:tentarEnviarComLimiteGlobal).
 *   - índice composto (usuario_id, status, criado_em), que é exatamente a
 *     consulta que a checagem de limite global faz.
 *
 * Nenhuma tabela/coluna existente é alterada. Nenhuma linha é apagada.
 * A concorrência na regra de 7 dias é garantida por pg_advisory_xact_lock
 * no momento de gravar (ver notificationHistory.js), não por nada nesta
 * migração — o índice aqui é só performance da consulta, a correção vem do
 * lock.
 *
 * Uso: node scripts/migrate-engajamento-historico.js
 */
const pool = require("../src/config/database");

async function migrar() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("1) Criando tabela 'notificacoes_historico'...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS notificacoes_historico (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                evento VARCHAR(50) NOT NULL,
                automacao_nome VARCHAR(100),
                canal VARCHAR(20),
                status VARCHAR(20) NOT NULL CHECK (status IN ('enviado', 'falhou', 'bloqueado_por_limite')),
                mensagem TEXT,
                erro TEXT,
                identificador_externo VARCHAR(255),
                criado_em TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        console.log("2) Criando índice de apoio à regra de 7 dias (usuario_id, status, criado_em)...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS notificacoes_historico_usuario_status_criado_idx
            ON notificacoes_historico (usuario_id, status, criado_em)
        `);

        await client.query("COMMIT");
        console.log("\nMigração concluída com sucesso.");

    } catch (erro) {
        await client.query("ROLLBACK");
        console.error("\nErro durante a migração — nada foi alterado (ROLLBACK):", erro.message);
        process.exitCode = 1;

    } finally {
        client.release();
    }
}

migrar().finally(() => {
    pool.end();
});
