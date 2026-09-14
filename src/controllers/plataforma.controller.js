const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const requestContext = require("../config/requestContext");

/**
 * Login de administrador de PLATAFORMA (Maple Tech) — consulta
 * EXCLUSIVAMENTE `admins_plataforma`, nunca `usuarios`. Sem qualquer
 * relação com tenant: não resolve slug, não lê `tenant_id` de lugar
 * nenhum, não usa `resolverTenantMiddleware`. Um admin de plataforma não
 * pertence a nenhum tenant específico.
 *
 * Mesmo hash dummy fixo do login de tenant (ver auth.controller.js), pelo
 * mesmo motivo: sem ele, "email não existe" responderia mais rápido que
 * "email existe, senha errada", permitindo descobrir emails cadastrados só
 * cronometrando a resposta. Constante própria (não reaproveita a de
 * auth.controller.js, que não é exportada) — mesmo custo de bcrypt (10
 * rounds), mesmo princípio.
 */
const HASH_DUMMY_PARA_IGUALAR_TEMPO = "$2b$10$bPBRitadSGg/sShKhd9qjuuPklzIsrV2NL9szJxHhPKX1RT5bZx4W";

/**
 * JWT de plataforma contém SOMENTE `{ id, escopo: "plataforma" }` — nunca
 * `tenant_id`, nunca `tipo`. `escopo` nunca vem do body/query — é sempre a
 * string literal fixa abaixo, sinalizando que o token é de plataforma.
 * Mesmo `expiresIn` do login de tenant (1h — ver auth.controller.js), pelo
 * mesmo motivo de sempre: sessão curta, sem uma decisão de prazo diferente
 * criada aqui sem necessidade.
 *
 * ETAPA 3C-13 (RLS) — `admins_plataforma` tem RLS bypass-only, inclusive
 * para SELECT (ver migrate-rls-admins-plataforma.js): sem contexto, a
 * busca por email abaixo nunca encontraria nenhuma linha, e login de
 * plataforma pararia de funcionar por completo. Bypass é ativado aqui
 * DENTRO DESTE CONTROLLER — não existe (e não deve existir) um middleware
 * genérico de bypass antes desta rota: ainda não há JWT nenhum neste
 * ponto, então não há o que autenticar antes. A justificativa de
 * segurança não é "o request provou algo" — é que este código só é
 * alcançável através de `plataforma.routes.js`, nunca de nenhuma rota de
 * tenant; nenhum tenant autenticado tem como fazer este arquivo rodar.
 * Bypass nunca é lido de `req` (nem aqui, nem em lugar nenhum do projeto)
 * — é sempre um valor fixo, decidido pelo código, nunca por header, body,
 * query string ou parâmetro de URL.
 */
async function login(req, res) {
    const { email, senha } = req.body;

    try {
        await requestContext.runAsBypass(async () => {
            const resultado = await pool.query(
                "SELECT * FROM admins_plataforma WHERE email = $1",
                [email]
            );

            const admin = resultado.rows[0];

            const hashParaComparar = admin ? admin.senha : HASH_DUMMY_PARA_IGUALAR_TEMPO;
            const senhaCorreta = await bcrypt.compare(senha, hashParaComparar);

            if (!admin || !senhaCorreta) {
                return res.status(401).json({
                    mensagem: "Email ou senha inválidos"
                });
            }

            const token = jwt.sign(
                {
                    id: admin.id,
                    escopo: "plataforma"
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "1h"
                }
            );

            res.json({
                mensagem: "Login realizado com sucesso",
                token: token
            });
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao realizar login"
        });
    }
}

module.exports = { login };
