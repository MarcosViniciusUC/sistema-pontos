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
const errorHandler = require("./src/middlewares/errorHandler");
const { iniciarLimpezaPeriodica } = require("./src/services/resgateExpiracao.service");

const app = express();

// Mesmas diretivas padrão do Helmet, com dois ajustes pontuais:
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
// Todas as outras diretivas e as demais proteções do Helmet (HSTS,
// X-Frame-Options, etc.) continuam nos valores padrão, sem nenhuma mudança.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "upgrade-insecure-requests": null,
            "script-src": ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"]
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

app.use((req, res) => {
    res.status(404).json({
        mensagem: "Rota não encontrada"
    });
});

app.use(errorHandler);

app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000");
});

// Mecanismo A da expiração de resgates pendentes (5h) — roda uma vez
// imediatamente e depois a cada 5 minutos enquanto o processo estiver de
// pé. O mecanismo B (verificação sob demanda) vive em
// redemption.controller.js e admin.controller.js — ver
// src/services/resgateExpiracao.service.js para a regra completa.
iniciarLimpezaPeriodica();
