/**
 * Serviço de e-mail — único ponto do projeto que sabe falar SMTP. Nenhum
 * controller deve montar uma mensagem de e-mail nem tocar em `nodemailer`
 * diretamente (mesmo princípio de isolamento já usado em
 * src/services/engagement/notificationService.js para WhatsApp/Email do
 * Motor de Engajamento — aliás, esta é exatamente a peça que faltava lá:
 * quando o Bloco 3 decidir conectar um canal de e-mail de verdade, é este
 * arquivo que o `emailProvider.js` de lá pode passar a chamar).
 *
 * CONFIGURAÇÃO — tudo por variável de ambiente, nunca hardcoded:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 * (`APP_BASE_URL` foi removida desta lista — ETAPA de subdomínios: a URL
 * de redefinição de senha passou a vir do próprio host da requisição, ver
 * auth.controller.js:esqueciSenha, nunca mais de uma variável de ambiente
 * fixa. Pode ser removida do ambiente/`.env` quando conveniente.)
 *
 * MODO MOCK (para dev/teste, nunca em produção com credenciais reais):
 *   Ativado automaticamente quando SMTP_HOST não está definido, ou
 *   explicitamente com EMAIL_MOCK=true. Nesse modo, NENHUMA conexão de
 *   rede é feita — o e-mail "enviado" só é guardado em memória
 *   (`listarEmailsEnviadosParaTeste`), pronto para os testes inspecionarem
 *   destinatário/assunto/conteúdo/URL sem nunca sair da máquina local.
 *
 * SEGURANÇA NOS LOGS: nunca loga o destinatário completo, o corpo da
 * mensagem (que pode conter o link com token) nem qualquer credencial —
 * só o assunto (não é dado sensível) e o tipo de erro, quando houver.
 */
const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || "Movement <no-reply@movement.local>";

const MOCK_ATIVO = process.env.EMAIL_MOCK === "true" || !SMTP_HOST;

// Só populado em modo mock — nunca em produção com SMTP real configurado.
// Usado exclusivamente pelos testes desta etapa para verificar o que
// "seria" enviado, sem mandar nada de verdade.
const emailsEnviadosParaTeste = [];

let transportadorCache = null;

function obterTransportador() {
    if (!transportadorCache) {
        transportadorCache = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT) || 587,
            // Gmail/Google Workspace: porta 465 = SSL implícito (secure:true);
            // porta 587 = STARTTLS (secure:false, upgrade automático) — a
            // configuração correta depende só da porta escolhida no ambiente.
            secure: Number(SMTP_PORT) === 465,
            auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
        });
    }

    return transportadorCache;
}

/**
 * Função genérica de envio — reutilizável por qualquer parte do sistema
 * que precise mandar e-mail no futuro (não só recuperação de senha).
 */
async function enviarEmail({ para, assunto, texto, html }) {
    if (MOCK_ATIVO) {
        emailsEnviadosParaTeste.push({ para, assunto, texto, html, enviadoEm: new Date() });
        console.log(`[email-mock] "enviado" em modo teste (nenhuma rede usada) — assunto: "${assunto}"`);
        return { sucesso: true, modo: "mock" };
    }

    try {
        await obterTransportador().sendMail({ from: SMTP_FROM, to: para, subject: assunto, text: texto, html });
        console.log(`[email] enviado via SMTP — assunto: "${assunto}"`);
        return { sucesso: true, modo: "smtp" };

    } catch (erro) {
        console.log("[email] falha ao enviar — tipo do erro:", erro.code || erro.name || "desconhecido");
        return { sucesso: false, modo: "smtp", erro: erro.message };
    }
}

/**
 * Template do e-mail de redefinição de senha — visual simples, coerente
 * com o restante do produto (sem reinventar identidade visual nova: texto
 * direto, um único botão de ação, sem gráficos).
 */
function construirEmailRedefinicaoSenha({ nome, url }) {
    const assunto = "Redefinição de senha — Movement";

    const texto = `Olá, ${nome}.\n\n`
        + "Recebemos uma solicitação para redefinir sua senha.\n\n"
        + `Acesse o link abaixo para criar uma nova senha:\n${url}\n\n`
        + "Este link expira em 60 minutos e pode ser utilizado apenas uma vez.\n\n"
        + "Se você não solicitou essa alteração, ignore este e-mail — sua senha continua a mesma.";

    const html = `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
            <h2 style="color: #E30613;">MOVEMENT</h2>
            <p>Olá, ${nome}.</p>
            <p>Recebemos uma solicitação para redefinir sua senha.</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="${url}" style="background: #E30613; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                    Redefinir minha senha
                </a>
            </p>
            <p style="font-size: 13px; color: #555;">Este link expira em 60 minutos e pode ser utilizado apenas uma vez.</p>
            <p style="font-size: 13px; color: #555;">Se você não solicitou essa alteração, ignore este e-mail — sua senha continua a mesma.</p>
        </div>
    `;

    return { assunto, texto, html };
}

async function enviarEmailRedefinicaoSenha({ para, nome, url }) {
    const { assunto, texto, html } = construirEmailRedefinicaoSenha({ nome, url });
    return enviarEmail({ para, assunto, texto, html });
}

function listarEmailsEnviadosParaTeste() {
    return emailsEnviadosParaTeste;
}

function limparEmailsDeTeste() {
    emailsEnviadosParaTeste.length = 0;
}

module.exports = {
    enviarEmail,
    enviarEmailRedefinicaoSenha,
    listarEmailsEnviadosParaTeste,
    limparEmailsDeTeste,
    MOCK_ATIVO
};
