/**
 * "Tenant atual" do frontend — camada única que decide, em qualquer
 * página, para qual tenant esta tela está falando, e busca os dados
 * OFICIAIS desse tenant (nome/slug/id) direto do backend.
 *
 * Isto é SÓ contexto de UX/exibição (que nome mostrar no cabeçalho, qual
 * slug mandar como dica de tenant numa chamada pública). Nunca é usado
 * como fonte de autorização — quem decide de verdade o que cada usuário
 * pode ver/fazer continua sendo o backend, via JWT (tenant_id embutido no
 * token) e RLS no banco. Ver src/services/tenantResolver.js.
 *
 * ETAPA 2 — antes, o "nome" do tenant era só o slug formatado como título
 * (ex: "academia-xp" -> "Academia Xp"), um palpite do frontend. Agora
 * existe GET /tenant/config (rota pública, ver src/routes/tenant.routes.js)
 * como fonte OFICIAL — o nome real cadastrado pela Maple Tech, nunca
 * inventado/derivado aqui.
 *
 * ETAPA 3 (subdomínio) — o slug agora é lido primeiro do PRÓPRIO hostname
 * da página (`academia-x.mapletech.com.br` ou, em teste local,
 * `academia-x.localhost` — ver `obterSlugDoHostname` abaixo, mesmo
 * conjunto de domínios-base que `tenantResolver.js` no backend; mantenha
 * os dois sincronizados se algum dia mudar). `?tenantSlug=` e o slug
 * salvo da sessão logada continuam existindo como fallback de
 * desenvolvimento/compatibilidade — quem realmente decide o tenant de
 * cada requisição sempre foi (e continua sendo) o backend; isto aqui só
 * evita mandar um `?tenantSlug=` desatualizado quando o hostname já diz
 * tudo.
 */
(function () {
    const SLUG_PADRAO = "movement";

    // Mesma lista/mesmo critério de src/services/tenantResolver.js —
    // ver o comentário lá para o motivo de cada entrada.
    const DOMINIOS_BASE_SUBDOMINIO = ["mapletech.com.br", "mapletech.local", "localhost"];

    // Só para exibição (rótulo/marca na tela) depois do login — nunca para
    // autorização. Guardado em sessionStorage (não localStorage) e somente
    // dentro da mesma aba/sessão: some ao fechar a aba e é limpo no
    // logout, então nunca sobrevive para "vazar" num login seguinte.
    const SLUG_SESSAO_KEY = "movement_tenant_slug_exibicao";

    /**
     * Extrai o slug do hostname ATUAL da página (window.location.hostname),
     * espelhando exatamente a mesma lógica do backend (obterSlugDoHostname
     * em tenantResolver.js) — só o primeiro rótulo de um subdomínio de
     * DOMINIOS_BASE_SUBDOMINIO conta; qualquer outro caso (domínio atual do
     * Render, "localhost" puro, IP, subdomínio com mais de um nível) retorna
     * `null`, sem quebrar nada.
     */
    function obterSlugDoHostname() {
        const hostname = (window.location.hostname || "").toLowerCase();

        for (const dominioBase of DOMINIOS_BASE_SUBDOMINIO) {
            const sufixo = "." + dominioBase;

            if (hostname.length > sufixo.length && hostname.endsWith(sufixo)) {
                const subdominio = hostname.slice(0, -sufixo.length);
                return subdominio.length > 0 && !subdominio.includes(".") ? subdominio : null;
            }
        }

        return null;
    }

    function obterSlugDaUrl() {
        return new URLSearchParams(window.location.search).get("tenantSlug") || null;
    }

    /**
     * Slug do tenant "ativo" nesta tela, nesta ordem:
     *   1) hostname da página atual (ex: academia-x.localhost) — sempre
     *      vence quando presente, é a fonte de mais alta prioridade (mesma
     *      ordem do backend);
     *   2) ?tenantSlug= na URL atual (ex: link que a Maple Tech manda para
     *      o tenant novo em ambiente sem subdomínio ainda:
     *      index.html?tenantSlug=academia-xp) — fallback de
     *      desenvolvimento/compatibilidade;
     *   3) slug salvo no login desta mesma sessão (só existe com uma
     *      sessão válida ativa — ver salvarSlugDaSessaoLogada) — cobre a
     *      navegação pós-login quando o tenant foi resolvido só por
     *      ?tenantSlug= (sem hostname próprio ainda) e as páginas internas
     *      não repetem esse parâmetro;
     *   4) SLUG_PADRAO ('movement') — mesmo fallback do backend, mantém
     *      todo o comportamento de hoje para quem nunca usou nenhum dos
     *      mecanismos acima.
     *
     * Isto só decide QUAL tenant perguntar em GET /tenant/config — nunca é
     * usado sozinho para decidir o que a página mostra além disso.
     */
    function obterSlugAtual() {
        const doHostname = obterSlugDoHostname();
        if (doHostname) {
            return doHostname;
        }

        const daUrl = obterSlugDaUrl();
        if (daUrl) {
            return daUrl;
        }

        try {
            const salvo = sessionStorage.getItem(SLUG_SESSAO_KEY);
            if (salvo && window.Auth && window.Auth.possuiSessao()) {
                return salvo;
            }
        } catch (erroDeStorage) {
            // Navegação privada ou storage bloqueado: cai no padrão abaixo.
        }

        return SLUG_PADRAO;
    }

    function ehTenantPadrao(slug) {
        const valor = slug || obterSlugAtual();
        return !valor || valor === SLUG_PADRAO;
    }

    /**
     * Chamado por app.js logo após um login bem-sucedido, guardando o
     * mesmo slug que foi usado para autenticar (nunca um valor diferente).
     * Existe só para as próximas páginas (sem ?tenantSlug= na URL, já que
     * links internos não repetem o parâmetro) saberem qual tenant pedir em
     * GET /tenant/config. Limpo no logout — ver limparSlugDaSessaoLogada.
     */
    function salvarSlugDaSessaoLogada(slug) {
        try {
            if (slug) {
                sessionStorage.setItem(SLUG_SESSAO_KEY, slug);
            } else {
                sessionStorage.removeItem(SLUG_SESSAO_KEY);
            }
        } catch (erroDeStorage) {
            // Sem persistência: cabeçalho pós-navegação cai no padrão, sem
            // quebrar nada além da exibição do nome.
        }
    }

    function limparSlugDaSessaoLogada() {
        try {
            sessionStorage.removeItem(SLUG_SESSAO_KEY);
        } catch (erroDeStorage) {
            // Nada a limpar.
        }
    }

    /**
     * GET /tenant/config?tenantSlug=<slug> — sempre manda o slug como
     * parâmetro da PRÓPRIA chamada (nunca depende de ?tenantSlug= estar na
     * URL da página atual), porque páginas internas pós-login não carregam
     * mais esse parâmetro na barra de endereço. Retorna `null` em qualquer
     * falha (rede, 404, 500) — nunca lança, nunca inventa um substituto.
     */
    async function buscarConfigDoTenant(slug) {
        try {
            const resposta = await fetch("/tenant/config?tenantSlug=" + encodeURIComponent(slug));

            if (!resposta.ok) {
                return null;
            }

            return await resposta.json();
        } catch (erroDeRede) {
            return null;
        }
    }

    /**
     * Só troca a palavra "Movement"/"MOVEMENT" pelo nome oficial recebido
     * (preserva sufixos como " ADMIN" e o resto do título da aba, ex:
     * "| Início"). Nunca formata/deriva nada — `nome` já vem pronto da API.
     */
    function aplicarNomeNaPagina(nome) {
        document.title = document.title.replace(/^Movement\b/i, nome);

        document.querySelectorAll(".brand__name, .dash-header__brand, .legal-page__brand")
            .forEach(function (el) {
                el.textContent = el.textContent.replace(/MOVEMENT/i, nome.toUpperCase());
            });
    }

    /**
     * Sem `logoUrl` própria, esconder é mais correto do que inventar uma
     * logo. Com `logoUrl`, troca o `src` da logo do Movement pela do
     * tenant — nunca as duas ao mesmo tempo (ver aplicarLogoNaPagina).
     */
    function esconderLogoMovement() {
        document.querySelectorAll(".brand__mark").forEach(function (img) { img.hidden = true; });
    }

    /**
     * A tagline ("Seu desempenho. Seus pontos. Suas recompensas.") é texto
     * de marketing escrito para o Movement especificamente — nenhum outro
     * tenant deveria herdá-la, COM ou SEM logo própria configurada (por
     * isso esta função é separada de esconderLogoMovement: a logo pode ser
     * substituída pela do tenant, mas não existe uma "tagline do tenant"
     * pra substituir — esconder é sempre a escolha mais segura, nunca
     * inventar uma frase). Chamada incondicionalmente para qualquer tenant
     * que não seja o padrão, independente de ele ter logo própria ou não.
     */
    function esconderTaglineMovement() {
        document.querySelectorAll(".brand__tagline").forEach(function (p) { p.hidden = true; });
    }

    function aplicarLogoNaPagina(logoUrl) {
        document.querySelectorAll(".brand__mark").forEach(function (img) {
            img.src = logoUrl;
            img.alt = window.Tenant.nome;
            img.hidden = false;
        });
    }

    /**
     * Deriva as variações de cor que os componentes já consomem
     * (fundo/hover/glow/superfície) a partir de UM hex só — nunca uma
     * segunda cor inventada, sempre matematicamente derivada da mesma
     * `corPrimaria` que o tenant escolheu. Mistura simples com preto/branco
     * (sem biblioteca de cor) — de propósito simples, não um sistema de
     * design dinâmico completo (fora do escopo desta etapa).
     */
    function misturarComPreto(hex, fator) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.round(((num >> 16) & 0xff) * (1 - fator));
        const g = Math.round(((num >> 8) & 0xff) * (1 - fator));
        const b = Math.round((num & 0xff) * (1 - fator));
        return "#" + [r, g, b].map(function (c) { return c.toString(16).padStart(2, "0"); }).join("");
    }

    function misturarComBranco(hex, fator) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * fator);
        const g = Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * fator);
        const b = Math.round((num & 0xff) + (255 - (num & 0xff)) * fator);
        return "#" + [r, g, b].map(function (c) { return c.toString(16).padStart(2, "0"); }).join("");
    }

    function paraRgba(hex, alpha) {
        const num = parseInt(hex.slice(1), 16);
        return "rgba(" + ((num >> 16) & 0xff) + ", " + ((num >> 8) & 0xff) + ", " + (num & 0xff) + ", " + alpha + ")";
    }

    /**
     * Sobrescreve os tokens `--color-red*`/`--red*` (ver tokens.css) via
     * `style` no elemento raiz — nunca edita tokens.css. Isto é seguro por
     * duas razões: (1) tenant.js só é carregado nas páginas do TENANT,
     * nunca em plataforma-*.html (a Maple Tech continua sempre com
     * `#7C3AED`, definido só em plataforma.css); (2) sem `corPrimaria`
     * definida (tenant sem essa configuração ainda), nada é sobrescrito —
     * os tokens originais do Movement continuam valendo normalmente.
     */
    function aplicarCorNaPagina(corPrimaria) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(corPrimaria)) {
            return;
        }

        const raiz = document.documentElement.style;
        raiz.setProperty("--color-red", corPrimaria);
        raiz.setProperty("--color-red-dark", misturarComPreto(corPrimaria, 0.2));
        raiz.setProperty("--color-red-bright", misturarComBranco(corPrimaria, 0.25));
        raiz.setProperty("--color-red-glow", paraRgba(corPrimaria, 0.35));
        raiz.setProperty("--color-red-surface", paraRgba(corPrimaria, 0.08));
        raiz.setProperty("--color-red-surface-strong", paraRgba(corPrimaria, 0.14));
    }

    /**
     * Busca o contexto oficial (GET /tenant/config) e aplica na página.
     * `window.Tenant.nome/.id/.slug` começam com o valor padrão (o mesmo
     * já presente estaticamente no HTML — "Movement") e só mudam depois
     * que a resposta do backend chega. Um script que precise do valor já
     * confirmado deve aguardar `await window.Tenant.pronto` antes de ler
     * `window.Tenant.nome`.
     *
     * Falha de rede/backend: não mexe no DOM — mantém o HTML/título como
     * vieram (Movement), o mesmo comportamento de fallback de hoje.
     */
    async function aplicarIdentidadeNaPagina() {
        const slug = obterSlugAtual();
        const config = await buscarConfigDoTenant(slug);

        if (!config) {
            return;
        }

        window.Tenant.id = config.id;
        window.Tenant.slug = config.slug;
        window.Tenant.nome = config.nome;
        window.Tenant.logoUrl = config.logoUrl || null;
        window.Tenant.corPrimaria = config.corPrimaria || null;
        window.Tenant.telefone = config.telefone || null;
        window.Tenant.whatsapp = config.whatsapp || null;

        aplicarNomeNaPagina(config.nome);

        if (config.logoUrl) {
            aplicarLogoNaPagina(config.logoUrl);
        } else if (!ehTenantPadrao(config.slug)) {
            esconderLogoMovement();
        }

        if (!ehTenantPadrao(config.slug)) {
            esconderTaglineMovement();
        }

        if (config.corPrimaria) {
            aplicarCorNaPagina(config.corPrimaria);
        }
    }

    window.Tenant = {
        SLUG_PADRAO: SLUG_PADRAO,
        obterSlugDoHostname: obterSlugDoHostname,
        obterSlugDaUrl: obterSlugDaUrl,
        obterSlugAtual: obterSlugAtual,
        ehTenantPadrao: ehTenantPadrao,
        salvarSlugDaSessaoLogada: salvarSlugDaSessaoLogada,
        limparSlugDaSessaoLogada: limparSlugDaSessaoLogada,
        id: null,
        slug: null,
        nome: "Movement",
        logoUrl: null,
        corPrimaria: null,
        telefone: null,
        whatsapp: null,
        // Promise resolvida quando a tentativa de carregar o contexto
        // oficial termina (com sucesso ou não) — ver aplicarIdentidadeNaPagina.
        pronto: null
    };

    const aoCarregarDom = document.readyState === "loading"
        ? new Promise(function (resolve) { document.addEventListener("DOMContentLoaded", resolve); })
        : Promise.resolve();

    window.Tenant.pronto = aoCarregarDom.then(aplicarIdentidadeNaPagina);
})();
