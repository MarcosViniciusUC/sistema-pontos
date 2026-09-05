const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pool = require("./src/config/database");
const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const pointsRoutes = require("./src/routes/points.routes");
const rewardRoutes = require("./src/routes/reward.routes");
const redemptionRoutes = require("./src/routes/redemption.routes");
const errorHandler = require("./src/middlewares/errorHandler");

const app = express();

app.use(helmet());

app.use(cors({
    origin: process.env.CORS_ORIGIN
}));

app.use(express.json({ limit: "10kb" }));

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

app.get("/", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW()");

        res.json({
            mensagem: "API e banco funcionando!",
            horario: resultado.rows[0].now
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao conectar com o banco"
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        mensagem: "Rota não encontrada"
    });
});

app.use(errorHandler);

app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000");
});
