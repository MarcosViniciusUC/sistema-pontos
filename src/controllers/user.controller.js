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
    const { nome, email, senha, telefone } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        let usuarioCriado = null;

        for (let tentativa = 0; tentativa < MAX_TENTATIVAS_QR_TOKEN && !usuarioCriado; tentativa++) {
            const qrToken = gerarQrTokenUsuario();

            await client.query("SAVEPOINT tentativa_qr_token");

            try {
                const resultado = await client.query(
                    `INSERT INTO usuarios (nome, email, senha, telefone, tipo, qr_token)
                     VALUES ($1, $2, $3, $4, 'cliente', $5)
                     RETURNING id, nome, email, telefone`,
                    [nome, email, senhaHash, telefone, qrToken]
                );

                await client.query("RELEASE SAVEPOINT tentativa_qr_token");
                usuarioCriado = resultado.rows[0];

            } catch (erroInsercao) {
                await client.query("ROLLBACK TO SAVEPOINT tentativa_qr_token");

                if (erroInsercao.code === "23505" && erroInsercao.constraint === "usuarios_email_key") {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        mensagem: "Este email já está cadastrado"
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
 */
async function meuPerfil(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, telefone, qr_token
             FROM usuarios
             WHERE id = $1`,
            [req.usuario.id]
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
 * Filtrada a tipo='cliente': é o que a tela de clientes (e a busca manual
 * de admin-identificar-cliente.js) sempre fizeram no frontend mesmo antes
 * desta mudança — trazer também admin/funcionário nunca foi usado por
 * ninguém, então filtrar aqui só reduz o que trafega, sem quebrar nada.
 * Também é o que torna "pontos" abaixo coerente: saldo de pontos só faz
 * sentido pra cliente.
 *
 * "pontos" nunca vem de uma coluna fixa — é somado a partir de
 * movimentacoes_pontos numa única consulta (LEFT JOIN + agregação), sem
 * uma query por cliente. Cliente sem nenhuma movimentação cai no LEFT JOIN
 * sem linha correspondente e o COALESCE resolve pra 0.
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
             WHERE u.tipo = 'cliente'
             GROUP BY u.id
             ORDER BY u.criado_em DESC`
        );

        const clientes = resultado.rows.map(function (linha) {
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

        res.json(clientes);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: "Erro ao listar usuários"
        });
    }
}

async function atualizar(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            mensagem: "ID inválido"
        });
    }

    // Somente estes três campos podem ser editados por este endpoint.
    // "tipo" e "senha" nunca são lidos daqui, mesmo que enviados no body —
    // não existe caminho de código que os leve até a query.
    const { nome, email, telefone } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE usuarios
             SET nome = COALESCE($1, nome),
                 email = COALESCE($2, email),
                 telefone = COALESCE($3, telefone)
             WHERE id = $4
             RETURNING id, nome, email, telefone, tipo, qr_token, criado_em`,
            [nome ?? null, email ?? null, telefone ?? null, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json(resultado.rows[0]);

    } catch (erro) {
        console.log(erro);

        if (erro.code === "23505") {
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
            `SELECT id, nome, email, telefone
             FROM usuarios
             WHERE qr_token = $1 AND tipo = 'cliente'`,
            [qr_token]
        );

        if (usuarioResultado.rows.length === 0) {
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
               AND (nome ILIKE $1 OR email ILIKE $1)
             ORDER BY nome
             LIMIT 20`,
            [`%${termo}%`]
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
