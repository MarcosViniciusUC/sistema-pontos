const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { gerarQrTokenUsuario } = require("../utils/qrTokenUsuario");

const MAX_TENTATIVAS_QR_TOKEN = 5;

/**
 * Cadastra um cliente novo, sempre com um qr_token gerado pelo backend
 * (crypto.randomBytes — nunca Math.random, nunca derivado do id ou de
 * outro dado do usuário). A colisão de qr_token é praticamente impossível
 * (256 bits de entropia), mas, se acontecer, a transação tenta de novo com
 * um token novo em vez de falhar o cadastro inteiro — mesmo padrão de
 * SAVEPOINT já usado para o código de reserva de resgates.
 */
async function cadastrar(req, res) {
    // cpf já chega normalizado (só dígitos) e validado por validateUser.js —
    // o controller nunca recebe/grava a versão com pontuação.
    const { nome, email, senha, telefone, cpf } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);

    // ETAPA 3B — tenant vem do CONTEXTO da requisição (resolvido/validado
    // por resolverTenantMiddleware/exigirTenantAtivoMiddleware em
    // user.routes.js), nunca de um campo do body: o cliente não escolhe
    // livremente em qual tenant a conta é criada. Gravado explicitamente na
    // criação para não depender do DEFAULT temporário de compatibilidade
    // (ver migrate-tenant-id-default-temporario.js) — esse DEFAULT continua
    // existindo só para escritas que ainda não têm contexto de tenant
    // disponível, o que já não é mais o caso deste endpoint.
    const tenantId = req.tenantId;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        let usuarioCriado = null;

        for (let tentativa = 0; tentativa < MAX_TENTATIVAS_QR_TOKEN && !usuarioCriado; tentativa++) {
            const qrToken = gerarQrTokenUsuario();

            await client.query("SAVEPOINT tentativa_qr_token");

            try {
                const resultado = await client.query(
                    `INSERT INTO usuarios (nome, email, senha, telefone, tipo, qr_token, cpf, tenant_id)
                     VALUES ($1, $2, $3, $4, 'cliente', $5, $6, $7)
                     RETURNING id, nome, email, telefone`,
                    [nome, email, senhaHash, telefone, qrToken, cpf, tenantId]
                );

                await client.query("RELEASE SAVEPOINT tentativa_qr_token");
                usuarioCriado = resultado.rows[0];

            } catch (erroInsercao) {
                await client.query("ROLLBACK TO SAVEPOINT tentativa_qr_token");

                // Nomes de constraint atualizados na Etapa 2 para incluir o
                // tenant (email/cpf agora são únicos só DENTRO de um
                // tenant, não mais globalmente) — os nomes antigos
                // (usuarios_email_key/usuarios_cpf_key) não existem mais no
                // schema desde então; corrigido aqui junto com o resto
                // desta etapa por estar na mesma função.
                if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_email_key") {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        mensagem: "Este email já está cadastrado"
                    });
                }

                if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_tenant_cpf_key") {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        mensagem: "Este CPF já está cadastrado"
                    });
                }

                const foiColisaoDeQrToken = erroInsercao.code === "23505"
                    && erroInsercao.constraint === "usuarios_qr_token_key";

                if (!foiColisaoDeQrToken) {
                    throw erroInsercao;
                }
                // colisão de qr_token (extremamente improvável): tenta de
                // novo com um token novo, sem perder o restante da transação.
            }
        }

        if (!usuarioCriado) {
            await client.query("ROLLBACK");
            return res.status(500).json({
                mensagem: "Não foi possível gerar um identificador único para o cliente. Tente novamente."
            });
        }

        await client.query("COMMIT");
        res.status(201).json(usuarioCriado);

    } catch (erro) {
        await client.query("ROLLBACK");
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao cadastrar usuário"
        });

    } finally {
        client.release();
    }
}

/**
 * Perfil do próprio usuário autenticado (qualquer papel) — sempre filtrado
 * por req.usuario.id, vindo do token, nunca por um id recebido do cliente.
 * Existe porque, antes disso, não havia nenhuma forma do próprio usuário
 * obter nome/email/telefone/qr_token depois do login (o JWT só carrega id
 * e tipo) — necessário para a tela de Perfil do cliente exibir o cabeçalho
 * e o próprio QR Code sem depender de GET /usuarios (admin-only, lista
 * todo mundo). Nunca inclui a coluna senha.
 *
 * ETAPA 3C-1 — também filtrado por tenant_id (req.usuario.tenant_id, do
 * JWT, nunca de body/query/params). Na prática, `id` já é chave primária e
 * sozinho bastaria para identificar a linha certa — mas não confiar só
 * nisso aqui é deliberado: se um JWT antigo/corrompido/de outro tenant
 * algum dia carregasse um `id` que hoje pertence a outro tenant (não deve
 * acontecer com o fluxo normal de login, que sempre grava o tenant_id real
 * do usuário encontrado), a dupla condição garante que a resposta nunca
 * "vaza" dados de um usuário de outro tenant só porque o id bateu.
 */
async function meuPerfil(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, telefone, qr_token
             FROM usuarios
             WHERE id = $1 AND tenant_id = $2`,
            [req.usuario.id, req.usuario.tenant_id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar perfil"
        });
    }
}

/**
 * Só é chamada com roleMiddleware("admin") (ver routes) — por isso pode
 * incluir qr_token na resposta: é o identificador que o admin usa para
 * gerar o QR Code de cada cliente na tela de clientes. Não é um dado
 * sensível como senha; ele existe justamente para ser exibido/escaneado.
 *
 * Traz TODOS os tipos de usuário (cliente, funcionario, admin) — antes só
 * devolvia tipo='cliente', mas a tela de administração de usuários
 * (admin-clientes.js) precisa listar todo mundo com o tipo visível. A
 * busca manual de admin-identificar-cliente.js continua filtrando para
 * cliente no próprio frontend (não depende deste filtro ter existido aqui).
 *
 * "pontos" nunca vem de uma coluna fixa — é somado a partir de
 * movimentacoes_pontos numa única consulta (LEFT JOIN + agregação), sem
 * uma query por cliente. Usuário sem nenhuma movimentação (o caso normal
 * para admin/funcionário, que não têm saldo de fidelidade) cai no LEFT
 * JOIN sem linha correspondente e o COALESCE resolve pra 0.
 *
 * ETAPA 3C-1 — filtrado por `u.tenant_id = req.usuario.tenant_id` (do JWT
 * do admin autenticado, nunca de body/query/params). Antes desta etapa a
 * query não tinha WHERE nenhum — listava usuários de TODOS os tenants.
 * Continua trazendo todos os `tipo` (cliente/funcionario/admin), só o
 * escopo por tenant mudou, exatamente como antes desta etapa.
 */
async function listar(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT
                u.id, u.nome, u.email, u.telefone, u.tipo, u.qr_token, u.criado_em,
                COALESCE(SUM(
                    CASE
                        WHEN mp.tipo = 'entrada' THEN mp.quantidade
                        WHEN mp.tipo = 'saida' THEN -mp.quantidade
                    END
                ), 0) AS pontos
             FROM usuarios u
             LEFT JOIN movimentacoes_pontos mp ON mp.usuario_id = u.id
             WHERE u.tenant_id = $1
             GROUP BY u.id
             ORDER BY u.criado_em DESC`,
            [req.usuario.tenant_id]
        );

        const usuarios = resultado.rows.map(function (linha) {
            return {
                id: linha.id,
                nome: linha.nome,
                email: linha.email,
                telefone: linha.telefone,
                tipo: linha.tipo,
                qr_token: linha.qr_token,
                criado_em: linha.criado_em,
                pontos: Number(linha.pontos)
            };
        });

        res.json(usuarios);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar usuários"
        });
    }
}

/**
 * ETAPA 3C-1 — `WHERE id = $5 AND tenant_id = $6` (tenant_id sempre de
 * req.usuario.tenant_id, nunca de body/query/params). Antes desta etapa o
 * UPDATE filtrava só por `id` — um admin do Tenant A que soubesse (ou
 * adivinhasse) o id de um usuário do Tenant B conseguiria editá-lo. Um id
 * de outro tenant agora simplesmente não bate com nenhuma linha (0 rows
 * afetadas) e cai no mesmo 404 genérico de "não existe" — nunca revela que
 * aquele id pertence a outro tenant.
 */
async function atualizar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    // Somente estes quatro campos podem ser editados por este endpoint.
    // "tipo" e "senha" nunca são lidos daqui, mesmo que enviados no body —
    // não existe caminho de código que os leve até a query. "cpf" já chega
    // normalizado (só dígitos) e validado por validateUserUpdate.js.
    const { nome, email, telefone, cpf } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE usuarios
             SET nome = COALESCE($1, nome),
                 email = COALESCE($2, email),
                 telefone = COALESCE($3, telefone),
                 cpf = COALESCE($4, cpf)
             WHERE id = $5 AND tenant_id = $6
             RETURNING id, nome, email, telefone, tipo, qr_token, criado_em`,
            [nome ?? null, email ?? null, telefone ?? null, cpf ?? null, id, req.usuario.tenant_id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        // Nomes de constraint corrigidos aqui pelo mesmo motivo já
        // documentado em cadastrar(): renomeados na Etapa 2 para incluir o
        // tenant, nunca ajustados neste controller até agora — o nome
        // antigo "usuarios_cpf_key" não existe mais, então a checagem de
        // CPF nunca disparava e toda colisão (CPF ou email) caía na
        // mensagem genérica de email.
        if (erro.code === "23505" && erro.constraint === "usuarios_tenant_cpf_key") {
            return res.status(409).json({
                mensagem: "Este CPF já está cadastrado"
            });
        }

        if (erro.code === "23505" && erro.constraint === "usuarios_tenant_email_key") {
            return res.status(409).json({
                mensagem: "Este email já está cadastrado"
            });
        }

        res.status(500).json({
            mensagem: "Erro ao atualizar usuário"
        });
    }
}

/**
 * Identifica um cliente pelo qr_token individual (QR Code do próprio
 * cliente, diferente do código de resgate). Só admin/funcionário (ver
 * roleMiddleware na rota) — um cliente nunca tem acesso a este endpoint,
 * então não há como ele consultar dados de outro cliente por aqui.
 *
 * O saldo nunca é lido de uma coluna fixa — é sempre recalculado a partir
 * de movimentacoes_pontos, mesma regra usada em pontos.controller.js.
 *
 * Campo email só entra na resposta para admin. Funcionário só precisa de
 * nome/telefone/saldo pra atender o cliente no balcão — email é um dado a
 * mais que ele não usa nesse fluxo, então o backend nem devolve (não é só
 * uma questão de esconder no frontend).
 *
 * ETAPA 3C-1 — `qr_token` continua GLOBALMENTE único de propósito (ver
 * plano de migração: no momento de escanear um QR ainda não se sabe a
 * priori de qual tenant ele é, então a busca inicial não pode filtrar por
 * tenant_id). A estratégia é buscar global e só DEPOIS comparar
 * `usuario.tenant_id` com `req.usuario.tenant_id`: se não bater, a resposta
 * é o mesmo 404 genérico de "não encontrado" usado para QR inexistente —
 * nunca uma mensagem diferente que revelasse "esse QR existe, mas é de
 * outro tenant". A consulta de saldo só roda DEPOIS dessa comparação, para
 * nunca calcular (nem expor por timing) o saldo de um cliente de outro
 * tenant.
 */
async function buscarPorQrToken(req, res) {
    const { qr_token } = req.params;

    if (typeof qr_token !== "string" || qr_token.trim().length === 0 || qr_token.length > 128) {
        return res.status(400).json({
            mensagem: "qr_token inválido"
        });
    }

    try {
        const usuarioResultado = await pool.query(
            `SELECT id, nome, email, telefone, tenant_id
             FROM usuarios
             WHERE qr_token = $1 AND tipo = 'cliente'`,
            [qr_token]
        );

        if (usuarioResultado.rows.length === 0 || usuarioResultado.rows[0].tenant_id !== req.usuario.tenant_id) {
            return res.status(404).json({
                mensagem: "Cliente não encontrado para este QR Code"
            });
        }

        const usuario = usuarioResultado.rows[0];

        const saldoResultado = await pool.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN tipo = 'entrada' THEN quantidade
                    WHEN tipo = 'saida' THEN -quantidade
                END
            ), 0) AS saldo
             FROM movimentacoes_pontos
             WHERE usuario_id = $1`,
            [usuario.id]
        );

        const resposta = {
            id: usuario.id,
            nome: usuario.nome,
            telefone: usuario.telefone,
            saldo: Number(saldoResultado.rows[0].saldo)
        };

        if (req.usuario.tipo === "admin") {
            resposta.email = usuario.email;
        }

        res.json(resposta);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao consultar cliente"
        });
    }
}

/**
 * Busca manual de cliente por nome/email (fallback do fluxo de
 * identificação quando não há QR à mão) — usada por admin e funcionário.
 * Bem mais restrita que listar(): só devolve id/nome/email/qr_token de
 * CLIENTES (nunca telefone, tipo, criado_em, nem outros funcionários ou
 * admins), então dá pra liberar pra funcionário sem expor a listagem
 * administrativa completa que GET /usuarios devolve.
 *
 * ETAPA 3C-1 — filtrado também por `tenant_id = req.usuario.tenant_id` (do
 * JWT de quem está buscando, nunca de query/body). Antes desta etapa um
 * funcionário do Tenant A conseguia encontrar (e depois lançar pontos
 * para) um cliente do Tenant B só sabendo nome/e-mail dele.
 */
async function buscarCliente(req, res) {
    const termo = typeof req.query.termo === "string" ? req.query.termo.trim() : "";

    if (!termo) {
        return res.status(400).json({
            mensagem: "Informe um termo de busca"
        });
    }

    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, qr_token
             FROM usuarios
             WHERE tipo = 'cliente'
               AND tenant_id = $1
               AND (nome ILIKE $2 OR email ILIKE $2)
             ORDER BY nome
             LIMIT 20`,
            [req.usuario.tenant_id, `%${termo}%`]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao buscar cliente"
        });
    }
}

module.exports = {
    cadastrar,
    meuPerfil,
    listar,
    atualizar,
    buscarPorQrToken,
    buscarCliente
};
