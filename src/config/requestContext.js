/**
 * Contexto de tenant/bypass por requisição — ETAPA 3C-13 (RLS).
 *
 * Usa `AsyncLocalStorage` (nativo do Node, `async_hooks`) para carregar
 * `{ tenantId, bypass }` implicitamente por toda a cadeia assíncrona de uma
 * requisição, sem precisar passar esse valor manualmente por parâmetro em
 * cada função/controller. `src/config/database.js` lê esse contexto para
 * decidir o que informar ao Postgres (`set_config`) antes de cada query.
 *
 * SÓ EXISTEM DUAS FORMAS DE ENTRAR NUM CONTEXTO — de propósito, não há
 * nenhuma função genérica tipo `setContext({ tenantId, bypass })` que
 * aceitaria os dois valores ao mesmo tempo:
 *
 *   - runAsTenant(tenantId, fn)  -> sempre { tenantId, bypass: false }
 *   - runAsBypass(fn)            -> sempre { tenantId: null, bypass: true }
 *
 * Isso torna "tenant" e "bypass" estruturalmente mutuamente exclusivos —
 * não é uma regra que o chamador precisa lembrar de respeitar, é a única
 * coisa que a API deste módulo permite construir. Nenhuma das duas funções
 * lê nada de `req` diretamente (não dependem de Express) — quem decide o
 * valor é sempre o código que já validou a autenticação (authMiddleware.js,
 * authPlataformaMiddleware.js, o controller de login de plataforma, ou um
 * job interno como scheduler.js/resgateExpiracao.service.js), nunca um
 * dado bruto de request.
 *
 * FAIL-CLOSED por padrão: `getContext()` fora de qualquer `runAsTenant`/
 * `runAsBypass` devolve `null` — nunca um valor "neutro" tipo tenant 1 ou
 * bypass implícito. `database.js` trata `null` como "não define nenhuma
 * variável de sessão", e as políticas RLS (ver migrate-rls-*.js) já tratam
 * ausência de variável como acesso negado, nunca como acesso liberado.
 *
 * Uso típico:
 *   requestContext.runAsTenant(usuario.tenant_id, () => next());   // authMiddleware.js
 *   requestContext.runAsBypass(() => next());                      // authPlataformaMiddleware.js
 *   requestContext.runAsBypass(() => executarRodada());            // scheduler.js
 */
const { AsyncLocalStorage } = require("async_hooks");

const armazenamento = new AsyncLocalStorage();

function runAsTenant(tenantId, fn) {
    if (!Number.isInteger(tenantId)) {
        throw new Error("requestContext.runAsTenant: tenantId precisa ser um número inteiro");
    }

    return armazenamento.run({ tenantId, bypass: false }, fn);
}

function runAsBypass(fn) {
    return armazenamento.run({ tenantId: null, bypass: true }, fn);
}

// Nunca lançar/assumir um padrão aqui — `null` é o valor correto e
// esperado para "nenhum contexto definido", e quem consome isto
// (database.js) precisa tratar esse caso explicitamente como "sem
// variável de sessão nenhuma", nunca como erro nem como um tenant/bypass
// implícito.
function getContext() {
    return armazenamento.getStore() || null;
}

module.exports = { runAsTenant, runAsBypass, getContext };
