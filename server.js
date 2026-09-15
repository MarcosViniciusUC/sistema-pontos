const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const pointsRoutes = require("./src/routes/points.routes");
const rewardRoutes = require("./src/routes/reward.routes");
const redemptionRoutes = require("./src/routes/redemption.routes");
const adminRoutes = require("./src/routes/admin.routes");
const empresaRoutes = require("./src/routes/empresa.routes");
const favoritoRoutes = require("./src/routes/favorito.routes");
const engagementRoutes = require("./src/routes/engagement.routes");
const tenantRoutes = require("./src/routes/tenant.routes");
const plataformaRoutes = require("./src/routes/plataforma.routes");
const tenantDiagnosticoRoutes = require("./src/routes/tenantDiagnostico.routes");
const errorHandler = require("./src/middlewares/errorHandler");
const { iniciarLimpezaPeriodica } = require("./src/services/resgateExpiracao.service");
const engagementScheduler = require("./src/services/engagement/scheduler");

const app = express();

// ETAPA de preparação para subdomínios/produção — necessário para rodar
// atrás de um proxy reverso (Render, ou qualquer outro provedor real,
// sempre termina TLS num proxy na frente da aplicação). Sem isto:
//   - req.protocol sempre voltaria "http", mesmo quando o visitante usou
//     https:// de verdade (o proxy conversa com esta aplicação por HTTP
//     puro por trás) — quebraria a URL de redefinição de senha (ver
//     auth.controller.js:esqueciSenha, que monta a URL a partir de
//     req.protocol) e qualquer outro uso futuro do protocolo real;
//   - express-rate-limit (globalLimiter/loginLimiter/etc. abaixo) enxergaria
//     o IP do PRÓPRIO proxy em vez do IP de cada visitante — todo mundo
//     atrás do mesmo proxy compartilharia a MESMA cota de tentativas, um
//     único usuário abusivo bloquearia todos os outros.
// `1` (não `true`) confia em exatamente UM salto de proxy — o padrão de
// qualquer PaaS que forneça uma única camada de load balancer/proxy na
// frente da aplicação (Render, Railway, Heroku, etc.); nunca "confie em
// qualquer proxy" (`true`), que permitiria a quem fizer a requisição
// forjar o próprio IP/protocolo via cabeçalho X-Forwarded-*.
// Local (sem nenhum proxy na frente): não muda nada — sem cabeçalho
// X-Forwarded-*, o Express cai no comportamento de sempre (Host/protocolo
// da própria conexão).
app.set("trust proxy", 1);

// Mesmas diretivas padrão do Helmet, com três ajustes pontuais:
//
// - "upgrade-insecure-requests" desativada, só pra permitir acessar o
//   servidor por HTTP via IP local (ex: http://192.168.12.105:3000) durante
//   o desenvolvimento — sem isso, o navegador tentava recarregar CSS/JS por
//   HTTPS (que este servidor não expõe) e a requisição falhava em silêncio.
//
// - "script-src" ganha explicitamente os dois CDNs usados pelo frontend
//   (qrcodejs em cdnjs.cloudflare.com, jsQR em cdn.jsdelivr.net) — sem isso,
//   o padrão 'self' bloqueia esses scripts e os QR Codes/leitores de câmera
//   ficam em branco sem erro visível. Lista fechada nesses dois domínios
//   específicos (não "https:" genérico, que liberaria qualquer host HTTPS).
//
// - "img-src" ganha "https:" genérico (além do padrão 'self' data:) —
//   herdado da ETAPA de identidade do tenant, quando `tenants.logo_url`
//   ainda podia ser uma URL http(s):// arbitrária definida via API. Essa
//   coluna deixou de ser editável por qualquer rota (MUDANÇA DE
//   ARQUITETURA — configuração do tenant passou pra Maple Tech, que também
//   não a expõe em nenhum formulário — ver validatePlataformaTenantEdit.js
//   e plataformaTenant.controller.js:atualizarConfiguracao), mas a exceção
//   de CSP foi mantida de propósito: dado já gravado antes desta mudança
//   (ex: o próprio Movement, com um caminho relativo) continua precisando
//   carregar, e não há upload/edição nova que a reintroduza. Risco bem
//   menor que liberar "script-src" genérico: uma tag <img> cross-origin não
//   executa código nem lê cookies de outro site. Continua sem afetar
//   "script-src"/"connect-src"/etc, que seguem com o padrão restrito de
//   sempre.
//
// Todas as outras diretivas e as demais proteções do Helmet (HSTS,
// X-Frame-Options, etc.) continuam nos valores padrão, sem nenhuma mudança.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "upgrade-insecure-requests": null,
            "script-src": ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "https:"]
        }
    }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN
}));

// Limite maior só para /recompensas — é a única rota que aceita imagem
// (base64 embutido no JSON, ver reward.controller.js). Montado ANTES do
// limite geral abaixo: o body-parser marca a requisição como "já lida" na
// primeira vez que roda, então o express.json({limit:"10kb"}) seguinte vira
// um no-op para esse caminho e não rejeita o body maior. Todas as outras
// rotas continuam exatamente com os mesmos 10kb de antes.
app.use("/recompensas", express.json({ limit: "6mb" }));

app.use(express.json({ limit: "10kb" }));

// Serve o frontend estático (caminho absoluto via __dirname, não depende do
// diretório de onde o processo é iniciado). express.static já resolve "/"
// e "/index.html" para frontend/index.html automaticamente, além de servir
// o resto dos arquivos (assets/js, assets/css etc.) pelo mesmo caminho.
//
// Fica ANTES do rate limiter da API de propósito: uma única carga de página
// já dispara ~10-15 requisições (HTML + CSS + JS + fontes), e isso não deve
// disputar a mesma cota que existe para conter abuso da API. Continua
// protegido pelos headers do Helmet e pelo CORS acima — só não entra na
// contagem do globalLimiter, que agora se aplica só às rotas da API.
app.use(express.static(path.join(__dirname, "frontend")));

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(globalLimiter);

app.use(authRoutes);
app.use(userRoutes);
app.use(pointsRoutes);
app.use(rewardRoutes);
app.use(redemptionRoutes);
app.use(adminRoutes);
app.use(empresaRoutes);
app.use(favoritoRoutes);
app.use(engagementRoutes);

// ETAPA 2 (remoção da dependência do Movement, parte 2) — GET /tenant/config,
// única fonte oficial de nome/slug do tenant atual para o frontend. Ver
// src/routes/tenant.routes.js.
app.use(tenantRoutes);

// ETAPA 3C-8 — autenticação de PLATAFORMA (Maple Tech), separada da
// autenticação de tenant (authRoutes acima). Só a rota de login existe
// nesta etapa (ver plataforma.routes.js) — nenhum painel visual, nenhuma
// outra rota de plataforma ainda.
app.use(plataformaRoutes);

// Rota de DIAGNÓSTICO da ETAPA 3A (fundação multi-tenant) — só prova que a
// camada resolverTenant/exigirTenantAtivo funciona ponta a ponta (ver
// src/routes/tenantDiagnostico.routes.js). Nenhuma rota de negócio acima
// foi alterada; nenhum controller passou a usar req.tenantId ainda.
app.use(tenantDiagnosticoRoutes);

app.use((req, res) => {
    res.status(404).json({
        mensagem: "Rota não encontrada"
    });
});

app.use(errorHandler);

// ETAPA de preparação para produção — a maioria dos provedores reais
// (Render incluso) atribui a porta dinamicamente via a variável de ambiente
// PORT e espera a aplicação escutar exatamente nela; escutar sempre em 3000
// faria a plataforma nunca conseguir rotear tráfego pra este processo.
// `|| 3000` preserva 100% do comportamento local de sempre (sem PORT
// definida no .env, continua escutando em 3000).
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Mecanismo A da expiração de resgates pendentes (5h) — roda uma vez
// imediatamente e depois a cada 5 minutos enquanto o processo estiver de
// pé. O mecanismo B (verificação sob demanda) vive em
// redemption.controller.js e admin.controller.js — ver
// src/services/resgateExpiracao.service.js para a regra completa.
iniciarLimpezaPeriodica();

// Scheduler do Motor de Engajamento (modo SIMULAÇÃO) — chamado sempre, mas
// só agenda algo de verdade se ENGAGEMENT_SCHEDULER_ENABLED=true estiver no
// ambiente (default: desligado — ver src/services/engagement/schedulerConfig.js).
// Nunca envia nada real, não importa o valor desta variável.
engagementScheduler.iniciar();
