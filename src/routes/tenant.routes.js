const express = require("express");
const resolverTenantMiddleware = require("../middlewares/resolverTenantMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const { resolverFuncionalidades } = require("../services/planosFuncionalidades.service");

const router = express.Router();

/**
 * Contexto público do tenant atual — ETAPA 2 (remoção da dependência do
 * Movement, parte 2). Único propósito: dar ao frontend uma fonte OFICIAL
 * de nome/slug do tenant, em vez de o frontend "adivinhar" um nome de
 * exibição formatando o próprio slug (ver frontend/assets/js/tenant.js,
 * que antes fazia exatamente isso).
 *
 * Público de propósito (sem authMiddleware nem exigirTenantAtivoMiddleware):
 * o frontend precisa disto ANTES do login — a própria tela de login já
 * precisa mostrar o nome certo. Não expõe nada sensível: nome e slug já
 * aparecem na própria URL de convite que a Maple Tech compartilha com o
 * tenant, e `id` é só um identificador interno sequencial, sem valor de
 * exploração sozinho. `plano`/`status`/`criado_em` (metadado
 * comercial/admin da Maple Tech) ficam de fora de propósito — sem uso
 * público aqui, e sem necessidade de julgar aqui se o tenant está ativo
 * (quem bloqueia ação de negócio de um tenant inativo continua sendo
 * exigirTenantAtivoMiddleware, nas rotas que fazem alguma ação de negócio
 * de verdade — login, cadastro etc. — não nesta).
 *
 * Mesmo mecanismo de resolução de sempre (header X-Tenant-Slug / query
 * ?tenantSlug=, fallback 'movement' — ver tenantResolver.js). Isto NUNCA
 * autoriza nada: é só metadado de exibição. Autorização de dados de
 * negócio continua inteiramente em authMiddleware/roleMiddleware + RLS.
 *
 * ETAPA de identidade/configuração do tenant — resposta ganhou
 * `logoUrl`/`corPrimaria`/`telefone`/`whatsapp` (colunas novas em
 * `tenants`, ver migrate-tenant-identidade.js). Continuam de fora
 * `plano`/`status`/`criado_em` (mesmo motivo de sempre: metadado
 * comercial/admin, sem uso público aqui) e qualquer coisa de outra
 * tabela — isto é sempre só a própria linha de `tenants`.
 */
router.get(
    "/tenant/config",
    resolverTenantMiddleware,
    function (req, res) {
        res.json({
            id: req.tenant.id,
            nome: req.tenant.nome,
            slug: req.tenant.slug,
            logoUrl: req.tenant.logo_url,
            corPrimaria: req.tenant.cor_primaria,
            telefone: req.tenant.telefone,
            whatsapp: req.tenant.whatsapp
        });
    }
);

/**
 * PATCH /tenant/config NÃO existe mais — MUDANÇA DE ARQUITETURA (Etapa
 * "mover configuração do tenant para a plataforma Maple"): identidade
 * comercial (nome/cor/telefone/whatsapp) passou a ser exclusivamente
 * administrada pela Maple Tech, nunca mais pelo admin do próprio tenant.
 * Ver `PATCH /plataforma/tenants/:id` em plataforma.routes.js — mesmos
 * campos, autorização via `authPlataformaMiddleware` + `exigirEscopoPlataforma`,
 * nunca mais `authMiddleware`/`roleMiddleware("admin")`. `logoUrl` não faz
 * parte da whitelist de nenhum dos dois: não é mais editável por ninguém
 * nesta fase (ver validatePlataformaTenantEdit.js) — a coluna `logo_url`
 * continua existindo no banco (Movement ainda a usa), só não é mais
 * gravável via API.
 */

/**
 * Funcionalidades habilitadas para o tenant do usuário autenticado — etapa
 * de planos comerciais (ver src/services/planosFuncionalidades.service.js).
 * Diferente de GET /tenant/config (público, só branding): isto exige login
 * — funcionalidades habilitadas são informação de plano/negócio, não algo
 * apropriado para expor a um visitante anônimo.
 *
 * O frontend usa isto só para decidir O QUE MOSTRAR (esconder nav/botão de
 * uma funcionalidade fora do plano) — a autorização de verdade continua
 * sendo o 403 de exigirFuncionalidadeMiddleware.js em cada endpoint real;
 * mesmo que este endpoint fosse ignorado ou manipulado no cliente, nenhuma
 * ação indevida seria possível.
 */
router.get(
    "/tenant/funcionalidades",
    authMiddleware,
    async function (req, res) {
        try {
            const resolvido = await resolverFuncionalidades(req.tenant);
            res.json(resolvido);
        } catch (erro) {
            console.log(erro);

            res.status(500).json({
                mensagem: "Erro ao resolver funcionalidades do tenant"
            });
        }
    }
);

module.exports = router;
