const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { normalizarCpf } = require("../utils/cpf");
const { ehIdentificadorLegado } = require("../utils/identificadoresLegado");
const { gerarTokenBruto, hashToken, MINUTOS_PARA_EXPIRAR } = require("../utils/passwordResetToken");
const emailService = require("../services/emailService");

// Hash bcrypt fixo (mesmo custo de 10 rounds usado em todos os hashes reais —
// ver cadastrar() em user.controller.js), gerado uma única vez e nunca
// recalculado em tempo de execução. É só o hash de uma senha aleatória
// qualquer, que nunca autentica ninguém — existe unicamente para dar ao
// bcrypt.compare() um trabalho computacional para fazer quando o
// CPF/identificador não é encontrado.
//
// Por quê: sem isso, "identificador não existe" retornava 401 imediatamente
// após o SELECT, enquanto "identificador existe, senha errada" só retornava
// 401 depois do bcrypt.compare() (que é lento de propósito). Essa diferença
// de tempo (dezenas de ms, medida e confirmada na auditoria de segurança)
// permite descobrir quais CPFs estão cadastrados sem nunca ler o conteúdo da
// resposta — só cronometrando quanto tempo /login demorou. Rodar o mesmo
// bcrypt.compare() nos dois caminhos (CPF normal ou identificador legado)
// iguala o custo computacional de todas as respostas.
const HASH_DUMMY_PARA_IGUALAR_TEMPO = "$2b$10$bPBRitadSGg/sShKhd9qjuuPklzIsrV2NL9szJxHhPKX1RT5bZx4W";

async function login(req, res) {
    const { cpf, senha } = req.body;

    // ETAPA 3B — req.tenantId já vem resolvido e validado como ativo por
    // resolverTenantMiddleware/exigirTenantAtivoMiddleware (ver
    // auth.routes.js), a partir de um slug explícito (header/query) ou do
    // fallback fixo 'movement'. Nunca lido do body: o cliente não escolhe
    // livremente um tenant_id, só (opcionalmente) um slug público, que
    // ainda precisa bater com uma linha real em `tenants`.
    const tenantId = req.tenantId;

    try {
        // Login normal é por CPF (coluna `cpf`, só dígitos). As 3 contas da
        // lista fechada em identificadoresLegado.js (nenhuma tem CPF
        // cadastrado, de propósito) continuam entrando pelo identificador
        // antigo, buscado por `email` — nunca as duas coisas ao mesmo tempo
        // para o mesmo valor, e nunca um fallback genérico "tenta CPF, se
        // não achar tenta email" para qualquer usuário fora dessa lista.
        //
        // AS DUAS QUERIES agora filtram também por tenant_id — email e cpf
        // são únicos só DENTRO de um tenant (ver migration da Etapa 2), então
        // sem esse filtro um usuário de outro tenant com o mesmo e-mail/CPF
        // poderia ser encontrado por engano.
        const resultado = ehIdentificadorLegado(cpf)
            ? await pool.query("SELECT * FROM usuarios WHERE email = $1 AND tenant_id = $2", [cpf, tenantId])
            : await pool.query("SELECT * FROM usuarios WHERE cpf = $1 AND tenant_id = $2", [normalizarCpf(cpf), tenantId]);

        const usuario = resultado.rows[0];

        // Sempre roda bcrypt.compare(), exista ou não o usuário — contra o
        // hash real quando existe, contra o hash dummy fixo quando não
        // existe. O resultado desse compare no ramo "sem usuário" nunca pode
        // dar match (a senha dummy não é conhecida por ninguém), então ele só
        // serve para consumir o mesmo tempo, nunca para autenticar.
        const hashParaComparar = usuario ? usuario.senha : HASH_DUMMY_PARA_IGUALAR_TEMPO;
        const senhaCorreta = await bcrypt.compare(senha, hashParaComparar);

        if (!usuario || !senhaCorreta) {
            return res.status(401).json({
                mensagem: "CPF ou senha inválidos"
            });
        }

        // tenant_id do JWT vem sempre da LINHA ENCONTRADA no banco
        // (usuario.tenant_id), nunca de req.tenantId/tenantId repetido —
        // ainda que hoje os dois valores sejam sempre iguais (a query WHERE
        // já filtrou por tenant_id = tenantId, então só pode ter achado uma
        // linha com esse mesmo tenant_id), usar o valor da linha real deixa
        // explícito que o token reflete o dado do usuário autenticado, não
        // um eco do que a requisição pediu.
        const token = jwt.sign(
            {
                id: usuario.id,
                tipo: usuario.tipo,
                tenant_id: usuario.tenant_id
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

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao realizar login"
        });
    }
}

// Resposta idêntica não importa se o e-mail existe ou não — nunca revelar
// "este e-mail não existe" (ver seção de prevenção de enumeração do
// pedido). Uma única constante garante que as duas respostas de sucesso
// sejam literalmente o mesmo objeto, nunca duas strings parecidas que
// alguém poderia comparar byte a byte e achar uma diferença por acidente.
const MENSAGEM_GENERICA_ESQUECI_SENHA = {
    mensagem: "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha."
};

/**
 * POST /login/esqueci-senha — pública, protegida por rate limit dedicado
 * (ver auth.routes.js). Recebe só `email` (nunca CPF: a recuperação é
 * sempre pelo contato de e-mail cadastrado, mesmo que o login normal seja
 * por CPF — ver seção "LEGACY ACCOUNTS" do pedido).
 *
 * Contas legadas (admin/funcio) nunca chegam a este fluxo: o valor
 * cadastrado na coluna `email` delas é o identificador literal ("admin",
 * "funcio"), que não passa no formato de e-mail exigido por
 * validateForgotPassword.js — rejeitado como 400 de formato antes mesmo de
 * consultar o banco, sem revelar nada sobre a conta. Maria (conta legada
 * com e-mail real, "maria@teste.com") É elegível normalmente — ela só é
 * exceção no LOGIN, nunca na recuperação.
 *
 * ANTI-ENUMERAÇÃO POR TEMPO: o envio de e-mail de verdade (chamada de
 * rede ao SMTP, que pode levar centenas de ms) NUNCA é aguardado antes de
 * responder — só a leitura/escrita no Postgres (rápida e de custo
 * parecido nos dois ramos) acontece antes da resposta. Sem isso, o tempo
 * de resposta sozinho já revelaria se o e-mail existe (mesmo problema já
 * corrigido no login com HASH_DUMMY_PARA_IGUALAR_TEMPO, aqui resolvido de
 * outra forma porque a operação lenta é de rede, não de CPU).
 */
async function esqueciSenha(req, res) {
    const { email } = req.body;

    // ETAPA 3B — mesmo tenant já resolvido/validado por
    // resolverTenantMiddleware/exigirTenantAtivoMiddleware (ver
    // auth.routes.js). Sem isso, "Tenant A + e-mail X" poderia encontrar um
    // usuário de outro tenant com o mesmo e-mail (e-mail é único só por
    // tenant desde a Etapa 2).
    const tenantId = req.tenantId;

    try {
        const resultado = await pool.query(
            "SELECT id, nome, email, tenant_id FROM usuarios WHERE email = $1 AND tenant_id = $2",
            [email, tenantId]
        );

        const usuario = resultado.rows[0];

        if (usuario) {
            const tokenBruto = gerarTokenBruto();
            const tokenHash = hashToken(tokenBruto);
            const expiraEm = new Date(Date.now() + MINUTOS_PARA_EXPIRAR * 60 * 1000);

            const client = await pool.connect();

            try {
                await client.query("BEGIN");

                // Invalida qualquer token anterior ainda válido deste usuário —
                // só o pedido mais recente continua utilizável.
                await client.query(
                    "UPDATE password_reset_tokens SET usado_em = NOW() WHERE usuario_id = $1 AND usado_em IS NULL",
                    [usuario.id]
                );

                // tenant_id gravado a partir de usuario.tenant_id (a linha
                // real encontrada), pelo mesmo motivo do JWT em login():
                // nunca ecoar tenantId da requisição direto, sempre o valor
                // que efetivamente pertence ao usuário do token.
                await client.query(
                    "INSERT INTO password_reset_tokens (usuario_id, token_hash, expira_em, tenant_id) VALUES ($1, $2, $3, $4)",
                    [usuario.id, tokenHash, expiraEm, usuario.tenant_id]
                );

                await client.query("COMMIT");

            } catch (erroTx) {
                await client.query("ROLLBACK");
                throw erroTx;

            } finally {
                client.release();
            }

            // ETAPA de subdomínios — a URL do e-mail usa o PRÓPRIO host da
            // requisição, nunca mais APP_BASE_URL fixo. Antes, todo tenant
            // recebia um link apontando pro mesmo host fixo (ex: sempre
            // movement.mapletech.com.br), mesmo quando quem pediu a
            // recuperação era um cliente de outro tenant (ex:
            // academiaxp.mapletech.com.br) — o link levaria pro subdomínio
            // ERRADO.
            //
            // CORREÇÃO (a primeira versão deste comentário usava
            // `req.get("host")`, que está ERRADO): `req.get(campo)` só lê o
            // cabeçalho HTTP literal — nunca passa pela lógica de
            // "trust proxy" do Express, então IGNORA `X-Forwarded-Host`
            // mesmo com `app.set("trust proxy", ...)` habilitado (ver
            // server.js) — atrás do proxy real (Render), sempre voltaria o
            // host INTERNO do proxy, nunca o subdomínio público que o
            // visitante realmente usou. `req.hostname` é a versão correta,
            // consciente de "trust proxy" — mas sempre sem a porta (nunca
            // inclui ":3000", por exemplo). Como isso importa só em
            // desenvolvimento local (produção real serve HTTPS na porta
            // 443 implícita, sem porta na URL), a porta só é adicionada
            // quando `req.protocol` é "http" — usando a porta real da
            // própria conexão TCP (`req.socket.localPort`, nunca um dado
            // vindo de fora/manipulável pelo cliente).
            const portaLocal = req.protocol === "http" && req.socket.localPort
                ? `:${req.socket.localPort}`
                : "";
            const url = `${req.protocol}://${req.hostname}${portaLocal}/redefinir-senha.html?token=${tokenBruto}`;

            // Fire-and-forget de propósito — ver comentário acima sobre
            // anti-enumeração por tempo. Erro de envio é só logado (nunca a
            // URL/token), nunca chega à resposta.
            emailService.enviarEmailRedefinicaoSenha({ para: usuario.email, nome: usuario.nome, url })
                .catch(function (erro) {
                    console.log("[auth] erro ao enviar e-mail de recuperação:", erro.message);
                });
        }

        res.json(MENSAGEM_GENERICA_ESQUECI_SENHA);

    } catch (erro) {
        console.log("[auth] erro em esqueciSenha:", erro.message);

        res.status(500).json({
            mensagem: "Erro ao processar a solicitação"
        });
    }
}

/**
 * POST /login/redefinir-senha — pública (o próprio token já prova posse do
 * e-mail). `token` chega em texto puro no body (nunca salvo assim — só o
 * hash é comparado, ver passwordResetToken.js). `senha`/`confirmar_senha`
 * já validados por validateResetPassword.js antes de chegar aqui.
 *
 * `SELECT ... FOR UPDATE` trava a linha do token dentro da transação: duas
 * tentativas simultâneas com o MESMO token nunca conseguem as duas trocar
 * a senha — a segunda só destrava depois da primeira já ter marcado
 * `usado_em`, e nesse momento a condição `usado_em IS NULL` já não bate
 * mais (mesmo padrão de concorrência já usado em
 * resgateExpiracao.service.js).
 *
 * ETAPA 3B — de propósito SEM resolverTenantMiddleware nesta rota: o único
 * credencial aqui é o `token` (256 bits, uso único), que já foi emitido em
 * esqueciSenha() para exatamente um `usuario_id`/tenant — não existe um
 * slug ou identificador ambíguo aqui para resolver, então não há tenant
 * "errado" possível de se confundir nesta operação.
 *
 * ETAPA 3C-13 (RLS) — `password_reset_tokens` continua FORA do escopo de
 * RLS desta etapa (decisão documentada no relatório: o token é localizado
 * sem nenhum contexto de tenant disponível, por desenho — o mesmo formato
 * de "ciclo" que motivou a política especial de `tenants`). Mas `usuarios`
 * TEM RLS agora, e esta função faz `UPDATE usuarios` — sem contexto, essa
 * escrita seria bloqueada (fail-closed) e a redefinição de senha quebraria
 * pra todo mundo. Ajuste mínimo: `tenant_id` já vem gravado na própria
 * linha do token (desde a Etapa 3C-12) — passa a ser lido no mesmo SELECT
 * de sempre, e um único `set_config` estabelece o contexto correto ANTES
 * do `UPDATE usuarios`, nunca um bypass (nunca teria motivo: o token já
 * identifica exatamente um usuário de um tenant real). Nenhuma outra
 * mudança de comportamento — mesmo fluxo, mesmas respostas, mesma
 * validação de expiração/uso único.
 */
async function redefinirSenha(req, res) {
    const { token, senha } = req.body;
    const tokenHash = hashToken(token);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const resultado = await client.query(
            `SELECT id, usuario_id, tenant_id FROM password_reset_tokens
             WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > NOW()
             FOR UPDATE`,
            [tokenHash]
        );

        if (resultado.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                mensagem: "Token inválido ou expirado"
            });
        }

        const registroToken = resultado.rows[0];
        const senhaHash = await bcrypt.hash(senha, 10);

        // ETAPA 3C-13 (RLS) — client próprio, fora do wrapper de
        // src/config/database.js: precisa do seu próprio set_config.
        // tenant_id vem exclusivamente da linha do token já encontrada
        // acima, nunca do body/query da requisição.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(registroToken.tenant_id)]);

        await client.query("UPDATE usuarios SET senha = $1 WHERE id = $2", [senhaHash, registroToken.usuario_id]);
        await client.query("UPDATE password_reset_tokens SET usado_em = NOW() WHERE id = $1", [registroToken.id]);

        await client.query("COMMIT");

        res.json({
            mensagem: "Senha redefinida com sucesso. Você já pode entrar com a nova senha."
        });

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log("[auth] erro em redefinirSenha:", erro.message);

        res.status(500).json({
            mensagem: "Erro ao redefinir senha"
        });

    } finally {
        client.release();
    }
}

module.exports = {
    login,
    esqueciSenha,
    redefinirSenha
};
