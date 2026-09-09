# Documentação Mestra — Movement Benefícios (sistema-pontos)

> Documento de referência técnica e de negócio para qualquer pessoa ou IA que precise assumir, manter ou evoluir este projeto. Todo o conteúdo abaixo foi verificado diretamente no código-fonte, no schema real do banco (local), nas migrations, no `package.json`, na configuração do servidor e no histórico do Git nesta data. Onde algo não pôde ser confirmado, está escrito explicitamente "não confirmado". Nada neste documento foi inventado.
>
> **Data da verificação:** 2026-09-09.
> **Commit HEAD no momento da verificação:** `ec7a2ca` (branch `main`, idêntico a `origin/main` — ver seção 19).
> **Alterações não commitadas no momento da verificação:** `src/controllers/auth.controller.js` (correção de timing attack no login) e `src/utils/validarImagem.js` (validação de magic bytes/dimensões de imagem) — ambas implementadas e testadas, mas ainda não commitadas nem enviadas ao GitHub/Render. Ver seção 2 e seção 19.

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Estado Atual do Projeto](#2-estado-atual-do-projeto)
3. [Arquitetura Geral](#3-arquitetura-geral)
4. [Estrutura de Pastas](#4-estrutura-de-pastas)
5. [Stack Tecnológica](#5-stack-tecnológica)
6. [Como Executar Localmente](#6-como-executar-localmente)
7. [Variáveis de Ambiente](#7-variáveis-de-ambiente)
8. [Banco de Dados](#8-banco-de-dados)
9. [Regras de Negócio](#9-regras-de-negócio)
10. [Usuários e Permissões](#10-usuários-e-permissões)
11. [Autenticação](#11-autenticação)
12. [API Completa](#12-api-completa)
13. [Frontend](#13-frontend)
14. [Fluxos Completos](#14-fluxos-completos)
15. [Recompensas e Imagens](#15-recompensas-e-imagens)
16. [QR Codes](#16-qr-codes)
17. [Segurança](#17-segurança)
18. [Testes](#18-testes)
19. [Histórico de Desenvolvimento](#19-histórico-de-desenvolvimento)
20. [Migrations](#20-migrations)
21. [Deploy no Render](#21-deploy-no-render)
22. [Backups](#22-backups)
23. [Limitações Arquiteturais Atuais](#23-limitações-arquiteturais-atuais)
24. [Decisões Técnicas](#24-decisões-técnicas)
25. [Padrões de Código](#25-padrões-de-código)
26. [Como Alterar o Projeto sem Quebrar Nada](#26-como-alterar-o-projeto-sem-quebrar-nada)
27. [Checklist de Nova Feature](#27-checklist-de-nova-feature)
28. [Checklist de Deploy](#28-checklist-de-deploy)
29. [Problemas Conhecidos](#29-problemas-conhecidos)
30. [Roadmap](#30-roadmap)
31. [Guia para Outra IA](#31-guia-para-outra-ia)
32. [Resumo Executivo Final](#32-resumo-executivo-final)
33. [Apêndice Técnico](#33-apêndice-técnico)

---

## 1. VISÃO GERAL DO PROJETO

### Nome do projeto
- **Nome do repositório/pasta:** `sistema-pontos`.
- **Nome usado no produto (frontend, `<title>` de todas as páginas, marca visual):** **Movement**. O rodapé de marca completo usado na tela de login é "Movement" com o símbolo gráfico da marca (`frontend/assets/img/logo.png`) e o texto "Seu desempenho. Seus pontos. Suas recompensas." (ver `frontend/index.html`).
- O admin usa o rótulo "MOVEMENT ADMIN" no cabeçalho das telas administrativas (ver `frontend/admin.html` e demais `admin-*.html`).

### Objetivo
Um **sistema de fidelidade em pontos** para uma rede de pequenos negócios parceiros (hoje: uma oficina mecânica e uma academia, mais uma parceira adicional cadastrada — ver seção 8). O cliente acumula pontos ao consumir nesses estabelecimentos e troca esses pontos por recompensas (descontos, serviços, brindes) oferecidas pelos próprios parceiros.

### Problema que resolve
Pequenos estabelecimentos (oficina, academia, etc.) normalmente não têm um programa de fidelidade próprio — ou usam cartelas de papel/planilhas informais, sem histórico confiável, sem prevenção de fraude e sem forma de o cliente comprovar o que já resgatou. O Movement centraliza isso: um único sistema onde o cliente acumula pontos de vários parceiros diferentes e resgata recompensas desses mesmos parceiros, com prova de resgate por código/QR Code e validação no balcão pelo funcionário.

### Público-alvo
Três papéis de usuário, todos confirmados na coluna `usuarios.tipo` (ver seção 8):
- **Cliente** — consumidor final, acumula e troca pontos.
- **Funcionário** — atende o cliente no balcão do estabelecimento parceiro (identifica cliente, lança pontos, valida resgates).
- **Administrador** — dono/gestor do programa: cadastra empresas parceiras, recompensas, e tem visão completa do sistema.

### Proposta de valor
- Para o cliente: pontos que valem em mais de um lugar, resgate simples por QR Code/código, histórico transparente.
- Para o parceiro (empresa): ferramenta de retenção de cliente sem precisar construir nada próprio.
- Para o administrador do programa: um painel único para gerir todos os parceiros, recompensas e clientes.

### Contexto de negócio
Segundo o contexto acumulado ao longo do desenvolvimento (commits e conversas de trabalho), este é um projeto **em fase de validação (V1)**, sendo preparado por um desenvolvedor solo para demonstração a um mentor/investidor ("padrinho") e para uso real inicial com um pequeno número de estabelecimentos parceiros reais. Não é (ainda) um produto SaaS multi-tenant para qualquer empresa se cadastrar sozinha — as empresas parceiras são cadastradas manualmente pelo administrador (ver `POST /empresas`, admin-only).

### Conceito de programa de fidelidade (como funciona, de forma geral)
1. O cliente se cadastra (`POST /usuarios`, sempre como `tipo = 'cliente'`).
2. Quando o cliente consome em uma empresa parceira, um funcionário ou administrador lança pontos na conta dele (`POST /pontos/entrada`), sempre vinculados a uma empresa específica.
3. O cliente acumula um **saldo** — que nunca é um número fixo salvo em coluna, e sim a soma calculada de todas as suas movimentações de pontos (ver seção 9).
4. O cliente navega pelo catálogo de recompensas (`GET /recompensas`) e escolhe uma que o saldo dele já cobre.
5. Ao resgatar, os pontos são descontados **na hora** e um código de reserva único é gerado — o resgate fica com status `pendente_validacao`.
6. O cliente vai até o estabelecimento e apresenta o código (digitado ou por QR Code) para o funcionário, que **valida** o resgate (`POST /resgates/validar`) — status vira `utilizado`.
7. Se o cliente não usar o código dentro de **5 horas**, o sistema cancela o resgate automaticamente e devolve os pontos (ver seção 9, regra de expiração).
8. Paralelamente, o cliente pode **favoritar** recompensas (lista pessoal) e o administrador/funcionário pode marcar recompensas como **em destaque** (visível para todos os clientes na tela inicial) — dois conceitos deliberadamente separados (ver seção 9).

### Como explicar o projeto em 1 minuto
> "O Movement é um programa de pontos compartilhado entre pequenos negócios parceiros — hoje uma oficina e uma academia. O cliente ganha pontos quando consome em qualquer um dos parceiros, acompanha o saldo pelo celular, e troca esses pontos por recompensas oferecidas pelos próprios parceiros (descontos, serviços, produtos). O resgate gera um código único que o cliente apresenta no balcão; se ele esquecer de usar, o sistema cancela sozinho depois de 5 horas e devolve os pontos, sem intervenção manual. O backend é Node.js/Express com PostgreSQL, JWT para autenticação, e roda hoje localmente e em produção no Render. Não usa nenhum framework de frontend — é HTML/CSS/JS puro, servido pelo próprio Express."

---

## 2. ESTADO ATUAL DO PROJETO

### Versão atual
`package.json` declara `"version": "1.0.0"` (`package.json:3`). Não há tags de versão no Git (`git tag` não confirmado como usado neste projeto). O projeto está sendo tratado, na prática, como uma **V1 em fechamento** — a última auditoria de segurança concluiu **"APTO PARA CONGELAR V1"** (ver seção 17 e 29), condicionado a duas correções que já foram implementadas (ver abaixo).

### O que está implementado (confirmado no código)
Todo o conteúdo das seções 9 a 16 deste documento é a fonte completa do "o que está implementado". Em resumo, existe hoje, de ponta a ponta (backend + frontend + banco):
- Cadastro, login, autenticação por JWT, 3 papéis de usuário.
- Lançamento de pontos (entrada/saída), saldo e histórico.
- Empresas parceiras (CRUD administrativo + ativação/desativação).
- Recompensas (CRUD administrativo, imagem com editor de recorte, ativação/desativação).
- Resgate de recompensa com código único, validação por código ou QR Code.
- **Expiração automática de resgates pendentes após 5 horas**, com devolução de pontos.
- **Destaque global** de recompensa (admin/funcionário).
- **Favoritos individuais** de cliente.
- Identificação de cliente por QR Code (no balcão) e por busca manual.
- Painel administrativo completo (dashboard, clientes, empresas com "Ver mais", recompensas, resgates, validar, identificar cliente).
- Tela de funcionário com 3 abas (atender cliente, validar resgate, recompensas/destaque).
- Perfil do cliente com QR Code pessoal e resumo da conta.

### O que está funcionando (validado por teste, não só por leitura de código)
Confirmado por múltiplas baterias de teste ao vivo (backend real + Postgres real + Playwright/navegador real) ao longo do desenvolvimento — ver seção 18 para os números exatos. Não há suíte de teste automatizado permanente no repositório (não existe pasta `test/` nem dependência de teste no `package.json` — `"test": "echo \"Error: no test specified\" && exit 1"` em `package.json:8`); os testes descritos neste documento foram scripts avulsos, executados manualmente contra o ambiente real e depois descartados (nunca commitados).

### Ambiente local
- Backend: `http://localhost:3000` (porta fixa, ver `server.js`, `app.listen(3000, ...)`).
- Banco: PostgreSQL local, nome do banco `sistema_pontos` (valor usado durante o desenvolvimento — configurável via `.env`, ver seção 7).
- Schema local confirmado **com** as colunas/tabelas mais recentes: `recompensas.destacada` e `recompensas_favoritas` presentes (ver seção 8).

### Produção / Render
- URL confirmada em uso durante o desenvolvimento: `https://sistema-pontos-0i0k.onrender.com`.
- HTTPS confirmado forçado (requisição HTTP simples recebe redirect 301 para HTTPS no mesmo host).
- **Incidente já ocorrido e corrigido:** depois de um deploy, `GET /recompensas` e `GET /recompensas/admin` passaram a responder 500 ("Erro ao listar recompensas") em produção. Causa raiz: o código novo (colunas/tabela de destaque e favoritos) foi implantado, mas as migrations correspondentes nunca tinham rodado no Postgres de produção — o schema de produção ficou atrasado em relação ao código. Corrigido rodando manualmente as duas migrations (`scripts/migrate-recompensas-destaque.js` e `scripts/migrate-recompensas-favoritas.js`) diretamente contra o banco de produção. Ver seção 20 e 21 para o procedimento completo e o alerta permanente que isso gerou.
- Como consequência direta desse incidente: **este documento trata "schema local == schema de produção" como algo que precisa ser reconfirmado a cada deploy, nunca assumido.**

### Banco local vs banco de produção — diferenças conhecidas
| Aspecto | Local | Produção |
|---|---|---|
| Schema (tabelas/colunas) | Confirmado atualizado (inclui `destacada` e `recompensas_favoritas`) | Confirmado atualizado **depois** da correção do incidente acima |
| Dados | Dados de desenvolvimento/demonstração | Dados reais de uso (contas reais, incluindo uma conta de teste compartilhada conhecida — ver seção 29) |
| Rate limit de login | Alto (1000/15min) quando `NODE_ENV=development` está definido no `.env` local — ver seção 7 e 11 | 10 tentativas / 15 minutos (não alterado, é o valor padrão do código quando `NODE_ENV` não é `"development"`) |

### Estado atual das migrations
9 scripts de migration existem em `scripts/` (ver seção 20 para a lista completa e detalhada). Todas já foram executadas com sucesso tanto localmente quanto em produção, **confirmado por inspeção direta do schema em ambos os ambientes** na data deste documento. Não há nenhuma migration pendente conhecida no momento da escrita.

### Funcionalidades consideradas V1
Tudo listado em "O que está implementado" acima. A lista de decisão sobre o que fica para depois está na seção 30 (Roadmap).

### Funcionalidades ainda pendentes / não implementadas
Ver seção 30. Resumo rápido: nenhuma funcionalidade de negócio pendente foi identificada como "faltando para o V1" — os itens em aberto são exclusivamente de **hardening técnico** (ver seção 17, itens classificados como BAIXO) e ficaram deliberadamente para V1.1.

### IMPLEMENTADO × EM TESTE × PLANEJADO × V1.1/FUTURO

| Item | Status |
|---|---|
| Cadastro, login, JWT, 3 papéis | **IMPLEMENTADO** |
| Pontos (entrada/saída/saldo/histórico) | **IMPLEMENTADO** |
| Empresas parceiras | **IMPLEMENTADO** |
| Recompensas (CRUD + imagem + crop) | **IMPLEMENTADO** |
| Resgate com código + validação | **IMPLEMENTADO** |
| Expiração automática de 5h + devolução | **IMPLEMENTADO** |
| Destaque global de recompensa | **IMPLEMENTADO** |
| Favoritos individuais de cliente | **IMPLEMENTADO** |
| "Ver mais" (detalhe de empresa) | **IMPLEMENTADO** |
| QR Code do cliente + QR/código de resgate | **IMPLEMENTADO** |
| Correção de timing attack no login | **IMPLEMENTADO NO CÓDIGO — NÃO COMMITADO** (ver seção 17) |
| Validação de magic bytes/dimensão de imagem | **IMPLEMENTADO NO CÓDIGO — NÃO COMMITADO** (ver seção 17) |
| Cookie httpOnly para sessão (em vez de localStorage) | **PLANEJADO (V1.1)** — não implementado, ver seção 17/23 |
| Política de senha mais forte | **PLANEJADO (V1.1)** |
| Índices de performance adicionais | **PLANEJADO (V1.1)** |
| Qualquer forma de storage de objeto dedicado para imagens (fora do Postgres) | **NÃO PLANEJADO FORMALMENTE — SUGESTÃO** (ver seção 23/30) |

---

## 3. ARQUITETURA GERAL

Aplicação **monolítica clássica**: um único processo Node.js serve tanto os arquivos estáticos do frontend quanto a API — não há build step, não há SPA framework, não há servidor de frontend separado.

```
┌─────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (cliente / funcionário / admin)                      │
│  HTML + CSS + JS puro (sem framework, sem bundler)               │
│  localStorage: token JWT, tipo, email                            │
└───────────────────────────┬───────────────────────────────────────┘
                             │ fetch() — sempre mesma origem
                             │ Authorization: Bearer <token> quando logado
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  server.js  (processo único Node.js — Express 5)                 │
│                                                                    │
│  1. Helmet (headers de segurança + CSP)                          │
│  2. CORS (origin = CORS_ORIGIN)                                  │
│  3. express.json({limit:"6mb"}) — só para /recompensas           │
│  4. express.json({limit:"10kb"}) — todas as outras rotas         │
│  5. express.static("frontend/")  — serve o HTML/CSS/JS            │
│  6. globalLimiter (express-rate-limit, 300 req/15min)             │
│  7. Rotas da API (ver abaixo)                                     │
│  8. 404 handler                                                   │
│  9. errorHandler (middleware de erro)                              │
│                                                                    │
│  + iniciarLimpezaPeriodica() — roda a cada 5 min em background    │
└───────────────────────────┬───────────────────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────────┐
        ▼                    ▼                          ▼
┌───────────────┐   ┌─────────────────┐        ┌──────────────────┐
│  ROUTES        │──▶│  MIDDLEWARES     │──────▶│  CONTROLLERS      │
│  src/routes/*  │   │  authMiddleware  │        │  src/controllers/*│
│  (8 arquivos)  │   │  roleMiddleware  │        │  (8 arquivos)     │
│                │   │  validate*.js    │        │                   │
└───────────────┘   └─────────────────┘        └─────────┬─────────┘
                                                            │
                                          ┌──────────────────┼──────────────────┐
                                          ▼                  ▼                  ▼
                                 ┌────────────────┐ ┌────────────────┐ ┌──────────────────┐
                                 │ src/utils/*     │ │ src/services/* │ │ src/config/       │
                                 │ (validação de   │ │ (expiração de  │ │ database.js       │
                                 │ imagem, códigos,│ │ resgates — a   │ │ (Pool do `pg`)     │
                                 │ tokens, slug)   │ │ única service  │ │                    │
                                 └────────────────┘ │ hoje)           │ └─────────┬──────────┘
                                                     └────────────────┘           │
                                                                                    ▼
                                                                        ┌─────────────────────┐
                                                                        │   PostgreSQL          │
                                                                        │   6 tabelas           │
                                                                        │   (ver seção 8)       │
                                                                        └─────────────────────┘
```

### Onde entra cada peça

| Peça | Onde vive | Papel |
|---|---|---|
| **Autenticação (login)** | `src/controllers/auth.controller.js`, endpoint `POST /login` | Confere email/senha, emite JWT |
| **JWT** | Emitido em `auth.controller.js`, verificado em `src/middlewares/authMiddleware.js` | Prova de identidade sem estado no servidor |
| **bcrypt** | `auth.controller.js` (comparar) e `user.controller.js` (hash no cadastro) | Nunca guardar senha em texto puro |
| **Autorização** | `src/middlewares/roleMiddleware.js`, aplicado por rota em `src/routes/*.js` | Decide quem pode chamar qual endpoint |
| **Validações de entrada** | `src/middlewares/validate*.js` (11 arquivos) | Formato/tipo do body antes de chegar ao controller |
| **Serviços (regra de negócio de fundo)** | `src/services/resgateExpiracao.service.js` | Única "service" do projeto hoje — expiração de 5h |
| **Migrations** | `scripts/migrate-*.js` (6 arquivos) + `scripts/create-*.js` (2 arquivos) | Alterações de schema, sempre via script Node, nunca à mão |
| **Expiração automática** | `resgateExpiracao.service.js`, chamado de dois jeitos (periódico + sob demanda) — ver seção 9 | Cancela resgate vencido e devolve pontos |
| **Uploads / imagens** | Campo `imagem` (TEXT, base64) em `recompensas`; validado em `src/utils/validarImagem.js`; recortado no navegador em `frontend/assets/js/admin-recompensas.js` | Nunca um arquivo em disco — sempre base64 no Postgres |
| **QR Code** | Geração: `src/utils/qrTokenUsuario.js` (cliente) e `src/utils/codigoResgate.js` (resgate). Renderização: biblioteca `qrcodejs` via CDN, no frontend | Duas coisas diferentes — ver seção 16 |
| **Favoritos** | `src/controllers/favorito.controller.js`, `src/routes/favorito.routes.js`, tabela `recompensas_favoritas` | Individual, por cliente |
| **Destaque** | `reward.controller.js` (`destacar`/`removerDestaque`), coluna `recompensas.destacada` | Global, para todos os clientes |

---

## 4. ESTRUTURA DE PASTAS

```
sistema-pontos/
├── server.js                      # ponto de entrada único do backend
├── package.json / package-lock.json
├── .env                           # segredos locais (nunca commitado — ver seção 7)
├── .gitignore
├── backup-sistema-pontos.sql      # dump manual do banco (ver seção 22)
│
├── frontend/                      # TODO o frontend — servido estaticamente por server.js
│   ├── *.html                     # 16 páginas (ver seção 13)
│   └── assets/
│       ├── css/                   # 5 arquivos — ver abaixo
│       │   ├── tokens.css         # variáveis de design (cor, espaçamento, tipografia)
│       │   ├── base.css           # reset e estilos globais
│       │   ├── components.css     # componentes reutilizáveis (botões, modais, badges, nav)
│       │   ├── dashboard.css      # telas do cliente (dashboard, recompensas, favoritos, resgates)
│       │   └── admin.css          # telas administrativas e do funcionário
│       ├── js/                    # 19 arquivos — um por tela + 3 compartilhados (api.js, auth.js, ui.js)
│       └── img/
│           └── logo.png           # símbolo da marca (extraído de uma logo maior, sem o texto/linha)
│
├── src/
│   ├── config/
│   │   └── database.js            # Pool único do `pg`, lido pelas variáveis DB_* do .env
│   ├── controllers/                # 9 arquivos — regra de negócio de cada domínio
│   │   ├── auth.controller.js      # login
│   │   ├── user.controller.js      # cadastro, perfil, listagem admin, busca por QR/nome
│   │   ├── admin.controller.js     # dashboard agregado do admin
│   │   ├── empresa.controller.js   # CRUD de empresas + "Ver mais"
│   │   ├── points.controller.js    # entrada/saída/saldo/histórico de pontos
│   │   ├── reward.controller.js    # CRUD de recompensas + destaque
│   │   ├── redemption.controller.js# criar/listar/validar resgate
│   │   └── favorito.controller.js  # favoritar/desfavoritar/listar favoritos
│   ├── routes/                     # 8 arquivos — 1 por domínio, ligam método+caminho a controller
│   ├── middlewares/                 # 14 arquivos — auth, role, validação de cada endpoint, erro
│   ├── services/
│   │   └── resgateExpiracao.service.js  # única service — expiração de 5h
│   └── utils/                      # 4 arquivos — funções puras reaproveitadas por controllers
│       ├── codigoResgate.js
│       ├── qrTokenUsuario.js
│       ├── empresas.js
│       └── validarImagem.js
│
├── scripts/                        # 9 arquivos — rodados manualmente via `node scripts/<arquivo>.js`
│   ├── create-admin.js / create-funcionario.js   # únicas formas de criar admin/funcionário
│   └── migrate-*.js (7 arquivos)                  # migrations, ver seção 20
│
└── docs/
    └── PROJETO-MOVEMENT-BENEFICIOS.md  # este documento
```

### Responsabilidade de cada pasta

- **`frontend/`** — tudo que o navegador baixa. Servido diretamente por `express.static` em `server.js:66`; nenhuma etapa de build (sem Webpack/Vite/bundler). Cada HTML carrega seus próprios `<script>` na ordem `api.js → auth.js → ui.js → <script da própria tela>` (quando a tela precisa desses três; ver seção 13 para exceções como `index.html`/`cadastro.html`, que não usam `ui.js`).
- **`src/config/`** — única responsabilidade: expor o `Pool` de conexão com o Postgres. Todo o resto do backend importa esse mesmo pool (`require("../config/database")`), nunca cria uma conexão própria.
- **`src/controllers/`** — onde a regra de negócio de fato vive. Cada função de controller é chamada por exatamente uma rota (algumas rotas compartilham query patterns, mas nunca lógica duplicada entre controllers).
- **`src/routes/`** — cada arquivo só declara `router.<metodo>(caminho, ...middlewares, controller.funcao)`. Nenhuma lógica de negócio nunca fica aqui — só composição de middlewares.
- **`src/middlewares/`** — dividido em três famílias: autenticação/autorização (`authMiddleware.js`, `roleMiddleware.js`), validação de entrada por endpoint (`validate*.js`, 11 arquivos, um por formato de body diferente) e tratamento de erro (`errorHandler.js`).
- **`src/services/`** — lógica de negócio que roda "por conta própria" (não é disparada só por uma requisição HTTP específica). Hoje só existe uma: a expiração de resgates.
- **`src/utils/`** — funções puras (sem `req`/`res`), reaproveitadas por mais de um controller: geração de código/token aleatórios, validação de imagem, normalização de slug de empresa.
- **`scripts/`** — tudo que roda uma vez, manualmente, fora do ciclo normal de requisição HTTP: criar a primeira conta admin/funcionário, e migrations de schema.
- **`docs/`** — pasta nova, criada para conter este documento.

### Arquivos importantes (finalidade, dependências, cuidados)

| Arquivo | Finalidade | Depende de | Usado por | Cuidado ao alterar |
|---|---|---|---|---|
| `server.js` | Monta toda a aplicação Express — ordem de middlewares é significativa | Todas as rotas, `resgateExpiracao.service.js` | Processo de entrada (`npm start`) | A ordem `static → globalLimiter → rotas` é proposital (ver comentário no próprio arquivo) — não mover o `express.static` para depois do rate limiter |
| `src/config/database.js` | Cria o único `Pool` do `pg` | Variáveis `DB_*` do `.env` | Todo controller/script que toca o banco | Não criar um segundo `Pool` em nenhum lugar |
| `src/middlewares/authMiddleware.js` | Verifica o JWT, popula `req.usuario = {id, tipo}` | `jsonwebtoken`, `JWT_SECRET` | Toda rota protegida | Nunca remover a verificação de assinatura; nunca aceitar token sem `Bearer` |
| `src/middlewares/roleMiddleware.js` | Fábrica `roleMiddleware(...tiposPermitidos)` | `req.usuario.tipo` (setado pelo authMiddleware, que roda antes) | Toda rota restrita a papel | Sempre usar depois de `authMiddleware`, nunca antes |
| `src/controllers/redemption.controller.js` | Todo o ciclo de vida do resgate (criar/listar/validar) | `codigoResgate.js`, `resgateExpiracao.service.js` | `POST/GET /resgates*` | Contém a única lógica de desconto de pontos por resgate — qualquer mudança aqui afeta saldo real |
| `src/services/resgateExpiracao.service.js` | Cancela resgates pendentes há mais de 5h e devolve pontos | `pool` direto | `server.js` (periódico), `redemption.controller.js` e `admin.controller.js` (sob demanda) | Transacional e idempotente de propósito — ver seção 9. Não chamar fora de uma dessas duas formas sem entender a seção 9 |
| `src/utils/validarImagem.js` | Valida formato real (magic bytes) + dimensões da imagem de recompensa | Nenhuma lib externa — parsing manual de PNG/JPEG/WEBP | `validateRewardCreate.js`, `validateRewardUpdate.js` | Mudar o limite de 4000×4000 ou 5MB aqui, nunca duplicar a checagem em outro lugar |
| `frontend/assets/js/api.js` | Único wrapper de `fetch` do frontend inteiro | `window.Auth` (para o token) | Todos os outros arquivos JS do frontend | Nunca fazer `fetch` direto em outro arquivo — sempre passar por `window.api(...)` |
| `frontend/assets/js/auth.js` | Sessão do frontend: guardar/ler token e tipo no `localStorage` | Nenhuma | `api.js`, `ui.js`, toda tela protegida | Nunca guardar a senha aqui; token sempre em `localStorage`, nunca em cookie (ver seção 17) |
| `frontend/assets/js/ui.js` | Guardas de página (`protegerPagina`/`protegerPaginaAdmin`/`protegerPaginaFuncionario`), formatação, modal genérico | `window.Auth` | Todas as telas exceto `index.html`/`cadastro.html` | A proteção aqui é só de UX — a autorização real é sempre no backend (comentário explícito no próprio arquivo) |

---

## 5. STACK TECNOLÓGICA

### Frontend
| Tecnologia | Onde | Por quê (confirmado no projeto) |
|---|---|---|
| HTML puro | `frontend/*.html` | Sem framework — 16 páginas multi-page tradicionais, cada uma com seu próprio `<script>` |
| CSS puro (sem pré-processador) | `frontend/assets/css/*.css` | Sistema de tokens próprio (`tokens.css`) simulando variáveis de design system, sem Sass/Less/Tailwind |
| JavaScript puro (ES6+, sem framework) | `frontend/assets/js/*.js` | Sem React/Vue/Angular. Cada arquivo é uma IIFE `(function () { ... })()` isolada |
| **qrcodejs** (CDN: `cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`) | Toda tela que **exibe** um QR Code (perfil, admin-clientes, meus-resgates, recompensas) | Gera o QR Code do QR do cliente e do código de resgate |
| **jsQR** (CDN: `cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js`) | `funcionario.js`, `admin-validar.js`, `admin-identificar-cliente.js` | Decodifica QR Code a partir de frames de vídeo da câmera (`getUserMedia`) |
| Google Fonts (Barlow, Barlow Condensed, JetBrains Mono) | `<link>` em todos os HTML | Tipografia da marca — condensada para títulos/números, mono para códigos |
| Canvas API nativo do navegador | `admin-recompensas.js` (editor de recorte) | Recorta e comprime a imagem da recompensa antes de enviar — ver seção 15 |

Não há `node_modules` para o frontend — todas as libs externas vêm de CDN, com a lista de origens permitidas fechada na CSP do Helmet (ver seção 17).

### Backend
| Tecnologia | Versão instalada (`package-lock.json`) | Onde | Por quê |
|---|---|---|---|
| **Node.js** | `v24.19.0` (verificado no ambiente de desenvolvimento; `package.json` não fixa uma engine mínima) | Runtime | — |
| **Express** | `5.2.1` | `server.js` | Framework HTTP — roteamento, middlewares |
| **jsonwebtoken** | `9.0.3` | `auth.controller.js`, `authMiddleware.js` | Emissão/verificação de JWT |
| **bcrypt** | `6.0.0` | `auth.controller.js`, `user.controller.js` | Hash de senha (10 rounds) |
| **helmet** | `8.3.0` | `server.js` | Conjunto de headers de segurança HTTP + CSP |
| **cors** | `2.8.6` | `server.js` | Controle de origem cruzada |
| **express-rate-limit** | `8.7.0` | `server.js`, `auth.routes.js` | Limite de requisições (global e de login) |
| **pg** | `8.23.0` | `src/config/database.js` | Driver PostgreSQL (`Pool`/`Client`) |
| **dotenv** | `17.4.2` | `src/config/database.js` | Carrega `.env` para `process.env` |

Nenhuma biblioteca de imagem (ex.: `sharp`, `jimp`) está instalada — a validação de magic bytes/dimensões em `src/utils/validarImagem.js` é feita com `Buffer` puro do Node (ver seção 15). Nenhum ORM está em uso — todas as queries são SQL puro via `pg`, sempre parametrizadas.

### Banco
- **PostgreSQL** — versão exata do servidor local não fixada neste documento (não há arquivo de versão do Postgres no projeto); confirmado compatível com os recursos usados (constraints `CHECK`, `FOR UPDATE`, transações, `ON DELETE CASCADE`).

### Infraestrutura
| Serviço | Papel | Confirmado por |
|---|---|---|
| **GitHub** | Hospeda o repositório (`origin` = `https://github.com/MarcosViniciusUC/sistema-pontos.git`) | `git remote -v` |
| **Render** | Hospeda o backend + serve o frontend estático (mesmo processo) e o PostgreSQL gerenciado de produção | URL pública em uso (`sistema-pontos-0i0k.onrender.com`), headers de resposta (`x-render-origin-server: Render`) |
| **Cloudflare** | Na frente do Render (TLS/CDN) | Header `Server: cloudflare` e `CF-RAY` observados nas respostas de produção |

---

## 6. COMO EXECUTAR LOCALMENTE

### Requisitos
- **Node.js** — versão usada no desenvolvimento: `v24.19.0`. Não há um `.nvmrc` nem campo `engines` no `package.json` fixando uma versão mínima (**não confirmado** qual a versão mínima real necessária — recomenda-se usar uma versão recente do Node 20+ por segurança, já que o projeto usa sintaxe moderna).
- **PostgreSQL** — instalado e rodando localmente, com um banco criado (o nome usado durante o desenvolvimento foi `sistema_pontos`, mas é configurável).
- **npm** (vem com o Node) — não há uso de `yarn`/`pnpm` (só `package-lock.json` presente, não `yarn.lock`/`pnpm-lock.yaml`).

### Passo a passo

**1. Instalar dependências**
```bash
npm install
```

**2. Criar o arquivo `.env`** na raiz do projeto (nunca commitar este arquivo — já está no `.gitignore`). Ver seção 7 para a lista completa de variáveis e o que cada uma faz. Nenhum valor de exemplo abaixo é um segredo real.

```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=sistema_pontos
DB_PASSWORD=<sua_senha_local>
DB_PORT=5432
JWT_SECRET=<uma_string_longa_e_aleatória_só_sua>
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

**3. Criar o banco e aplicar o schema.** Este projeto **não tem um único arquivo `schema.sql` inicial** — o schema é construído incrementalmente pelos scripts de migration (ver seção 20). Para montar um banco novo do zero, é preciso: (a) ter as tabelas-base já existentes (**não confirmado** um script de criação inicial das tabelas `usuarios`/`recompensas`/`resgates`/`movimentacoes_pontos` — elas já existiam antes da primeira migration encontrada no repositório, o que sugere que a estrutura inicial foi criada manualmente ou por uma ferramenta fora do controle de versão) e depois (b) rodar todas as migrations em ordem cronológica:
```bash
node scripts/migrate-empresas.js
node scripts/migrate-movimentacoes-origem.js
node scripts/migrate-recompensas-imagem.js
node scripts/migrate-resgates-fluxo-imediato.js
node scripts/migrate-usuarios-qr-token.js
node scripts/migrate-recompensas-destaque.js
node scripts/migrate-recompensas-favoritas.js
```
> Se você está clonando este projeto pela primeira vez e não tem as tabelas-base, restaure primeiro o dump em `backup-sistema-pontos.sql` (ver seção 22) e depois confira com a seção 8 se todas as colunas/tabelas descritas já existem antes de rodar as migrations acima (todas são idempotentes — usam `IF NOT EXISTS` — então rodar de novo por engano não quebra nada).

**4. Criar o primeiro administrador**
```bash
node scripts/create-admin.js "Seu Nome" "seu@email.com" "sua-senha-forte"
```
(ou rode sem argumentos para o script perguntar interativamente).

**5. Iniciar o servidor**
```bash
npm start
```
Isso executa `node server.js` (`package.json:7`). Você deve ver no terminal:
```
Servidor rodando na porta 3000
```

### Porta utilizada
**3000**, fixa (não configurável por variável de ambiente — `server.js` chama `app.listen(3000, ...)` com o número literal).

### Como acessar o frontend
Abra `http://localhost:3000/index.html` (ou apenas `http://localhost:3000/`, que resolve para o mesmo arquivo via `express.static`) — é a tela de login.

### Como verificar se o backend está funcionando
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```
Deve responder `200`.

### Como verificar o banco
```bash
psql -U postgres -d sistema_pontos -c "\dt"
```
Deve listar as 6 tabelas da seção 8. Ou, via Node:
```bash
node -e "require('./src/config/database').query('SELECT NOW()').then(r => console.log(r.rows))"
```

### Como testar o login
Com o admin criado no passo 4:
```bash
curl -s -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"email":"seu@email.com","senha":"sua-senha-forte"}'
```
Deve responder `200` com um `token` JWT no corpo.

---

## 7. VARIÁVEIS DE AMBIENTE

Todas as variáveis abaixo foram confirmadas em uso real no código (`process.env.<NOME>`) ou no arquivo `.env` local (só os **nomes**, nunca os valores, foram lidos — os valores reais nunca aparecem neste documento).

| Variável | Finalidade | Obrigatória? | Local/Produção | Exemplo sem segredo |
|---|---|---|---|---|
| `DB_USER` | Usuário do PostgreSQL | Sim (`src/config/database.js`) | Ambos | `postgres` |
| `DB_HOST` | Host do PostgreSQL | Sim | Ambos | `localhost` (local) / host gerenciado do Render (produção) |
| `DB_NAME` | Nome do banco | Sim | Ambos | `sistema_pontos` |
| `DB_PASSWORD` | Senha do banco | Sim | Ambos | *(nunca documentado aqui)* |
| `DB_PORT` | Porta do PostgreSQL | Sim | Ambos | `5432` |
| `JWT_SECRET` | Chave usada para assinar/verificar todo JWT emitido | Sim (`auth.controller.js`, `authMiddleware.js`) | Ambos, **valores diferentes e independentes** entre local e produção | *(string longa e aleatória — nunca documentada aqui)* |
| `CORS_ORIGIN` | Origem permitida pelo middleware `cors` (`server.js`) | Sim (o middleware é sempre montado; sem o valor, nenhuma origem cruzada é liberada) | Ambos, valores diferentes | `http://localhost:3000` (local) |
| `NODE_ENV` | Ativa o modo de desenvolvimento — hoje usado **só** para relaxar o limite de tentativas de login (`src/routes/auth.routes.js`) | Não (comportamento padrão = produção, se ausente) | Só definido como `development` localmente | `development` |
| `DATABASE_URL` | **Não é usada pelo código da aplicação** (`src/config/database.js` usa as variáveis `DB_*` discretas, não uma URL única). Foi usada manualmente, uma única vez, como parâmetro de linha de comando (não como variável de ambiente do processo) para rodar as migrations diretamente contra o Postgres de produção durante o incidente descrito na seção 21 | Não (não lida em lugar nenhum do código-fonte) | — | — |

> **Atenção para quem for alterar `server.js`/`database.js`:** se no futuro alguém migrar `src/config/database.js` para aceitar uma `DATABASE_URL` única (padrão comum em serviços como o Render), a lógica de SSL precisa ser adicionada explicitamente (`ssl: { rejectUnauthorized: false }` ou equivalente) — o Postgres gerenciado do Render exige SSL para conexões externas, e o `Pool` atual não configura `ssl` nenhum (funciona hoje porque, dentro da rede do próprio Render, a conexão não exige SSL da mesma forma que uma conexão externa).

---

## 8. BANCO DE DADOS

**6 tabelas confirmadas** no schema atual (consulta direta a `information_schema.columns` e `pg_constraint`, banco local, nesta data). Nenhuma outra tabela existe.

### Diagrama ER simplificado (ASCII)

```
┌───────────────────┐
│     usuarios       │
│───────────────────│
│ id            PK   │
│ nome                │
│ email        UNIQUE │
│ senha  (hash bcrypt)│
│ telefone            │
│ tipo   (cliente/     │
│  funcionario/admin) │
│ qr_token     UNIQUE │
│ criado_em           │
└─────────┬──────────┘
          │ 1
          │
          │ N                                    ┌───────────────────┐
          ├─────────────────────────────────────▶│     empresas        │
          │                                       │───────────────────│
          │                                       │ id            PK   │
          │                                       │ nome                │
          │                                       │ slug         UNIQUE │
          │                                       │ ativo               │
          │                                       │ criado_em           │
          │                                       └─────────┬──────────┘
          │                                                 │ 1
          │                                                 │
          │                          ┌──────────────────────┼───────────────────────┐
          │                          │ N                     │ N                      │ N
          │                 ┌────────▼─────────┐   ┌─────────▼──────────┐   ┌─────────▼──────────┐
          │                 │  recompensas       │   │ movimentacoes_pontos│   │      resgates       │
          │                 │───────────────────│   │─────────────────────│   │────────────────────│
          │                 │ id            PK   │   │ id             PK   │   │ id            PK   │
          │                 │ nome                │   │ usuario_id  FK──┐   │   │ usuario_id  FK──┐  │
          │                 │ descricao           │   │ quantidade      │   │   │ recompensa_id FK│  │
          │                 │ pontos_necessarios  │   │ tipo (entrada/  │   │   │ pontos          │  │
          │                 │ ativo               │   │  saida)         │   │   │ status          │  │
          │                 │ empresa_id  FK ──┐  │   │ descricao       │   │   │ codigo   UNIQUE │  │
          │                 │ imagem (base64)  │  │   │ origem          │   │   │ criado_em       │  │
          │                 │ destacada        │  │   │ empresa_id  FK──┼───┘   │ atualizado_em   │  │
          │                 │ criado_em        │  │   │ criado_em       │       │ empresa_id  FK──┼──┘
          │                 └────────┬─────────┘  │   └─────────────────┘       └────────┬────────┘
          │                          │ N            └───────────────────────────────────────┘ (empresa_id
          │                          │                                                          também aponta
          │                 ┌────────▼──────────────┐                                          para empresas)
          │                 │ recompensas_favoritas   │
          │                 │────────────────────────│
          └────────────────▶│ id                PK   │
            N (usuario_id)  │ usuario_id  FK CASCADE  │
                             │ recompensa_id FK CASCADE│
                             │ criado_em                │
                             │ UNIQUE(usuario_id,       │
                             │        recompensa_id)    │
                             └────────────────────────┘
```

Legenda: `FK` = chave estrangeira. As setas de `movimentacoes_pontos`, `resgates` e `recompensas` para `empresas` usam FK simples (sem `ON DELETE`, ou seja, `NO ACTION` — o Postgres impede apagar uma empresa referenciada). Só `recompensas_favoritas` usa `ON DELETE CASCADE`, e apenas nela mesma (nunca em cascata para `usuarios` ou `recompensas`).

### Tabela `usuarios`

**Finalidade:** todo mundo que faz login no sistema — cliente, funcionário e administrador são a **mesma tabela**, diferenciados só pela coluna `tipo`.

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | `nextval('usuarios_id_seq')` | PK |
| `nome` | `varchar(100)` | não | — | |
| `email` | `varchar(150)` | não | — | `UNIQUE` (`usuarios_email_key`) |
| `senha` | `varchar(255)` | não | — | hash `bcrypt`, nunca texto puro, nunca devolvido pela API |
| `telefone` | `varchar(20)` | sim | — | opcional |
| `tipo` | `varchar(20)` | não | `'cliente'` | valores em uso: `cliente`, `funcionario`, `admin` — **sem `CHECK` constraint no banco** restringindo esses valores; a restrição é só na aplicação (ver seção 23) |
| `qr_token` | `varchar(64)` | não | — | `UNIQUE` (`usuarios_qr_token_key`); 32 bytes aleatórios em hexadecimal — ver seção 16 |
| `criado_em` | `timestamp` | sim | `CURRENT_TIMESTAMP` | única tabela cujo default de timestamp usa `CURRENT_TIMESTAMP` em vez de `now()` (equivalentes na prática, mas historicamente inconsistente entre migrations) |

**Constraints confirmadas:** `usuarios_pkey` (PK em `id`), `usuarios_email_key` (UNIQUE), `usuarios_qr_token_key` (UNIQUE), `NOT NULL` em `id`, `nome`, `email`, `senha`, `tipo`, `qr_token`. **Sem índice além dos implícitos de PK/UNIQUE.**

**Relacionamentos:** referenciada por `movimentacoes_pontos.usuario_id`, `resgates.usuario_id`, `recompensas_favoritas.usuario_id` (com `ON DELETE CASCADE` só nesta última).

### Tabela `empresas`

**Finalidade:** os estabelecimentos parceiros do programa (ex.: Oficina, Academia).

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | — | PK |
| `nome` | `varchar(100)` | não | — | |
| `slug` | `varchar(50)` | não | — | `UNIQUE`; identificador estável, normalizado (`src/utils/empresas.js:normalizarSlug`) |
| `ativo` | `boolean` | não | `true` | desativação é lógica (soft), nunca `DELETE` |
| `criado_em` | `timestamp` | não | `now()` | |

**Constraints:** `empresas_pkey`, `empresas_slug_key` (UNIQUE), `NOT NULL` em `id`, `nome`, `slug`, `ativo`, `criado_em`.

**Relacionamentos:** referenciada por `recompensas.empresa_id`, `movimentacoes_pontos.empresa_id`, `resgates.empresa_id` — todas nullable (histórico anterior à existência de empresas) e sem `ON DELETE` (não é possível apagar uma empresa referenciada; só desativar).

### Tabela `recompensas`

**Finalidade:** os itens que o cliente pode resgatar com pontos.

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | — | PK |
| `nome` | `varchar(150)` | não | — | `CHECK (btrim(nome) <> '')` — não pode ser string vazia/só espaços |
| `descricao` | `text` | sim | — | |
| `pontos_necessarios` | `integer` | não | — | `CHECK (pontos_necessarios > 0)` |
| `ativo` | `boolean` | não | `true` | desativação lógica; `GET /recompensas` (catálogo do cliente) só mostra `ativo = true` |
| `criado_em` | `timestamp` | não | `now()` | |
| `empresa_id` | `integer` | sim | — | FK para `empresas(id)`, sem `ON DELETE`; nullable por compatibilidade com recompensas cadastradas antes da tabela `empresas` existir |
| `imagem` | `text` | sim | — | data URL base64 completa (ex.: `data:image/jpeg;base64,...`) — ver seção 15 |
| `destacada` | `boolean` | não | `false` | destaque **global** — ver seção 9 |

**Constraints:** `recompensas_pkey`, `recompensas_empresa_id_fkey`, `recompensas_nome_check`, `recompensas_pontos_necessarios_check`, `NOT NULL` em `id`, `nome`, `pontos_necessarios`, `ativo`, `criado_em`, `destacada`.

**Relacionamentos:** referenciada por `resgates.recompensa_id` e `recompensas_favoritas.recompensa_id` (esta última com `ON DELETE CASCADE`).

### Tabela `resgates`

**Finalidade:** cada troca de pontos por uma recompensa — o registro central do fluxo de resgate.

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | — | PK |
| `usuario_id` | `integer` | não | — | FK para `usuarios(id)`, sem `ON DELETE` |
| `recompensa_id` | `integer` | não | — | FK para `recompensas(id)`, sem `ON DELETE` |
| `pontos` | `integer` | não | — | `CHECK (pontos > 0)` — snapshot do custo da recompensa **no momento do resgate** (se a recompensa mudar de preço depois, este valor não muda) |
| `status` | `varchar(20)` | não | `'pendente_validacao'` | `CHECK` restringe a exatamente `pendente_validacao`, `utilizado`, `cancelado` |
| `criado_em` | `timestamp` | não | `now()` | usado pela regra de expiração de 5h |
| `atualizado_em` | `timestamp` | não | `now()` | atualizado manualmente pelo código a cada mudança de status (não há trigger) |
| `codigo` | `varchar(12)` | não | — | `UNIQUE`; código de reserva legível por humano — ver seção 16 |
| `empresa_id` | `integer` | sim | — | FK para `empresas(id)`, sem `ON DELETE`; snapshot da empresa da recompensa no momento do resgate |

**Constraints:** `resgates_pkey`, `resgates_usuario_id_fkey`, `resgates_recompensa_id_fkey`, `resgates_empresa_id_fkey`, `resgates_codigo_key` (UNIQUE), `resgates_pontos_check`, `resgates_status_check`, `NOT NULL` em `id`, `usuario_id`, `recompensa_id`, `pontos`, `status`, `criado_em`, `atualizado_em`, `codigo`.

**Sem índice** em `usuario_id`, `status` ou `empresa_id` além dos implícitos de FK/UNIQUE — ver seção 23 (limitação de performance a médio prazo, não crítica na escala atual).

### Tabela `movimentacoes_pontos`

**Finalidade:** o **livro-razão** de pontos — toda entrada e saída de pontos de qualquer cliente é uma linha aqui. O "saldo" nunca é uma coluna própria: é sempre a soma calculada desta tabela (ver seção 9).

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | — | PK |
| `usuario_id` | `integer` | não | — | FK para `usuarios(id)`, sem `ON DELETE` |
| `quantidade` | `integer` | não | — | `CHECK (quantidade > 0)` — sempre positiva; o sinal vem da coluna `tipo`, nunca de um número negativo |
| `tipo` | `varchar(10)` | não | — | `CHECK` restringe a `entrada` ou `saida` |
| `descricao` | `text` | sim | — | texto livre, sempre preenchido pelo backend (nunca pelo cliente) |
| `criado_em` | `timestamp` | não | `now()` | |
| `origem` | `varchar(20)` | não | `'outro'` | `CHECK` restringe a `oficina`, `academia`, `promocao`, `ajuste`, `outro` — coluna legada (ver seção 24), hoje pouco usada na prática já que `empresa_id` cumpre esse papel de forma estruturada |
| `empresa_id` | `integer` | sim | — | FK para `empresas(id)`, sem `ON DELETE`; preenchido em entradas administrativas e em saídas de resgate (snapshot da recompensa), **não preenchido** em saídas manuais (`POST /pontos/saida`) |

**Constraints:** `movimentacoes_pontos_pkey`, `movimentacoes_pontos_usuario_id_fkey`, `movimentacoes_pontos_empresa_id_fkey`, `movimentacoes_pontos_quantidade_check`, `movimentacoes_pontos_tipo_check`, `movimentacoes_pontos_origem_check`, `NOT NULL` em `id`, `usuario_id`, `quantidade`, `tipo`, `criado_em`, `origem`.

**Sem índice** em `usuario_id` além do implícito de FK — toda consulta de saldo/histórico faz `WHERE usuario_id = $1`; ver seção 23.

### Tabela `recompensas_favoritas`

**Finalidade:** a relação **individual** de "este cliente favoritou esta recompensa" — a mais nova das 6 tabelas (ver seção 20, migration mais recente).

| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| `id` | `integer` (serial) | não | — | PK |
| `usuario_id` | `integer` | não | — | FK para `usuarios(id)`, **`ON DELETE CASCADE`** |
| `recompensa_id` | `integer` | não | — | FK para `recompensas(id)`, **`ON DELETE CASCADE`** |
| `criado_em` | `timestamp` | não | `now()` | |

**Constraints:** `recompensas_favoritas_pkey`, as duas FKs com `ON DELETE CASCADE`, **`UNIQUE (usuario_id, recompensa_id)`** — é essa constraint que impede duplo favorito (ver seção 9), `NOT NULL` em todas as colunas.

**Por que `ON DELETE CASCADE` só aqui:** esta tabela existe unicamente para representar a relação — apagar uma linha dela (desfavoritar) nunca deveria apagar usuário nem recompensa, e o inverso é seguro porque, se um usuário ou recompensa fossem excluídos de verdade algum dia, os favoritos órfãos devem sumir junto automaticamente em vez de virar lixo ou travar o `DELETE` com um erro de FK.

---

## 9. REGRAS DE NEGÓCIO

Todas as regras abaixo foram confirmadas lendo o controller correspondente. Formato: **CONDIÇÃO → AÇÃO → RESULTADO**.

### Cadastro e tipos de usuário
**Arquivo:** `src/controllers/user.controller.js` (`cadastrar`), `src/middlewares/validateUser.js`.

- CONDIÇÃO: `POST /usuarios` recebido, sem autenticação (rota pública).
  → AÇÃO: valida nome (≥2 caracteres), email (formato válido), senha (≥6 caracteres); gera hash bcrypt (10 rounds); gera `qr_token` aleatório (`crypto.randomBytes(32)`); insere com `tipo` **sempre e só** `'cliente'`, ignorando qualquer valor de `tipo` que venha no corpo da requisição.
  → RESULTADO: 201 com `{id, nome, email, telefone}` (nunca a senha). Email duplicado → 409.
- CONDIÇÃO: criar um usuário `admin` ou `funcionario`.
  → AÇÃO: **não existe rota pública para isso.** As únicas formas são os scripts `scripts/create-admin.js` e `scripts/create-funcionario.js`, rodados manualmente por quem tem acesso ao servidor/banco.
  → RESULTADO: não é possível um cliente se autopromover a admin/funcionário por nenhum caminho da API (confirmado por teste — ver seção 17).

### Pontos — entrada
**Arquivo:** `src/controllers/points.controller.js` (`entrada`), endpoint `POST /pontos/entrada`, admin+funcionário.

- CONDIÇÃO: admin ou funcionário envia `{usuario_id, quantidade, empresa_id, descricao?}`.
  → AÇÃO: trava a linha do usuário (`FOR UPDATE`) dentro de uma transação; confirma que o `usuario_id` é de um usuário com `tipo = 'cliente'` (senão 404 — **por padrão, não revela se o id existe mas não é cliente**); confirma que `empresa_id` é de uma empresa `ativo = true`; insere uma linha em `movimentacoes_pontos` com `tipo = 'entrada'`.
  → RESULTADO: 201 com a movimentação criada e o **novo saldo já recalculado** (nunca incrementado "à mão" no frontend).

### Pontos — saída
**Arquivo:** `points.controller.js` (`saida`), endpoint `POST /pontos/saida`, **admin apenas** (funcionário não pode).

- CONDIÇÃO: admin envia `{usuario_id, quantidade, descricao?}`.
  → AÇÃO: trava a linha do usuário; calcula o saldo atual a partir de `movimentacoes_pontos`; se `saldoAtual < quantidade`, rejeita (400 "Saldo de pontos insuficiente"); senão insere `tipo = 'saida'`.
  → RESULTADO: nunca deixa o saldo ficar negativo. **Observação de consistência:** ao contrário de `entrada()`, esta função **não confirma** que o `usuario_id` é `tipo = 'cliente'` — um admin poderia, em tese, registrar uma saída de pontos para outro admin/funcionário. Não é uma falha de autorização (já exige ser admin), é uma inconsistência de dados já identificada em auditoria (ver seção 29, item BAIXO).

### Saldo do cliente
**Arquivo:** `points.controller.js` (`saldo`), endpoint `GET /pontos/saldo`, qualquer papel autenticado.

- REGRA FIXA: `saldo = SOMA(entrada.quantidade) − SOMA(saida.quantidade)` sobre `movimentacoes_pontos WHERE usuario_id = <id do próprio token>`. **Nunca existe uma coluna `saldo` em `usuarios`** — é recalculado em toda consulta, em todo controller que precisa dele (pontos, admin dashboard, listagem de clientes, identificar cliente por QR).

### Empresas
**Arquivo:** `src/controllers/empresa.controller.js`.

- CONDIÇÃO: admin cria empresa (`POST /empresas`) com `{nome, slug}`.
  → AÇÃO: normaliza o slug (`src/utils/empresas.js:normalizarSlug` — minúsculo, sem acento, só `a-z0-9-`); grava com `ativo = true` por default.
  → RESULTADO: 201, ou 409 se o slug já existir.
- CONDIÇÃO: admin desativa uma empresa (`PATCH /empresas/:id/desativar`).
  → AÇÃO: só muda `ativo = false`.
  → RESULTADO: a empresa some dos seletores de nova recompensa/novo lançamento de pontos (`GET /empresas` só devolve `ativo = true`), mas **todo o histórico que já aponta para ela continua intacto** — recompensas, resgates e movimentações antigas não são tocados.

### Recompensas — criação e edição
**Arquivo:** `src/controllers/reward.controller.js`, `src/middlewares/validateRewardCreate.js`/`validateRewardUpdate.js`. Admin apenas para criar/editar/desativar/reativar.

- CONDIÇÃO: `POST /recompensas` com `{nome, descricao?, pontos_necessarios, empresa_id, imagem?}`.
  → AÇÃO: confirma que `empresa_id` existe e está ativa; se `imagem` vier, valida (ver seção 15); insere com `destacada = false` (default da coluna — **não pode ser definida na criação**, só depois via endpoint dedicado).
  → RESULTADO: 201 com a recompensa criada.
- CONDIÇÃO: `PUT /recompensas/:id` edita nome/descrição/pontos/empresa/imagem.
  → AÇÃO: campos omitidos mantêm o valor atual (`COALESCE`); **`ativo` e `destacada` nunca são lidos do corpo desta rota**, mesmo se enviados — só mudam pelos endpoints dedicados abaixo.
  → RESULTADO: 200 com a recompensa atualizada, ou 404/400.

### Recompensas — desativação/reativação
- CONDIÇÃO: `DELETE /recompensas/:id` (admin).
  → AÇÃO: `UPDATE ... SET ativo = false` — **nunca um `DELETE` de verdade**.
  → RESULTADO: recompensa some do catálogo do cliente (`GET /recompensas` filtra `ativo = true`), mas continua visível para o admin (`GET /recompensas/admin`, sem filtro) e **qualquer resgate antigo que a referencia continua intacto**.
- CONDIÇÃO: `PATCH /recompensas/:id/reativar` (admin).
  → AÇÃO: `UPDATE ... SET ativo = true`. Idempotente — reativar algo já ativo não é erro.

### Destaque global (⭐ do admin/funcionário)
**Arquivo:** `reward.controller.js` (`destacar`/`removerDestaque`), endpoints `PATCH /recompensas/:id/destacar` e `PATCH /recompensas/:id/remover-destaque`, **admin e funcionário** (únicas duas ações de escrita liberadas para funcionário fora do balcão de atendimento).

- CONDIÇÃO: admin OU funcionário chama `/destacar`.
  → AÇÃO: `UPDATE recompensas SET destacada = true WHERE id = $1`. Idempotente.
  → RESULTADO: a recompensa passa a aparecer na seção "Recompensas em destaque" da tela inicial de **todos os clientes** — é um valor global, não depende de quem está logado.
- CONDIÇÃO: cliente tenta chamar `/destacar` ou `/remover-destaque`.
  → RESULTADO: 403 (`roleMiddleware("admin", "funcionario")` não inclui `cliente`) — confirmado por teste (seção 17).

### Favoritos individuais (⭐ do cliente)
**Arquivo:** `src/controllers/favorito.controller.js`, endpoints `GET/POST/DELETE /favoritos[/:id]`, **cliente apenas**.

- CONDIÇÃO: cliente autenticado chama `POST /favoritos/:recompensa_id`.
  → AÇÃO: confirma que a recompensa existe (404 se não); `INSERT INTO recompensas_favoritas (usuario_id, recompensa_id) VALUES ($1,$2) ON CONFLICT DO NOTHING` — `usuario_id` **sempre e só** de `req.usuario.id` (JWT), nunca do corpo da requisição, mesmo que seja enviado.
  → RESULTADO: 201 idempotente — favoritar duas vezes nunca duplica linha (garantido pela `UNIQUE(usuario_id, recompensa_id)` do banco, não só pela aplicação).
- CONDIÇÃO: cliente chama `DELETE /favoritos/:recompensa_id`.
  → AÇÃO: `DELETE ... WHERE usuario_id = <do token> AND recompensa_id = $1`.
  → RESULTADO: 200, idempotente (desfavoritar algo que não era favorito não é erro). **Nunca apaga a recompensa em si.**
- CONDIÇÃO: recompensa favoritada é desativada pelo admin (`ativo = false`) depois.
  → RESULTADO: a relação de favorito **continua existindo** — `GET /favoritos` não filtra por `ativo`, de propósito. O frontend (`favoritos.js`) mostra a recompensa com um aviso "Indisponível no momento" em vez de escondê-la da lista.

### Diferença entre destaque e favorito (não confundir)
| | Destaque global | Favorito individual |
|---|---|---|
| Quem altera | Admin ou funcionário | Só o próprio cliente |
| Coluna/tabela | `recompensas.destacada` (booleano na própria linha) | Tabela separada `recompensas_favoritas` (relação usuário↔recompensa) |
| Visível para | Todos os clientes igual | Só quem favoritou |
| Endpoint | `PATCH /recompensas/:id/destacar` | `POST /favoritos/:id` |

### Resgate — criação
**Arquivo:** `src/controllers/redemption.controller.js` (`criar`), endpoint `POST /resgates`, cliente (na prática — a rota não tem `roleMiddleware`, mas o `usuario_id` é sempre o do próprio token, então funciona "para si mesmo" independente do papel).

- CONDIÇÃO: cliente envia `{recompensa_id}`.
  → AÇÃO (tudo em **uma única transação**): busca a recompensa e confirma `ativo = true`; trava a linha do usuário (`FOR UPDATE`); calcula o saldo real a partir de `movimentacoes_pontos`; se `saldo < pontos_necessarios`, rejeita (400); gera um código de reserva único (`gerarCodigoResgate()`, com retry via `SAVEPOINT` em caso de colisão — estatisticamente quase impossível); insere o resgate com `status = 'pendente_validacao'`; insere a saída de pontos correspondente.
  → RESULTADO: 201 com `{id, codigo, status: 'pendente_validacao', ...}`. **Os pontos já saem do saldo nesse exato momento** — não há uma etapa de "aprovação" posterior que descontaria depois (esse era um modelo antigo, removido — ver seção 19).

### Resgate — validação (uso no balcão)
**Arquivo:** `redemption.controller.js` (`validar`), endpoint `POST /resgates/validar`, admin+funcionário.

- CONDIÇÃO: funcionário/admin envia `{codigo}`.
  → AÇÃO: antes de tudo, chama `cancelarResgatesExpirados()` (ver regra de expiração abaixo); trava a linha do resgate pelo código (`FOR UPDATE`); se já `utilizado` → 409; se já `cancelado` → 409; senão `UPDATE status = 'utilizado'`.
  → RESULTADO: 200 com os dados do resgate. **Nunca mexe em pontos** — o desconto já aconteceu na criação.

### Resgate — expiração automática após 5 horas (regra central do produto)
**Arquivo:** `src/services/resgateExpiracao.service.js`, função `cancelarResgatesExpirados()`.

- CONDIÇÃO: `resgates.status = 'pendente_validacao'` **E** `criado_em + INTERVAL '5 hours' <= NOW()` (comparação feita inteiramente dentro do PostgreSQL, nunca com hora do servidor Node nem do navegador).
  → AÇÃO (por resgate elegível, cada um na sua própria transação): `SELECT ... FOR UPDATE` trava a linha; **reconfere** o status depois de travar (protege contra corrida — ver abaixo); `UPDATE status = 'cancelado'`; `INSERT INTO movimentacoes_pontos (usuario_id, quantidade, tipo, descricao) VALUES (<usuario>, <resgates.pontos>, 'entrada', 'Pontos devolvidos pelo cancelamento do resgate #<id>')`.
  → RESULTADO: o resgate original **nunca é apagado** — permanece no histórico com `status = 'cancelado'` para sempre. Os pontos voltam ao saldo do cliente, na quantidade **exata** que foi descontada (`resgates.pontos`, não um valor recalculado).
- CONDIÇÃO: resgate já está `utilizado` ou já `cancelado` quando a varredura roda.
  → RESULTADO: nunca é tocado — a query que seleciona candidatos já filtra `status = 'pendente_validacao'`, e a recheck depois do `FOR UPDATE` filtra de novo.

### Prevenção de dupla devolução (idempotência e concorrência)
- Cada resgate expirado é processado em sua **própria transação**, com `SELECT ... FOR UPDATE`.
- Se duas execuções da varredura rodarem ao mesmo tempo (ex.: a periódica e uma sob demanda, coincidindo), a segunda só consegue travar a linha **depois** que a primeira já deu `COMMIT` — nesse momento o status já não é mais `pendente_validacao`, então a segunda simplesmente pula aquele resgate sem inserir nada.
- Rodar a rotina duas vezes seguidas nunca gera uma segunda devolução — confirmado por teste (seção 18).

### Como a verificação das 5 horas é acionada (dois mecanismos, nenhum sozinho)
1. **Periódica:** `server.js` chama `iniciarLimpezaPeriodica()` uma vez no boot (que já roda `cancelarResgatesExpirados()` imediatamente) e depois a cada **5 minutos** (`setInterval`), enquanto o processo estiver de pé.
2. **Sob demanda:** chamada no início de `GET /resgates/meus`, `GET /resgates` (listagem admin), `POST /resgates/validar` (todos em `redemption.controller.js`) e `GET /admin/dashboard` (`admin.controller.js`) — assim, mesmo que o servidor tenha ficado horas parado, a primeira consulta de qualquer um desses endpoints já processa o atraso inteiro antes de responder.

### QR Code — identificação de cliente
**Arquivo:** `user.controller.js` (`buscarPorQrToken`), endpoint `GET /usuarios/qr/:qr_token`, admin+funcionário.
- CONDIÇÃO: funcionário/admin escaneia ou recebe o `qr_token` de um cliente.
  → AÇÃO: busca por `qr_token` **e** `tipo = 'cliente'`; calcula o saldo.
  → RESULTADO: devolve `{id, nome, telefone, saldo}` para o funcionário; **`email` só é incluído se `req.usuario.tipo === 'admin'`** — funcionário nunca vê o email do cliente por essa rota.

### Imagem de recompensa — upload, formato, dimensão
Ver seção 15 (seção dedicada, por ser extensa).

### Autorização — regra geral (vale para toda a API)
- O `usuario_id`/`tipo` usado em qualquer decisão de autorização **vem sempre de `req.usuario`**, que é populado pelo `authMiddleware` a partir do JWT verificado — nunca de um campo do corpo, da query string ou de um parâmetro de rota.
- Toda rota que altera dado de "um usuário específico" (favoritos, saldo, histórico, resgates "meus", perfil) usa `req.usuario.id`, nunca um id recebido do cliente.
- Toda rota que altera dado de "outro usuário específico" (lançar pontos, editar cadastro, identificar por QR) é restrita a `admin`/`funcionario` via `roleMiddleware`, e o alvo (`usuario_id`) vem sempre de um valor já validado no fluxo (o id devolvido por uma busca anterior), nunca de um campo livre digitável — ver seção 10.

---

## 10. USUÁRIOS E PERMISSÕES

### Matriz completa por endpoint

`✅` = permitido · `🚫` = bloqueado (403 pelo `roleMiddleware`) · `👤` = permitido só para o próprio recurso (nunca de terceiros)

| Endpoint | ADMIN | FUNCIONÁRIO | CLIENTE |
|---|---|---|---|
| `POST /login` | ✅ | ✅ | ✅ (rota pública, qualquer um) |
| `POST /usuarios` (cadastro) | ✅ | ✅ | ✅ (rota pública — sempre cria `cliente`) |
| `GET /usuarios/me` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `GET /usuarios` (lista completa) | ✅ | 🚫 | 🚫 |
| `GET /usuarios/qr/:qr_token` | ✅ | ✅ | 🚫 |
| `GET /usuarios/buscar-cliente` | ✅ | ✅ | 🚫 |
| `PUT /usuarios/:id` | ✅ | 🚫 | 🚫 |
| `GET /admin/dashboard` | ✅ | 🚫 | 🚫 |
| `POST /empresas` | ✅ | 🚫 | 🚫 |
| `GET /empresas` | ✅ | ✅ | ✅ (só ativas, sem dado administrativo) |
| `GET /empresas/admin` | ✅ | 🚫 | 🚫 |
| `GET /empresas/:id/detalhes` | ✅ | 🚫 | 🚫 |
| `PUT /empresas/:id` | ✅ | 🚫 | 🚫 |
| `PATCH /empresas/:id/ativar` \| `/desativar` | ✅ | 🚫 | 🚫 |
| `POST /pontos/entrada` | ✅ | ✅ | 🚫 |
| `POST /pontos/saida` | ✅ | 🚫 | 🚫 |
| `GET /pontos/saldo` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `GET /pontos/historico` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `GET /pontos/resumo` | ✅ | 🚫 | 🚫 |
| `POST /recompensas` | ✅ | 🚫 | 🚫 |
| `GET /recompensas` (catálogo) | ✅ | ✅ | ✅ |
| `GET /recompensas/admin` | ✅ | 🚫 | 🚫 |
| `PUT /recompensas/:id` | ✅ | 🚫 | 🚫 |
| `DELETE /recompensas/:id` | ✅ | 🚫 | 🚫 |
| `PATCH /recompensas/:id/reativar` | ✅ | 🚫 | 🚫 |
| `PATCH /recompensas/:id/destacar` \| `/remover-destaque` | ✅ | ✅ | 🚫 |
| `POST /resgates` | ✅ 👤 | ✅ 👤 | ✅ 👤 (sem `roleMiddleware` dedicado — sempre para o próprio `req.usuario.id`) |
| `GET /resgates` (todos) | ✅ | 🚫 | 🚫 |
| `GET /resgates/meus` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `POST /resgates/validar` | ✅ | ✅ | 🚫 |
| `GET /favoritos` | 🚫 | 🚫 | ✅ 👤 |
| `POST /favoritos/:id` | 🚫 | 🚫 | ✅ 👤 |
| `DELETE /favoritos/:id` | 🚫 | 🚫 | ✅ 👤 |

### O que cada perfil pode fazer (resumo)

- **Cliente:** cadastrar-se, logar, ver e editar seu próprio perfil (via QR/dados pessoais só de leitura — não há endpoint de cliente editar o próprio nome/email hoje, ver seção 23), ver saldo/histórico/resgates próprios, ver catálogo de recompensas, resgatar, favoritar/desfavoritar.
- **Funcionário:** tudo que o cliente vê como "catálogo" (recompensas, empresas), mais identificar cliente (QR ou busca), lançar pontos de entrada, validar resgates, destacar/remover destaque de recompensa. **Não pode:** ver a lista completa de usuários, criar/editar recompensa ou empresa, remover pontos.
- **Administrador:** tudo, sem exceção — é o único papel com acesso a `GET /usuarios` completo, CRUD de empresas/recompensas, remoção de pontos, dashboard agregado, "Ver mais" de empresa.

### Middlewares que controlam isso
- `src/middlewares/authMiddleware.js` — só confirma que existe um JWT válido; popula `req.usuario = {id, tipo}`.
- `src/middlewares/roleMiddleware.js` — fábrica `roleMiddleware(...papeis)`; compara `req.usuario.tipo` contra a lista permitida daquela rota; 401 se não autenticado, 403 se autenticado mas papel errado.

### De onde vem o ID do usuário (nunca do cliente)
Em toda rota "sobre si mesmo" (saldo, histórico, resgates, favoritos, perfil), o id usado é **sempre** `req.usuario.id`, extraído do JWT decodificado pelo `authMiddleware` — nunca de `req.body.usuario_id`, `req.query`, nem `req.params`. Isso é o que impede IDOR nessas rotas: mesmo que um cliente mal-intencionado envie `{usuario_id: 999}` no corpo de `POST /favoritos/:id`, o controller (`favorito.controller.js`) nunca lê esse campo.

### Como o sistema evita que um cliente force `tipo = admin`
`user.controller.js:cadastrar` desestrutura só `{nome, email, senha, telefone}` do corpo — a variável `tipo` **não existe** nesse destructuring, e o `INSERT` grava o literal `'cliente'` diretamente na query SQL. Não há nenhum caminho de código, em nenhum lugar do projeto, onde um valor de `tipo` fornecido pelo cliente chega a um `INSERT`/`UPDATE` em `usuarios.tipo`. As únicas escritas nessa coluna são: o cadastro público (sempre `'cliente'`) e os dois scripts `create-admin.js`/`create-funcionario.js` (rodados manualmente, fora da API).

### Quais dados cada perfil consegue visualizar
| Dado | Admin | Funcionário | Cliente |
|---|---|---|---|
| Email de qualquer cliente | ✅ (`GET /usuarios`, busca) | ✅ na busca manual; **🚫 na identificação por QR** (`buscarPorQrToken` só inclui email se `req.usuario.tipo === 'admin'`) | só o próprio |
| Telefone de qualquer cliente | ✅ | 🚫 (nem na busca manual, nem no QR) | só o próprio |
| `qr_token` de qualquer cliente | ✅ | ✅ (precisa, para lançar pontos/validar) | só o próprio |
| Código de reserva (`resgates.codigo`) de outro cliente | ✅ (listagem admin) | ✅ (só ao validar um código apresentado) | 🚫 (só os próprios, em `GET /resgates/meus`) |
| Senha (hash) de qualquer um | 🚫 — nunca devolvida pela API para ninguém, nem para o próprio admin | 🚫 | 🚫 |

---

## 11. AUTENTICAÇÃO

### Fluxo completo

```
1. Cliente digita email/senha em index.html (frontend/assets/js/app.js)
                    │
                    ▼
2. POST /login  { email, senha }
                    │
                    ▼
3. src/middlewares/validateLogin.js
   - formato de email (com exceção literal para "admin"/"funcio" — contas
     fixas de demonstração, ver seção 29)
   - senha com pelo menos 6 caracteres
                    │
                    ▼
4. src/controllers/auth.controller.js : login()
   a) SELECT * FROM usuarios WHERE email = $1
   b) bcrypt.compare(senha, hashEncontradoOuDummy)  ◄── ver "correção de
      timing attack" abaixo — roda SEMPRE, mesmo se o email não existir
   c) if (!usuario || !senhaCorreta) → 401 "Email ou senha inválidos"
   d) jwt.sign({id, tipo}, JWT_SECRET, {expiresIn: "1h"})
                    │
                    ▼
5. 200 { mensagem, token }
                    │
                    ▼
6. frontend/assets/js/app.js:
   window.Auth.salvarSessao(token, tipoDecodificado)
   → localStorage.setItem("movement_token", token)
   → localStorage.setItem("movement_tipo", tipo)
                    │
                    ▼
7. Toda chamada seguinte de window.api(...) (frontend/assets/js/api.js)
   adiciona automaticamente:  Authorization: Bearer <token>
                    │
                    ▼
8. src/middlewares/authMiddleware.js, em toda rota protegida:
   - confere prefixo "Bearer "
   - jwt.verify(token, JWT_SECRET)  → 401 se assinatura/expiração inválida
   - req.usuario = { id, tipo }   ◄── é isso que os controllers usam
```

### bcrypt / hash
- **10 rounds** (`bcrypt.hash(senha, 10)` em `user.controller.js:cadastrar` e nos scripts `create-admin.js`/`create-funcionario.js`).
- A senha em texto puro **nunca** é armazenada, nunca logada, nunca devolvida por nenhum endpoint.

### JWT — payload e expiração
- Payload: `{ id, tipo }` — **nada mais**. Não carrega nome, email, nem qualquer outro dado pessoal.
- `expiresIn: "1h"` (`auth.controller.js:33`) — depois de 1 hora, `jwt.verify` rejeita e o usuário precisa logar de novo. Não há refresh token nem renovação silenciosa.
- Verificado com a mesma `JWT_SECRET` em `authMiddleware.js`.

### Authorization Bearer
Todo endpoint protegido exige o header `Authorization: Bearer <token>` — sem o prefixo `Bearer ` exato (com espaço), o `authMiddleware` rejeita com 401 mesmo que o token em si seja válido.

### localStorage (frontend)
`frontend/assets/js/auth.js` guarda três chaves: `movement_token`, `movement_tipo`, `movement_email` (esta última só para exibição, ex.: "Olá, fulano@..."). **Decisão consciente e documentada como trade-off** — ver seção 17 (achado MÉDIO aceito para V1) e seção 23.

### Logout
`window.Auth.logout()` (`auth.js`) remove as três chaves do `localStorage` e redireciona para `index.html`. **Não há endpoint de logout no backend** — não é necessário, porque o JWT não tem estado no servidor (não há lista de tokens revogados); "logout" é puramente client-side.

### Rate limiter
- **Global** (`server.js`): 300 requisições / 15 minutos, por IP, aplicado a **toda** rota da API (montado depois do `express.static`, então carregar páginas/CSS/JS não consome essa cota).
- **Login** (`src/routes/auth.routes.js`): limite dedicado, **separado** do global.
  - **Produção (ou qualquer ambiente sem `NODE_ENV=development`): 10 tentativas / 15 minutos.**
  - **Local, quando `NODE_ENV=development` está definido no `.env`: 1000 / 15 minutos** — só para não travar testes manuais durante o desenvolvimento. É uma *allow-list* deliberada (`=== "development"`, não `!== "production"`): qualquer valor ausente ou diferente de `"development"` cai no limite de produção por padrão — inclusive se o Render nunca definir `NODE_ENV`.

### Timing attack no login — achado e correção (já implementada, **não commitada**)
**Arquivo:** `src/controllers/auth.controller.js`.

- **Causa original:** quando o email não existia, a função retornava 401 imediatamente após o `SELECT` (sem custo computacional). Quando o email existia com senha errada, só retornava 401 depois de `bcrypt.compare()` (lento de propósito, ~10 rounds). Essa assimetria de tempo (medida em ~70ms de diferença numa bateria de 20 amostras) permitia descobrir quais emails estão cadastrados só cronometrando a resposta, sem nunca ler o conteúdo dela.
- **Correção:** uma constante `HASH_DUMMY_PARA_IGUALAR_TEMPO` (um hash bcrypt fixo, gerado uma única vez, de uma senha aleatória que ninguém conhece — nunca recalculado em runtime) é usada como alvo do `bcrypt.compare()` quando o usuário não é encontrado. Assim, o `bcrypt.compare()` **roda sempre**, exista ou não o usuário — o custo computacional dos dois caminhos fica igual. A mensagem de erro e o status HTTP (401) continuam idênticos aos de antes.
- **Resultado medido depois da correção:** diferença de tempo caiu para ~1–4ms (dentro do ruído normal de variação de rede/processo), contra os ~70ms de antes — deixou de ser um sinal estatisticamente distinguível.
- **Status:** implementado e testado (20+ amostras, ver seção 18), mas **este arquivo está entre as alterações não commitadas** no momento deste documento (`git status` mostra `M src/controllers/auth.controller.js`).

### Mensagens de erro de autenticação
Sempre a mesma string genérica, para não vazar se o problema foi o email ou a senha: `"Email ou senha inválidos"` (401), tanto para email inexistente quanto para senha errada.

---

## 12. API COMPLETA

**35 endpoints confirmados** (varredura de `router.<metodo>(...)` em todos os arquivos de `src/routes/`). Nenhum endpoint listado abaixo é hipotético — todos existem no código atual.

Convenção usada nas tabelas: **Auth** = precisa de `Authorization: Bearer <token>` válido. **Perfil** = papéis aceitos pelo `roleMiddleware` (`—` significa que a rota não usa `roleMiddleware`, só `authMiddleware` ou nem isso).

### AUTH

| Método/Rota | Auth | Perfil | Body | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /login` | Não | — (pública) | `{email, senha}` | 200 `{mensagem, token}` | 400 (formato inválido), 401 (credenciais erradas), 429 (rate limit) | `auth.controller.js:login` / `validateLogin.js`, `loginLimiter` |

### USUÁRIOS

| Método/Rota | Auth | Perfil | Body/Params | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /usuarios` | Não | — (pública) | `{nome, email, senha, telefone?}` | 201 `{id, nome, email, telefone}` | 400, 409 (email duplicado) | `user.controller.js:cadastrar` / `validateUser.js` |
| `GET /usuarios/me` | Sim | qualquer | — | 200 `{id, nome, email, telefone, qr_token}` | 401, 404 | `user.controller.js:meuPerfil` |
| `GET /usuarios` | Sim | `admin` | — | 200 `[{id, nome, email, telefone, tipo, qr_token, criado_em, pontos}]` (todos os tipos) | 401, 403 | `user.controller.js:listar` |
| `GET /usuarios/qr/:qr_token` | Sim | `admin`, `funcionario` | param `qr_token` | 200 `{id, nome, telefone, saldo, email?}` (`email` só para admin) | 400, 401, 403, 404 | `user.controller.js:buscarPorQrToken` |
| `GET /usuarios/buscar-cliente` | Sim | `admin`, `funcionario` | query `?termo=` | 200 `[{id, nome, email, qr_token}]` (só `tipo='cliente'`, máx. 20) | 400, 401, 403 | `user.controller.js:buscarCliente` |
| `PUT /usuarios/:id` | Sim | `admin` | `{nome?, email?, telefone?}` | 200 usuário atualizado | 400, 401, 403, 404, 409 | `user.controller.js:atualizar` / `validateUserUpdate.js` |

### ADMIN

| Método/Rota | Auth | Perfil | Sucesso | Controller |
|---|---|---|---|---|
| `GET /admin/dashboard` | Sim | `admin` | 200 — objeto agregado: `total_clientes, recompensas_ativas, total_resgates, resgates_pendentes, pontos_concedidos, pontos_utilizados, pontos_por_empresa[], resgates_por_status{}, ranking_clientes[], ultimos_resgates[]` | `admin.controller.js:dashboard` |

### EMPRESAS

| Método/Rota | Auth | Perfil | Body/Params | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /empresas` | Sim | `admin` | `{nome, slug}` | 201 | 400, 401, 403, 409 (slug duplicado) | `empresa.controller.js:criar` / `validateEmpresaCreate.js` |
| `GET /empresas` | Sim | `admin`, `funcionario`, `cliente` | — | 200 `[{id, nome, slug}]` (só `ativo=true`) | 401, 403 | `empresa.controller.js:listar` |
| `GET /empresas/admin` | Sim | `admin` | — | 200 `[{id, nome, slug, ativo, criado_em}]` (todas) | 401, 403 | `empresa.controller.js:listarAdmin` |
| `GET /empresas/:id/detalhes` | Sim | `admin` | param `id` | 200 — objeto com `empresa{}, recompensas{total,ativas,inativas,destacadas,lista[]}, resgates{total,pendentes,utilizados,cancelados}, pontos{concedidos,utilizados,total_movimentacoes}, atividade{ultimo_resgate,recompensa_mais_resgatada}` | 400, 401, 403, 404 | `empresa.controller.js:detalhar` |
| `PUT /empresas/:id` | Sim | `admin` | `{nome?, slug?}` | 200 | 400, 401, 403, 404, 409 | `empresa.controller.js:atualizar` / `validateEmpresaUpdate.js` |
| `PATCH /empresas/:id/ativar` | Sim | `admin` | param `id` | 200 | 400, 401, 403, 404 | `empresa.controller.js:ativar` |
| `PATCH /empresas/:id/desativar` | Sim | `admin` | param `id` | 200 | 400, 401, 403, 404 | `empresa.controller.js:desativar` |

### PONTOS

| Método/Rota | Auth | Perfil | Body | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /pontos/entrada` | Sim | `admin`, `funcionario` | `{usuario_id, quantidade, empresa_id, descricao?}` | 201 movimentação + `saldo` | 400, 401, 403, 404 | `points.controller.js:entrada` / `validatePointsEntrada.js` |
| `POST /pontos/saida` | Sim | `admin` | `{usuario_id, quantidade, descricao?}` | 201 movimentação | 400, 401, 403, 404 | `points.controller.js:saida` / `validatePointsSaida.js` |
| `GET /pontos/saldo` | Sim | qualquer | — | 200 `{saldo}` (do próprio token) | 401 | `points.controller.js:saldo` |
| `GET /pontos/historico` | Sim | qualquer | — | 200 `[{id, quantidade, tipo, descricao, criado_em}]` (do próprio token) | 401 | `points.controller.js:historico` |
| `GET /pontos/resumo` | Sim | `admin` | — | 200 `{total_pontos_movimentados, total_entradas, total_saidas, entradas_por_origem{}}` | 401, 403 | `points.controller.js:resumoAdmin` |

### RECOMPENSAS

| Método/Rota | Auth | Perfil | Body/Params | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /recompensas` | Sim | `admin` | `{nome, descricao?, pontos_necessarios, empresa_id, imagem?}` | 201 | 400 (inclui erros de imagem — ver seção 15), 401, 403 | `reward.controller.js:criar` / `validateRewardCreate.js` |
| `GET /recompensas` | Sim | qualquer | — | 200 `[{..., destacada, favorita}]` (só `ativo=true`; `favorita` calculado para o usuário do token) | 401 | `reward.controller.js:listar` |
| `GET /recompensas/admin` | Sim | `admin` | — | 200 (ativas + inativas, com `empresa_ativa`) | 401, 403 | `reward.controller.js:listarAdmin` |
| `PUT /recompensas/:id` | Sim | `admin` | `{nome?, descricao?, pontos_necessarios?, empresa_id?, imagem?}` | 200 | 400, 401, 403, 404 | `reward.controller.js:atualizar` / `validateRewardUpdate.js` |
| `DELETE /recompensas/:id` | Sim | `admin` | param `id` | 200 (soft — `ativo=false`) | 400, 401, 403, 404 | `reward.controller.js:remover` |
| `PATCH /recompensas/:id/reativar` | Sim | `admin` | param `id` | 200 | 400, 401, 403, 404 | `reward.controller.js:reativar` |
| `PATCH /recompensas/:id/destacar` | Sim | `admin`, `funcionario` | param `id` | 200 (`destacada: true`) | 400, 401, 403, 404 | `reward.controller.js:destacar` |
| `PATCH /recompensas/:id/remover-destaque` | Sim | `admin`, `funcionario` | param `id` | 200 (`destacada: false`) | 400, 401, 403, 404 | `reward.controller.js:removerDestaque` |

### RESGATES

| Método/Rota | Auth | Perfil | Body | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `POST /resgates` | Sim | — (sempre para o próprio token) | `{recompensa_id}` | 201 `{id, codigo, status, pontos, ...}` | 400, 401, 404, 400 (saldo insuficiente / recompensa inativa) | `redemption.controller.js:criar` / `validateRedemptionCreate.js` |
| `GET /resgates` | Sim | `admin` | — | 200 todos os resgates (com `codigo`, `usuario_nome`, `empresa_nome`) | 401, 403 | `redemption.controller.js:listarAdmin` |
| `GET /resgates/meus` | Sim | qualquer | — | 200 resgates do próprio token | 401 | `redemption.controller.js:listarMeus` |
| `POST /resgates/validar` | Sim | `admin`, `funcionario` | `{codigo}` | 200 resgate validado | 400, 401, 403, 404, 409 (já utilizado/cancelado) | `redemption.controller.js:validar` / `validateResgateValidar.js` |

### FAVORITOS

| Método/Rota | Auth | Perfil | Params | Sucesso | Erros | Controller / Middleware |
|---|---|---|---|---|---|---|
| `GET /favoritos` | Sim | `cliente` | — | 200 recompensas favoritadas (do próprio token, inclusive inativas) | 401, 403 | `favorito.controller.js:listar` |
| `POST /favoritos/:id` | Sim | `cliente` | param `id` = `recompensa_id` | 201 `{recompensa_id, favorita: true}` | 400, 401, 403, 404 | `favorito.controller.js:favoritar` |
| `DELETE /favoritos/:id` | Sim | `cliente` | param `id` = `recompensa_id` | 200 `{recompensa_id, favorita: false}` | 400, 401, 403 | `favorito.controller.js:desfavoritar` |

### Comportamento geral de erros
- **400** — corpo/parâmetro mal formado (sempre pego por um middleware `validate*.js` antes do controller).
- **401** — sem token, token malformado, assinatura inválida ou expirada.
- **403** — autenticado, mas papel sem permissão para aquele endpoint.
- **404** — recurso (usuário/recompensa/empresa/resgate) não encontrado.
- **409** — conflito (email/slug/código duplicado, resgate já utilizado/cancelado).
- **413** — corpo da requisição acima do limite (10kb geral / 6mb só em `/recompensas`) — tratado por `src/middlewares/errorHandler.js`, nunca vira 500.
- **429** — rate limit excedido (`express-rate-limit`).
- **500** — erro interno genérico; a mensagem devolvida ao cliente **nunca inclui stack trace nem detalhe interno** — sempre uma string fixa como `"Erro ao listar recompensas"`. O erro real vai para `console.log`/`console.error` no servidor, nunca na resposta HTTP.
- **404 de rota inexistente** — handler dedicado em `server.js` devolve `{"mensagem": "Rota não encontrada"}`, nunca o 404 HTML padrão do Express.

---

## 13. FRONTEND

**16 páginas HTML**, todas em `frontend/`, servidas estaticamente. Nenhuma faz build — são carregadas diretamente pelo navegador. Todas seguem o mesmo padrão de `<script>` no final do `<body>`: `api.js` → `auth.js` → (`ui.js`, exceto em `index.html`/`cadastro.html`) → o script próprio da tela.

### Públicas (sem login)

**`index.html`** — tela de login. **JS:** `app.js`. **CSS:** `components.css` (não usa `dashboard.css`/`admin.css`). **Endpoints:** `POST /login`. **Fluxo:** se já existe sessão válida em `localStorage`, redireciona automaticamente para a home do tipo (`dashboard.html`/`funcionario.html`/`admin.html`); senão mostra o formulário. Estado de erro: mensagem inline (`#form-message`), nunca `alert()`. Estado de carregamento: botão vira "Entrando..." e desabilita.

**`cadastro.html`** — cadastro público de cliente. **JS:** `cadastro.js`. **Endpoints:** `POST /usuarios`. **Fluxo:** valida no cliente (espelhando as mesmas regras do backend, só para feedback imediato — quem decide de verdade é sempre o backend), envia, mostra sucesso e redireciona para `index.html` depois de 1.5s. Não faz login automático.

### Área do cliente (`window.UI.protegerPagina()`)

**`dashboard.html`** ("Início") — **JS:** `dashboard.js`. **Endpoints:** `GET /pontos/saldo`, `GET /recompensas`, `GET /pontos/historico`. **Seções:** saldo em destaque, atalhos rápidos, **"Recompensas em destaque"** (só recompensas com `destacada=true` — ver seção 9; estado vazio: "Nenhuma recompensa em destaque no momento."), atividade recente (5 últimas movimentações). Cada card de recompensa em destaque mostra o selo "⭐ Destaque" (estático) e uma estrela de favorito (interativa, chama `POST/DELETE /favoritos/:id`).

**`recompensas.html`** — catálogo completo. **JS:** `recompensas.js`. **Endpoints:** `GET /recompensas`, `GET /empresas`, `POST /resgates`, `POST/DELETE /favoritos/:id`. **Fluxo:** filtro por empresa (chips dinâmicos a partir de `GET /empresas`) + busca por texto (client-side, sobre os dados já carregados); cada card mostra imagem (ou monograma-fallback), nome, empresa, descrição, pontos, e dois selos independentes — destaque global (se aplicável) e favorito (sempre, clicável); botão "Resgatar" só aparece se o saldo cobre o preço; "Ver detalhes" abre modal com a descrição completa; ao resgatar, abre modal de sucesso com QR Code do código.

**`favoritos.html`** — lista pessoal de favoritos. **JS:** `favoritos.js`. **Endpoints:** `GET /favoritos`, `GET /pontos/saldo`, `POST /resgates`. **Fluxo:** mesmo card visual do catálogo; recompensa inativa favoritada aparece com aviso "Indisponível no momento" em vez de sumir da lista; clicar na estrela **remove o card da tela imediatamente** (não só desmarca — nesta tela, desfavoritar tira da lista). Estado vazio: "Você ainda não tem favoritos." + "Toque na estrela de uma recompensa para adicioná-la aqui."

**`meus-resgates.html`** — histórico de resgates do cliente. **JS:** `meus-resgates.js`. **Endpoints:** `GET /resgates/meus`, `GET /pontos/saldo`. **Fluxo:** cada item mostra status (pendente/utilizado/cancelado) com selo colorido; resgate `pendente_validacao` tem botão "Ver QR Code" (abre modal com código + QR); resgate `cancelado` mostra a nota "Pontos devolvidos automaticamente após o prazo de validação (5 horas)." e **nunca** mostra o botão de QR Code.

**`historico.html`** — extrato completo de pontos. **JS:** `historico.js`. **Endpoints:** `GET /pontos/historico`, `GET /pontos/saldo`. **Fluxo:** lista agrupada visualmente por data (cabeçalho de grupo inserido quando a data muda — a ordenação em si já vem pronta do backend).

**`perfil.html`** — dados pessoais + QR Code próprio. **JS:** `perfil.js`. **Endpoints:** `GET /usuarios/me`, `GET /pontos/saldo`, `GET /pontos/historico`, `GET /resgates/meus`. **Fluxo:** nome/email/telefone, QR Code pessoal (`qr_token`, com botão de copiar), resumo da conta (saldo, total recebido, total utilizado, quantidade de resgates — todos calculados aqui a partir de endpoints que já existiam, sem nenhum endpoint de agregação dedicado) e atividade recente.

Todas as páginas do cliente compartilham a navegação inferior (`bottom-nav`, vira sidebar em telas largas — ver `dashboard.css`) com 6 itens: Início, Histórico, Recompensas, **Favoritos**, Meus Resgates, Perfil.

### Área do funcionário (`window.UI.protegerPaginaFuncionario()`)

**`funcionario.html`** — única tela do funcionário, organizada em **3 abas** (controle segmentado, sempre visível, sem esconder atrás de menu): **JS:** `funcionario.js`.
1. **"Atender cliente"** — identificar por QR (câmera, via `jsQR`) ou busca manual (`GET /usuarios/buscar-cliente`), depois lançar pontos (`POST /pontos/entrada`).
2. **"Validar resgate"** — digitar código ou ler QR Code (`POST /resgates/validar`).
3. **"Recompensas"** — lista de recompensas ativas (`GET /recompensas`) com a estrela de destaque (`PATCH .../destacar` \| `/remover-destaque`) — **sem** criar/editar/desativar, que continua exclusivo do admin.

### Área administrativa (`window.UI.protegerPaginaAdmin()`)

**`admin.html`** — dashboard agregado. **JS:** `admin.js`. **Endpoints:** `GET /admin/dashboard`. KPIs (clientes, recompensas ativas, resgates totais/pendentes, pontos concedidos/utilizados), pontos por empresa (barras), resgates por status (barras), ranking de clientes, últimos 10 resgates.

**`admin-clientes.html`** — gestão de usuários (apesar do nome, mostra **todos os tipos** — cliente/funcionário/admin, com badge de tipo). **JS:** `admin-clientes.js`. **Endpoints:** `GET /usuarios`, `PUT /usuarios/:id`, `POST /pontos/entrada`\|`/saida`, `GET /empresas`. **Fluxo:** tabela com busca; editar dados; **+/− Pontos** e **Ver QR Code** só aparecem em linhas de `tipo='cliente'` (escondidos para admin/funcionário, já que essas ações não fazem sentido para eles e o backend rejeitaria `entrada` para não-cliente).

**`admin-empresas.html`** — CRUD de empresas + **"Ver mais"**. **JS:** `admin-empresas.js`. **Endpoints:** `GET /empresas/admin`, `POST /empresas`, `PUT /empresas/:id`, `PATCH .../ativar`\|`/desativar`, `GET /empresas/:id/detalhes`. **Fluxo:** tabela com status; modal de criar/editar com slug auto-gerado a partir do nome; botão **"Ver mais"** abre modal com informações da empresa, contagem de recompensas (total/ativas/inativas/em destaque), lista de recompensas com imagem/pontos/status, contagem de resgates por status, pontos concedidos/utilizados, último resgate e recompensa mais resgatada.

**`admin-recompensas.html`** — CRUD de recompensas + upload/recorte de imagem + destaque. **JS:** `admin-recompensas.js` (o script mais longo do frontend). **Endpoints:** `GET /recompensas/admin`, `POST /recompensas`, `PUT /recompensas/:id`, `DELETE /recompensas/:id`, `PATCH .../reativar`\|`/destacar`\|`/remover-destaque`, `GET /empresas`. **Fluxo:** tabela com colunas Nome/Empresa/Descrição/Pontos/Status/**Destaque**/Ações; modal de criar/editar com **editor de recorte de imagem embutido** (ver seção 15); estrela de destaque com feedback visual imediato (otimista) e reversão em caso de erro de rede.

**`admin-resgates.html`** — listagem somente-consulta de todos os resgates. **JS:** `admin-resgates.js`. **Endpoints:** `GET /resgates`. Ordenados com "aguardando utilização" primeiro.

**`admin-validar.html`** — validar resgate por código ou câmera (mesmo padrão de scanner de `funcionario.html`). **JS:** `admin-validar.js`. **Endpoints:** `POST /resgates/validar`.

**`admin-identificar-cliente.html`** — identificar cliente por QR/busca e lançar pontos (mesmo fluxo do funcionário, versão admin). **JS:** `admin-identificar-cliente.js`. **Endpoints:** `GET /usuarios/qr/:qr_token`, `GET /usuarios` (busca local sobre a lista completa), `POST /pontos/entrada`, `GET /empresas`.

### Estados de vazio/erro/carregamento (padrão consistente em todo o frontend)
- **Carregamento:** esqueletos visuais (`.reward-card-skeleton`, `.activity-item-skeleton` etc.) exibidos no HTML antes do JS rodar, substituídos assim que os dados chegam.
- **Vazio:** função compartilhada `window.UI.definirPlaceholder(container, texto, tag)` (`ui.js`) — usada em toda tela para "nenhum item encontrado", nunca uma tabela/lista simplesmente em branco.
- **Erro de rede/API:** todo `window.api(...)` que falha lança `ApiError` (`api.js`), capturado em cada tela via `try/catch` e traduzido em mensagem amigável (`window.UI.mensagemDeErro`) — nunca uma exceção não tratada, nunca um `alert()`.

---

## 14. FLUXOS COMPLETOS

Formato: AÇÃO DO USUÁRIO → FRONTEND → API → MIDDLEWARE → CONTROLLER → (SERVICE) → BANCO → RESPOSTA → ATUALIZAÇÃO DA INTERFACE.

### FLUXO 1 — Cadastro
Preenche formulário em `cadastro.html` → `cadastro.js` valida localmente e chama `window.api` → `POST /usuarios` → `validateUser.js` → `user.controller.js:cadastrar` (hash bcrypt, gera `qr_token`, `tipo` fixo `'cliente'`) → `INSERT INTO usuarios` → 201 → mensagem de sucesso, redireciona para `index.html` em 1.5s.

### FLUXO 2 — Login
Preenche formulário em `index.html` → `app.js` → `POST /login` → `validateLogin.js` → `auth.controller.js:login` (SELECT, bcrypt.compare, jwt.sign) → nenhuma escrita no banco → 200 `{token}` → `app.js` salva token/tipo no `localStorage` → redireciona para a home do tipo.

### FLUXO 3 — Cliente recebe pontos
Funcionário/admin identifica o cliente (Fluxo 7) → preenche quantidade+empresa em `admin-clientes.html`/`admin-identificar-cliente.html`/`funcionario.html` → `POST /pontos/entrada` → `validatePointsEntrada.js` → `points.controller.js:entrada` (trava linha do cliente, confirma `tipo='cliente'` e empresa ativa) → `INSERT INTO movimentacoes_pontos (tipo='entrada')` → 201 com novo saldo → tela atualiza o saldo exibido a partir da resposta (nunca soma localmente).

### FLUXO 4 — Cliente visualiza saldo
Abre `dashboard.html`/`historico.html`/`meus-resgates.html`/`perfil.html` → script da tela → `GET /pontos/saldo` → `points.controller.js:saldo` (soma `movimentacoes_pontos` do `req.usuario.id`) → 200 `{saldo}` → valor exibido no cabeçalho.

### FLUXO 5 — Cliente escolhe recompensa
Abre `recompensas.html` → `recompensas.js` → `GET /recompensas` + `GET /empresas` (paralelo) → `reward.controller.js:listar` (filtra `ativo=true`, calcula `favorita` por `EXISTS`) → 200 → renderiza grade de cards, disponibilidade calculada no frontend comparando com o saldo já carregado (`GET /pontos/saldo`).

### FLUXO 6 — Cliente resgata
Clica "Resgatar" → modal de confirmação → confirma → `POST /resgates {recompensa_id}` → `validateRedemptionCreate.js` → `redemption.controller.js:criar` (transação: trava usuário, calcula saldo, gera código único, insere resgate `pendente_validacao` + saída de pontos) → **BANCO:** `INSERT resgates` + `INSERT movimentacoes_pontos` (mesma transação) → 201 `{codigo, ...}` → modal de sucesso com QR Code do código; tela recarrega saldo e catálogo.

### FLUXO 7 — Funcionário identifica cliente
Abre aba "Atender cliente" (`funcionario.html`) ou `admin-identificar-cliente.html` → lê QR pela câmera (`jsQR`) ou busca por nome/email → `GET /usuarios/qr/:qr_token` ou `GET /usuarios/buscar-cliente` → `user.controller.js:buscarPorQrToken`/`buscarCliente` → `SELECT` filtrado por `tipo='cliente'` → 200 (sem telefone/tipo/data para a busca; sem email para funcionário no QR) → card do cliente identificado aparece, libera o formulário de lançar pontos.

### FLUXO 8 — Funcionário valida resgate
Cliente mostra o código/QR do resgate → funcionário digita ou lê pela câmera → `POST /resgates/validar {codigo}` → `validateResgateValidar.js` → `redemption.controller.js:validar` (chama `cancelarResgatesExpirados()` primeiro, depois trava a linha do resgate pelo código, confere status, `UPDATE status='utilizado'`) → 200 → tela mostra "Resgate validado com sucesso" + detalhes (recompensa, pontos).

### FLUXO 9 — Resgate expira após 5 horas
**Sem ação de usuário** — dois gatilhos possíveis: (a) `server.js` roda `iniciarLimpezaPeriodica()` a cada 5 min; (b) qualquer chamada a `GET /resgates/meus`, `GET /resgates`, `POST /resgates/validar` ou `GET /admin/dashboard` dispara `cancelarResgatesExpirados()` no início. → `resgateExpiracao.service.js` seleciona resgates `pendente_validacao` com `criado_em + 5h <= NOW()` → para cada um, transação própria com `FOR UPDATE` → `UPDATE status='cancelado'`.

### FLUXO 10 — Pontos são devolvidos
Continuação do Fluxo 9, **mesma transação**: `INSERT INTO movimentacoes_pontos (usuario_id, quantidade=resgates.pontos, tipo='entrada', descricao='Pontos devolvidos pelo cancelamento do resgate #<id>')` → `COMMIT` → na próxima vez que o cliente abrir "Meus Resgates" ou o histórico, verá o resgate como cancelado e a entrada de devolução no extrato.

### FLUXO 11 — Admin cria recompensa
`admin-recompensas.html` → "Nova recompensa" → preenche nome/pontos/empresa (+ imagem opcional, ver Fluxo 12) → `POST /recompensas` → `validateRewardCreate.js` (inclui `validarImagem` se houver imagem) → `reward.controller.js:criar` (confirma empresa ativa) → `INSERT INTO recompensas` (`destacada=false`, `ativo=true` por default) → 201 → tabela recarrega.

### FLUXO 12 — Admin adiciona imagem
Dentro do modal de criar/editar recompensa, seleciona um arquivo → `admin-recompensas.js` lê como data URL (`FileReader`) → abre o editor de recorte (Fluxo 13) → ao aplicar, o **canvas já gera o JPEG final em base64** → esse valor vai no campo `imagem` do `POST`/`PUT` acima → backend valida magic bytes + dimensão (seção 15) → se aprovado, grava a string base64 inteira na coluna `recompensas.imagem` (`TEXT`).

### FLUXO 13 — Editor de crop da imagem
Arquivo escolhido → `carregarImagemNoEditor` calcula a escala mínima que cobre a moldura (`calcularBaseScale`) → admin arrasta (`pointerdown`/`pointermove`, funciona com mouse e toque) e ajusta zoom (slider, até 300%) → `aplicarTransformacao` reposiciona o `<img>` via `left/top/width/height` → ao clicar "Usar esta foto", `gerarRecorteFinal()` desenha exatamente a área visível da moldura num `<canvas>` de **1000×750px fixos** e exporta `canvas.toDataURL("image/jpeg", 0.82)` — é esse JPEG, sempre nesse tamanho exato, que vai para o backend.

### FLUXO 14 — Admin destaca recompensa
Clica na estrela ☆ na coluna "Destaque" (`admin-recompensas.html`) → feedback visual imediato (otimista) → `PATCH /recompensas/:id/destacar` → `reward.controller.js:destacar` → `UPDATE recompensas SET destacada=true` → 200 → estrela vira ⭐ (confirmada); se a chamada falhar, reverte visualmente e mostra erro.

### FLUXO 15 — Funcionário destaca recompensa
Mesmo endpoint do Fluxo 14, a partir da aba "Recompensas" em `funcionario.html` — mesma permissão (`roleMiddleware("admin","funcionario")`), interface mais simples (sem tabela administrativa completa, só nome+pontos+estrela).

### FLUXO 16 — Cliente favorita recompensa
Clica na estrela ☆ em qualquer card (dashboard, catálogo) → `evento.stopPropagation()` (nunca abre o modal de resgate/detalhes por engano) → `POST /favoritos/:recompensa_id` → `favorito.controller.js:favoritar` (`usuario_id` do token) → `INSERT ... ON CONFLICT DO NOTHING` → 201 → estrela vira ⭐.

### FLUXO 17 — Cliente desfavorita
Clica na estrela ⭐ já marcada → `DELETE /favoritos/:recompensa_id` → `favorito.controller.js:desfavoritar` → `DELETE FROM recompensas_favoritas WHERE usuario_id=... AND recompensa_id=...` → 200 → em `recompensas.html`/`dashboard.html` a estrela vira ☆; em `favoritos.html` o card **some da lista**.

### FLUXO 18 — Cliente usa a página Perfil
Abre `perfil.html` → `perfil.js` chama em paralelo `GET /usuarios/me`, `GET /pontos/saldo`, `GET /pontos/historico`, `GET /resgates/meus` → renderiza nome/email/telefone, QR Code pessoal (biblioteca `qrcodejs` sobre `qr_token`), resumo (saldo, total recebido, total utilizado — somados aqui a partir do histórico completo — e quantidade de resgates) e as 5 atividades mais recentes.

### FLUXO 19 — Admin consulta empresa e detalhes ("Ver mais")
`admin-empresas.html` → clica "Ver mais" numa linha → `GET /empresas/:id/detalhes` → `empresa.controller.js:detalhar` (4 consultas de agregação em paralelo, cada uma sobre uma tabela só, para nunca duplicar contagem por JOIN) → 200 objeto completo (seção 12) → modal renderiza informações, recompensas (com miniaturas), resgates por status, pontos e atividade recente.

---

## 15. RECOMPENSAS E IMAGENS

### Como a imagem é enviada e armazenada
- O upload nunca é um arquivo multipart tradicional — é sempre uma **data URL base64** dentro do JSON do `POST`/`PUT /recompensas` (campo `imagem`, ex.: `"data:image/jpeg;base64,/9j/4AAQ..."`).
- É armazenada **inteira, como string**, na coluna `recompensas.imagem` (`TEXT`, nullable) — **não existe arquivo em disco, não existe bucket externo**. O Postgres é o único lugar onde a imagem vive.
- É servida de volta exatamente como foi salva, dentro do JSON de `GET /recompensas`/`GET /recompensas/admin`, e usada diretamente como `src` de uma tag `<img>` no frontend.

### Por que armazenar assim (decisão deliberada, não acidental)
O backend roda no Render, cujo sistema de arquivos é **efêmero** — qualquer arquivo gravado localmente pelo processo Node é perdido a cada redeploy ou reinício. O PostgreSQL gerenciado, ao contrário, é persistente. Guardar a imagem como base64 dentro de uma coluna `TEXT` resolve isso sem precisar contratar/configurar nenhum serviço de storage de objetos (S3, Cloudinary, etc.) — sem custo adicional, sem dependência nova, sem chave de API extra para gerenciar. Ver seção 24 (decisão técnica) e seção 23 (limitação).

### Limite de tamanho (bytes)
- **Rota `/recompensas`:** `express.json({ limit: "6mb" })`, montado especificamente para esse caminho em `server.js` (antes do limite geral de 10kb, que se aplicaria a todo o resto) — permite um corpo de requisição maior só onde a imagem realmente trafega.
- **Dentro da validação (`src/utils/validarImagem.js`):** a própria string da imagem não pode passar de **5MB** (`IMAGEM_TAMANHO_MAXIMO`) — cerca de 3.7MB de imagem real depois de decodificado o base64. Uma imagem entre 5MB e 6MB de string ainda passa pelo limite de body da rota, mas é rejeitada por este segundo limite com 400 (não com o 413 genérico) — as duas camadas foram testadas separadamente (seção 18).

### Validação de magic bytes (o que valida o CONTEÚDO, não só o rótulo)
Antes desta correção (ver seção 17), o backend só conferia se a string **começava** com `data:image/(jpeg|png|webp);base64,` e se o restante era um alfabeto base64 válido — nunca olhava para os bytes reais. Isso permitia, por exemplo, enviar texto puro ou HTML disfarçado de PNG (o rótulo mente, o conteúdo não é checado).

**Correção implementada (`src/utils/validarImagem.js`, não commitada ainda):**
1. Decodifica o base64 para um `Buffer`.
2. `detectarFormatoReal(buffer)` lê os primeiros bytes e identifica o formato de verdade:
   - **PNG:** assinatura fixa de 8 bytes `89 50 4E 47 0D 0A 1A 0A`.
   - **JPEG:** todo arquivo começa com `FF D8 FF`.
   - **WEBP:** contêiner RIFF com a string `"WEBP"` no byte 8.
3. Compara o formato **real** com o rótulo **declarado** no `data:image/xxx` — se não baterem, ou se o conteúdo não corresponder a nenhum dos três formatos, a imagem é rejeitada com 400.
4. **SVG continua fora da lista** — nem chega a passar pela checagem de magic bytes, porque o próprio rótulo `image/svg+xml` já não bate com o regex que só aceita `jpeg|png|webp`. Isso é importante porque SVG pode conter `<script>`/`onload`.

### Validação de dimensões (largura × altura reais)
Depois de confirmado o formato real, a largura/altura são lidas **direto da estrutura do arquivo** (sem decodificar os pixels, sem nenhuma lib de imagem):
- **PNG:** o chunk `IHDR` (sempre o primeiro do arquivo) guarda largura e altura em 4 bytes cada, logo após a assinatura.
- **JPEG:** percorre os marcadores até achar um `SOF` (Start Of Frame — `0xC0`–`0xCF`, exceto `0xC4`/`0xC8`/`0xCC`), cujo corpo começa com altura/largura em 2 bytes cada.
- **WEBP:** depende do subformato do chunk (`VP8 ` lossy, `VP8L` lossless, `VP8X` extended) — cada um guarda as dimensões numa posição diferente, documentada no próprio código-fonte (`src/utils/validarImagem.js`).

**Limite escolhido: 4000×4000 pixels** (`LARGURA_MAXIMA`/`ALTURA_MAXIMA`). Justificativa (documentada no próprio arquivo): o editor de recorte do admin sempre gera exatamente **1000×750** — é o único tamanho que o fluxo real da aplicação produz hoje. 4000×4000 dá **4× de margem** em cada dimensão (espaço para uma foto de resolução mais alta enviada fora do editor, ou um recorte maior no futuro), e ainda assim bloqueia com folga uma imagem "bomba de descompressão" — um arquivo de poucos KB que declara dimensões de dezenas de milhares de pixels e travaria o navegador de quem visualiza a recompensa.

### Crop e compressão (no navegador, nunca no servidor)
Toda a etapa de recorte/redimensionamento acontece **inteiramente no `<canvas>` do navegador do admin** (`admin-recompensas.js`) — o backend nunca recebe o arquivo original, só o resultado já processado. Ver Fluxo 13 (seção 14) para o passo a passo. Saída sempre: `1000×750px`, `image/jpeg`, qualidade `0.82`.

### Edição e remoção
- **Editar:** `PUT /recompensas/:id` com `imagem` presente no corpo substitui a foto atual.
- **Remover:** `PUT /recompensas/:id` com `imagem: null` (explícito) — `reward.controller.js:atualizar` distingue "campo ausente" (não mexe na foto) de "campo `null`" (remove) via `Object.prototype.hasOwnProperty`.
- **Omitir o campo:** mantém a foto atual sem alteração.

### Fallback sem imagem
Quando `recompensas.imagem` é `null`, o frontend (em toda tela que mostra cards — `dashboard.js`, `recompensas.js`, `favoritos.js`, `admin-empresas.js`) desenha um placeholder: um gradiente de fundo (uma de 5 variações, escolhida deterministicamente por um hash simples do nome da empresa/recompensa — `obterVarianteMedia`) com o **monograma** (primeira letra do nome da empresa, ou da recompensa se não houver empresa) centralizado. Nunca uma URL de imagem quebrada, nunca um espaço em branco.

### Exibição no dashboard × no catálogo
- **Dashboard** (`dashboard.js`): só recompensas com `destacada=true`; cada card mostra o selo estático "⭐ Destaque" (todas ali já são destacadas, mas o selo reforça visualmente) + estrela de favorito interativa.
- **Catálogo** (`recompensas.js`): todas as recompensas ativas, misturando destacadas e não-destacadas; o selo "⭐ Destaque" só aparece nas que realmente são (`recompensa.destacada === true`), já que ali essa informação distingue uma recompensa da outra.

### Limitações desta arquitetura (ver também seção 23)
- Toda imagem trafega inteira em cada resposta de `GET /recompensas`/`GET /recompensas/admin` — não há paginação nem `GET` de uma recompensa isolada, então o payload cresce proporcionalmente ao número de recompensas com foto.
- Sem CDN/cache de imagem dedicado — cada carregamento de página busca a imagem de novo via a API (embora o navegador ainda faça cache HTTP normal da resposta JSON, sujeito às regras de cache padrão, não otimizadas para isso — ver seção 17).
- O Postgres não foi desenhado para ser um storage de blobs em grande escala — funciona bem no volume atual (dezenas de recompensas), mas não é a escolha certa se o catálogo crescer para milhares de itens com foto.

---

## 16. QR CODES

Existem **dois QR Codes completamente diferentes** no sistema — não confundir (o próprio pedido de auditoria de segurança tratou isso como ponto de atenção, ver seção 17).

### QR do cliente (identificação de pessoa)
- **Coluna:** `usuarios.qr_token` (`varchar(64)`, `UNIQUE`, `NOT NULL`).
- **Geração:** `src/utils/qrTokenUsuario.js:gerarQrTokenUsuario()` — `crypto.randomBytes(32).toString("hex")` → 32 bytes = **256 bits de entropia**, nunca `Math.random()`. Gerado uma vez no cadastro (`user.controller.js:cadastrar`) e nunca muda depois.
- **O que ele contém:** nada além de si mesmo — não é nome, email nem qualquer dado pessoal codificado; é um identificador opaco.
- **Onde é consultado:** `GET /usuarios/qr/:qr_token`, só `admin`/`funcionario`.
- **Permissões:** cliente nunca consegue consultar o QR de outro cliente (a rota nem está liberada para o papel `cliente`); a resposta traz nome/telefone/saldo para funcionário, e adicionalmente o email só para admin.
- **Segurança:** 256 bits torna força bruta inviável mesmo sem rate limit dedicado; e mesmo que alguém tentasse, precisaria primeiro de um token JWT válido de admin/funcionário (a rota exige autenticação + papel), o que já elimina o cenário de ataque anônimo.

### QR/código de resgate (transação pontual)
- **Coluna:** `resgates.codigo` (`varchar(12)`, `UNIQUE`, `NOT NULL`).
- **Geração:** `src/utils/codigoResgate.js:gerarCodigoResgate()` — 8 caracteres sorteados de um alfabeto de 31 símbolos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, sem `0/O/1/I/L` para evitar confusão na leitura/digitação humana), usando `crypto.randomInt` (sem viés de módulo). Entropia: ≈ log₂(31⁸) ≈ **40 bits** — bem menor que o QR do cliente, de propósito, porque este código também precisa ser **digitável à mão** no balcão como alternativa ao QR Code.
- **Gerado a cada resgate**, com checagem de colisão (retry via `SAVEPOINT`, praticamente nunca necessário dado o espaço de 31⁸ ≈ 852 bilhões de combinações).
- **Onde é consultado:** `POST /resgates/validar`, `admin`/`funcionario`.
- **Reuso:** um código só pode ser validado **uma vez** — depois de `utilizado` ou `cancelado`, qualquer nova tentativa recebe 409.
- **Segurança:** 40 bits é muito menos que 256, mas o endpoint de validação exige autenticação de admin/funcionário e está sob o rate limit global (300/15min) — inviabiliza força bruta anônima; um ataque só seria viável a partir de uma conta de funcionário já comprometida, cenário em que o atacante já teria acesso mais direto (ex.: consultar a listagem administrativa de resgates).

### Como são exibidos (renderização)
Ambos usam a mesma biblioteca de terceiro, **qrcodejs** (via CDN), instanciada de forma idêntica em `admin-clientes.js` (QR do cliente), `perfil.js` (QR do próprio cliente), `recompensas.js`/`meus-resgates.js` (QR do código de resgate) — só o tamanho em pixels muda entre telas.

### Como são lidos (scanner)
`funcionario.js`, `admin-validar.js` e `admin-identificar-cliente.js` implementam o mesmo padrão de scanner: `navigator.mediaDevices.getUserMedia` (câmera traseira) → desenha cada frame num `<canvas>` oculto → **jsQR** (via CDN) decodifica o texto do QR a partir dos pixels → para a câmera assim que uma leitura é bem-sucedida.

---

## 17. SEGURANÇA

Esta seção resume três rodadas de auditoria de segurança já realizadas durante o desenvolvimento (a mais recente delas confirmou **"APTO PARA CONGELAR V1"**), mais as duas correções que resultaram delas. Todos os itens abaixo foram testados ativamente (não só revisados por leitura de código) — ver seção 18 para a metodologia e os números de teste.

### CORRIGIDO

| Item | O que era o problema | Correção | Arquivo |
|---|---|---|---|
| **Timing attack / enumeração de usuário no login** | Diferença de tempo mensurável (~70ms) entre "email não existe" e "email existe, senha errada", permitindo descobrir emails cadastrados só cronometrando a resposta | `bcrypt.compare()` roda sempre, contra um hash dummy fixo quando o usuário não existe — ver seção 11 | `src/controllers/auth.controller.js` (**não commitado**) |
| **Upload de imagem sem validação real de conteúdo** | Só validava o rótulo declarado + charset base64 — aceitava texto/HTML disfarçado de imagem, sem checar magic bytes nem dimensões | Detecção real de formato por magic bytes (PNG/JPEG/WEBP) + limite de dimensão (4000×4000px) — ver seção 15 | `src/utils/validarImagem.js` (**não commitado**) |

### MITIGADO (o risco existe em teoria, mas outra camada já reduz o impacto na prática)

| Item | Por que é considerado mitigado |
|---|---|
| Nome/descrição de recompensa aceitam `<script>`/HTML sem sanitização no backend | O frontend **nunca** usa `innerHTML` com dado vindo da API — confirmado por varredura em todos os 19 arquivos JS do frontend, sempre `textContent`. Testado ao vivo num navegador real: um payload `<script>alert(...)</script>` salvo como nome de recompensa não executa em nenhuma tela. A CSP (abaixo) também bloquearia script inline mesmo que algo escapasse. |
| Entropia do código de resgate (~40 bits) bem menor que o QR do cliente (256 bits) | O endpoint de validação exige autenticação de admin/funcionário + está sob rate limit — não é um alvo de força bruta anônima viável (ver seção 16). |
| CORS_ORIGIN local aponta para uma origem de desenvolvimento não usada (`localhost:5173`) | Sem impacto de segurança real: a autenticação é via header `Authorization`, não cookie — mesmo uma origem cruzada permissiva não teria como roubar o token sem já ter XSS (que não foi encontrado). |

### ACEITO PARA V1 (decisão consciente de não bloquear o lançamento por isso)

| Item | Razão da aceitação |
|---|---|
| **JWT em `localStorage`**, não em cookie `httpOnly` | Amplia o estrago de um XSS *futuro* (token ficaria acessível a qualquer script), mas nenhum XSS foi encontrado hoje, e migrar para cookie exigiria redesenhar CORS/CSRF — mudança grande demais para o V1. |
| **Política de senha fraca** (mínimo 6 caracteres, sem exigência de maiúscula/número/símbolo) | Aceito para a fase de validação atual; recomendado reforçar antes de uma base de usuários maior. |
| **Identificadores de login fixos e previsíveis** (`"admin"`, `"funcio"` como exceção ao formato de email — `validateLogin.js`) | Contas de demonstração conhecidas; recomenda-se confirmar senha forte nelas em produção. |
| **Sem validação de tamanho máximo de string** (nome/email/telefone acima do limite da coluna gera 500 em vez de 400) | É um problema de UX/robustez, não de segurança — não permite corromper dados nem injetar nada. |
| **`points.controller.js:saida()`** não confirma `tipo='cliente'` (diferente de `entrada()`) | Só exercitável por quem já é admin — não é uma falha de autorização. |
| **Sem índices** em `movimentacoes_pontos.usuario_id`, `resgates.status`, etc. | Sem impacto perceptível na escala atual de dados. |
| **Sem `Cache-Control: no-store` explícito** em respostas JSON autenticadas | Mitigado por padrão pelo comportamento de caches HTTP com header `Authorization` presente (RFC 7234). |

### PLANEJADO PARA V1.1
Todos os itens da tabela "ACEITO PARA V1" acima são também os candidatos de V1.1 (ver seção 30 para o roadmap formal).

### O que já foi auditado e confirmado seguro (com evidência, não suposição)
- **SQL injection:** 100% das queries do projeto usam parâmetros (`$1, $2...`) — nenhuma concatenação de string em SQL foi encontrada em nenhum controller. Testado com payloads clássicos (`' OR '1'='1`, `'; DROP TABLE usuarios; --`) no login e na busca de cliente — nenhum autenticou, nenhum afetou dados, nenhum quebrou o servidor.
- **XSS:** ver "MITIGADO" acima — testado ao vivo, payload não executa.
- **IDOR:** testado explicitamente — cliente não consegue favoritar/desfavoritar em nome de outro (`usuario_id` do corpo é ignorado), não consegue editar outro usuário (`PUT /usuarios/:id` é admin-only), não consegue ver saldo/histórico/resgates de terceiros (sempre filtrado por `req.usuario.id`).
- **Autorização vertical:** cliente tentando `GET /usuarios`, `GET /recompensas/admin`, `POST /pontos/entrada`, `POST /resgates/validar`, `PATCH .../destacar` → 403 em todos. Funcionário tentando `GET /usuarios`, criar recompensa, `POST /pontos/saida` → 403 em todos.
- **JWT:** rejeitado corretamente quando assinado com chave errada, quando usa `alg: "none"`, quando expirado, e quando falta o prefixo `Bearer`.
- **bcrypt:** 10 rounds, nunca texto puro, nunca devolvido pela API.
- **Rate limiting:** confirmado ativo tanto no limite global quanto no de login (10/15min em produção).
- **CORS:** testado com uma origem arbitrária em produção — a resposta não inclui `Access-Control-Allow-Origin`, o que faz o navegador bloquear a requisição cruzada.
- **CSP:** presente e restritiva — `default-src 'self'`, `object-src 'none'`, `script-src` limitado a `'self'` + os dois CDNs nomeados (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`), sem `unsafe-inline` para scripts (`style-src` tem `unsafe-inline`, aceito, já que é um risco muito menor).
- **HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Cross-Origin-Opener/Resource-Policy:** todos presentes, confirmados **idênticos** entre local e produção.
- **Helmet:** aplicado globalmente em `server.js`, primeira coisa depois da criação do app.
- **HTTPS:** confirmado forçado em produção — requisição HTTP simples recebe 301 para HTTPS.
- **Secrets:** `.env` nunca foi commitado (histórico completo do Git verificado), nenhum padrão de segredo hardcoded encontrado em nenhum arquivo rastreado.
- **Upload:** SVG rejeitado, base64 malformado rejeitado, tipos de campo incorretos rejeitados, limites de tamanho em camadas (5MB de string / 6MB de body) corretos, magic bytes e dimensão validados de verdade (correção já implementada).
- **Concorrência / double-spend:** duas requisições simultâneas de resgate com saldo suficiente só para uma → exatamente uma tem sucesso (lock `FOR UPDATE`); duas validações simultâneas do mesmo código → exatamente uma tem sucesso, a outra recebe 409; dois favoritos simultâneos da mesma recompensa pelo mesmo cliente → nunca duplica (protegido pela `UNIQUE` do banco, não só pela aplicação).
- **Replay:** um código de resgate já utilizado/cancelado não pode ser validado de novo.
- **Headers de erro:** nenhuma resposta de erro (incluindo JSON malformado, 404, 500) inclui stack trace ou caminho de arquivo interno — confirmado idêntico em local e produção.

---

## 18. TESTES

**Não há suíte de teste automatizado permanente no repositório.** `package.json:"test"` é o placeholder padrão (`"echo \"Error: no test specified\" && exit 1"`) — não existe pasta `test/`, `__tests__/`, nem dependência de framework de teste (Jest, Mocha, etc.) instalada. Toda a validação descrita abaixo foi feita por **scripts avulsos, escritos sob demanda, executados uma vez contra o backend e o Postgres reais (local), e descartados depois** (nunca commitados) — é assim que este projeto vem sendo testado até aqui.

### O que já foi testado, com números reais (não estimados)

| Rodada | O que cobriu | Resultado |
|---|---|---|
| Auditoria de segurança nº 1 (ampla) | Autenticação, autorização/IDOR, SQL injection, XSS, upload malicioso, concorrência (double-spend, dupla validação, duplo favorito), headers HTTP, CORS, dependências (`npm audit`), segredos | 38+ testes de ataque ao vivo — 0 crítico, 0 alto, 4 médio, 8 baixo encontrados |
| Correção de timing attack | Login com email inexistente vs. existente+senha errada, 20 amostras cada, intercaladas | Diferença caiu de ~70ms para ~1–4ms |
| Correção de validação de imagem | PNG/JPEG/WEBP válidos, MIME incorreto, magic bytes incorretos (texto/HTML disfarçado), SVG, base64 corrompido, acima do limite de bytes, acima de 4000×4000, criar/editar/remover imagem, fluxo real do editor de recorte via Playwright | 27 testes de unidade+integração + 22 testes Playwright (criação/edição via UI real, 390px e 1440px) — **49/49 passaram** |
| Auditoria de fechamento da V1 | Reconfirmação de login+timing, upload, regressão completa (recompensas/favoritos/destaque/empresas/perfil/resgates/expiração 5h/admin/funcionário/cliente), segurança (autorização/IDOR/SQLi/XSS/JWT), `node --check` em 65 arquivos, `npm audit`, responsividade em 390/768/1440px | **100/100** testes funcionais/segurança/responsividade passaram; `node --check`: 65/65 arquivos OK; `npm audit`: 0 vulnerabilidades |

### Tipos de teste realizados
- **Testes de API** — requisições HTTP reais (`fetch`) contra `http://localhost:3000`, com contas de teste criadas e removidas a cada rodada.
- **Testes de integração** — fluxo completo através de múltiplas camadas (rota → middleware → controller → banco), nunca só a função isolada.
- **Testes de concorrência** — `Promise.all` disparando duas requisições simultâneas contra o mesmo recurso (resgate, validação, favorito), verificando que só uma teve efeito.
- **Testes de segurança** — matriz de ataque (autorização, IDOR, SQL injection, XSS, JWT inválido/forjado/expirado, brute force conceitual via análise de entropia).
- **Playwright** — navegador real (Chromium), cobrindo fluxos de UI completos (login, upload com editor de recorte, favoritar/desfavoritar, navegação) e captura de erros de console/página.
- **Responsividade** — testado explicitamente em **390×844, 430×932, 768×1024 e 1440×900**, verificando ausência de overflow horizontal em todas as telas principais de cliente e admin.
- **Smoke tests contra produção** — sempre **somente leitura** (headers HTTP, comparação de schema, comportamento de erro) — nunca escrita de dados de teste em produção.
- **Testes unitários "de fato"** — só no sentido de chamar uma função pura isoladamente (ex.: `validarImagem()` chamado diretamente, sem servidor HTTP no meio) durante o desenvolvimento da validação de imagem.

### O que não existe (para não inventar)
- Não há CI/CD configurado (não confirmado nenhum arquivo `.github/workflows/`, `render.yaml` com testes, ou pipeline equivalente).
- Não há cobertura de código medida (nenhuma ferramenta tipo `nyc`/`c8` instalada).
- Não há teste de carga/performance formal.

---

## 19. HISTÓRICO DE DESENVOLVIMENTO

Reconstruído a partir de `git log` (8 commits no branch `main`, todos por Marcos Vinicius Mulinari Campos) mais o conteúdo real de cada um (`git show --stat`).

### Linha do tempo

| Data | Commit | O que foi implementado |
|---|---|---|
| 2026-09-04 | `dc451b7` — "chore: commit inicial do projeto" | Estrutura inicial do repositório |
| 2026-09-04 | `761e488` — "feat: estrutura inicial da API e hardening de seguranca" | Primeira versão da API Express com Helmet/CORS/rate limit já presentes desde o início |
| 2026-09-04 | `a320db3` — "refactor: separar autenticação em controller e rota" | `auth.controller.js`/`auth.routes.js` separados da estrutura genérica |
| 2026-09-06 | `4717802` — "feat: primeira versão do sistema de pontos" | Núcleo do programa de pontos: usuários, empresas, recompensas, resgates, movimentações — a V1 funcional de fato |
| 2026-09-06 | `5319f1f` — "Atualiza sistema e adiciona leitura de QR no funcionario" | Papel `funcionario`, leitura de QR Code pela câmera (`jsQR`) |
| 2026-09-07 | `1e7f52f` — "Adiciona perfil do cliente com QR Code e resumo da conta" | `perfil.html`/`perfil.js`, endpoint `GET /usuarios/me` |
| 2026-09-08 | `5cfb015` — "Adiciona ajuste e recorte de fotos nas recompensas" | Campo `imagem` em recompensas, editor de recorte no `<canvas>` (`admin-recompensas.js`) |
| 2026-09-08 | `ec7a2ca` — "Adiciona favoritos, destaques e melhorias no sistema" (**HEAD atual, = `origin/main`**) | Destaque global (`recompensas.destacada`), favoritos individuais (tabela `recompensas_favoritas`), "Ver mais" de empresa, badge de tipo de usuário, logo da marca |

### Trabalho posterior ao último commit (não commitado)
Depois de `ec7a2ca`, dois hardenings de segurança foram implementados e testados, mas **permanecem apenas no diretório de trabalho** (`git status` no momento deste documento mostra ambos como modificados, não commitados):
1. Correção do timing attack de login (`src/controllers/auth.controller.js`).
2. Validação de magic bytes/dimensão de imagem (`src/utils/validarImagem.js`).

Também houve, entre commits, um **incidente de produção** (schema de produção desatualizado em relação ao código depois do deploy de `ec7a2ca`), corrigido rodando as migrations diretamente contra o Postgres de produção — sem gerar um novo commit de código (foi uma correção de dado/schema, não de código). Ver seção 21.

### Bugs corrigidos ao longo do desenvolvimento (confirmados por comentário no próprio código, não por suposição)
- Elemento HTML `#modal-pontos-nota` faltando em `admin-clientes.html`, causando `TypeError` ao abrir o modal de "remover pontos" — corrigido adicionando a tag faltante (comentário explícito em `admin-clientes.html`).
- Modelo antigo de resgate com aprovação manual do admin (endpoints `PUT /resgates/:id/aprovar`/`/recusar`) foi **removido** e substituído pelo modelo atual de desconto imediato + validação por código — mencionado nos comentários de `redemption.routes.js` e `admin-resgates.js` como uma mudança de fluxo já concluída, não uma mudança pendente.

---

## 20. MIGRATIONS

**9 scripts em `scripts/`**, todos rodados manualmente via `node scripts/<arquivo>.js`, nenhum executado automaticamente no boot do servidor. Todos usam `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ou `CREATE TABLE IF NOT EXISTS` — **são idempotentes**: rodar de novo por engano não altera nada nem gera erro.

| # | Arquivo | O que muda | Tabelas afetadas | Idempotente? | Execução manual? | Status local | Status produção |
|---|---|---|---|---|---|---|---|
| 1 | `migrate-empresas.js` | Cria a tabela `empresas`; adiciona `empresa_id` (nullable) em `recompensas`, `movimentacoes_pontos`, `resgates`; tenta inferir a empresa de recompensas já existentes pelo nome | `empresas`, `recompensas`, `movimentacoes_pontos`, `resgates` | Sim | Sim | ✅ Aplicada | ✅ Aplicada (não confirmado a data exata) |
| 2 | `migrate-movimentacoes-origem.js` | Adiciona `origem` (`VARCHAR(20)`, `NOT NULL DEFAULT 'outro'`, `CHECK` com 5 valores) | `movimentacoes_pontos` | Sim | Sim | ✅ Aplicada | ✅ Aplicada |
| 3 | `migrate-recompensas-imagem.js` | Adiciona `imagem` (`TEXT`, opcional) | `recompensas` | Sim | Sim | ✅ Aplicada | ✅ Aplicada |
| 4 | `migrate-resgates-fluxo-imediato.js` | Adiciona `codigo` (`UNIQUE`, `NOT NULL`); remapeia status antigos (`aprovado`→`pendente_validacao`, `pendente`/`recusado`→`cancelado`); novo `CHECK` restringindo a `pendente_validacao`/`utilizado`/`cancelado` | `resgates` | Sim (usa `IF NOT EXISTS` na coluna; o `DROP CONSTRAINT`/remapeamento de status não é re-executável sem erro se já aplicado uma vez — **atenção**, ver nota abaixo) | Sim | ✅ Aplicada | ✅ Aplicada |
| 5 | `migrate-usuarios-qr-token.js` | Adiciona `qr_token` (`VARCHAR(64)`, `UNIQUE`, `NOT NULL`), gera token real para usuários já existentes | `usuarios` | Sim | Sim | ✅ Aplicada | ✅ Aplicada |
| 6 | `migrate-recompensas-destaque.js` | Adiciona `destacada` (`BOOLEAN`, `NOT NULL DEFAULT false`) | `recompensas` | Sim | Sim | ✅ Aplicada | ✅ Aplicada (corrigida durante o incidente — ver abaixo) |
| 7 | `migrate-recompensas-favoritas.js` | Cria a tabela `recompensas_favoritas` (com as duas FKs `ON DELETE CASCADE` e a `UNIQUE` composta) | `recompensas_favoritas` (nova) | Sim | Sim | ✅ Aplicada | ✅ Aplicada (corrigida durante o incidente — ver abaixo) |
| — | `create-admin.js` | Não é uma migration de schema — cria a **primeira conta administrador** | `usuarios` (INSERT) | Não se aplica (é uma inserção de dado, não de schema) | Sim | Usado no setup inicial | Usado no setup inicial |
| — | `create-funcionario.js` | Mesma ideia, para a primeira conta funcionário | `usuarios` (INSERT) | Não se aplica | Sim | Usado conforme necessário | Usado conforme necessário |

> **Nota sobre a migration #4:** o passo `ALTER TABLE resgates DROP CONSTRAINT resgates_status_check` falharia se rodado uma segunda vez depois que a constraint já foi removida (a constraint com o nome antigo não existe mais). Isso é aceitável porque migrations, por convenção deste projeto, são rodadas **uma vez por ambiente** e nunca mais — mas é diferente do padrão `IF NOT EXISTS` das outras. Quem for reaplicar este script específico num banco que já passou por ele deve inspecionar o schema antes (seção 8) em vez de simplesmente rodar de novo.

### ⚠️ ALERTA — já houve diferença real entre schema local e produção
Isso não é uma possibilidade teórica: **já aconteceu**. Depois do commit `ec7a2ca` (que adicionou o código que lê/escreve as colunas/tabela de destaque e favoritos) ser implantado no Render, as migrations #6 e #7 **não tinham sido rodadas em produção** — o código novo tentava consultar `recompensas.destacada` e `recompensas_favoritas`, que não existiam ainda no Postgres de produção, e todo `GET /recompensas`/`GET /recompensas/admin` passou a responder 500. Foi corrigido rodando as duas migrations manualmente contra o banco de produção (ver seção 21 para o procedimento exato usado). **Isso pode acontecer de novo se um deploy de código não vier acompanhado da migration correspondente rodada em produção.**

### Procedimento seguro de migration (o que fazer a partir de agora)
1. **Nunca** faça deploy de um código que lê/escreve uma coluna/tabela nova sem já ter rodado a migration correspondente em produção **antes ou imediatamente depois** do deploy — o ideal é rodar a migration como parte do próprio processo de deploy, não como uma etapa manual esquecível.
2. Antes de rodar contra produção: **inspecionar o schema atual** (consulta somente-leitura em `information_schema.columns`/`pg_constraint`, como feito nesta documentação — seção 8) para confirmar que a coluna/tabela realmente falta.
3. Rodar exatamente o script já existente em `scripts/` — nunca escrever uma variação "rápida" da migration só para produção.
4. Depois de rodar, **reconfirmar o schema** com a mesma consulta somente-leitura.
5. Testar os endpoints afetados diretamente (a query real do endpoint, ou a própria rota via HTTP) antes de considerar resolvido.
6. Nunca fazer isso sem entender exatamente quais dados serão tocados — todas as migrations deste projeto até hoje são aditivas (`ADD COLUMN`/`CREATE TABLE`), nenhuma jamais apagou uma coluna ou tabela existente.

---

## 21. DEPLOY NO RENDER

**Não confirmado neste documento:** o arquivo de configuração exato do serviço Render (não há `render.yaml` no repositório) — a configuração de build/start/variáveis foi feita diretamente no painel do Render, fora do controle de versão. O que segue é o que pôde ser confirmado externamente (comportamento observado da URL pública) mais o fluxo padrão do Render para este tipo de projeto.

### Passo a passo (GitHub → Render)
1. **GitHub:** o código é enviado para `https://github.com/MarcosViniciusUC/sistema-pontos.git`, branch `main` (`origin/main` confirmado igual a `HEAD` no momento deste documento).
2. **Render:** configurado (via painel, não confirmado por arquivo) para observar o branch `main` e fazer deploy automático a cada push — comportamento inferido pelo fato de o commit `ec7a2ca` estar tanto local quanto em `origin/main`, e o incidente de schema ter ocorrido logo depois desse push.
3. **Build:** `npm install` (padrão do Render para projetos Node, **não confirmado** um comando de build customizado — não há passo de compilação/bundling necessário, já que o frontend não usa build step).
4. **Start:** `npm start` → `node server.js` (`package.json:"scripts".start`).
5. **Variáveis de ambiente:** configuradas no painel do Render (nunca no repositório) — mesma lista da seção 7 (`DB_*`, `JWT_SECRET`, `CORS_ORIGIN`; `NODE_ENV` **não** deve ser definido como `development` em produção — deixar ausente ou `production`).
6. **PostgreSQL:** um banco Postgres gerenciado do próprio Render, separado do banco local — **credenciais completamente diferentes**, nunca compartilhadas com o `.env` local.
7. **HTTPS:** fornecido automaticamente pelo Render (com Cloudflare na frente) — confirmado por teste (requisição HTTP simples recebe 301 para HTTPS no mesmo domínio).
8. **Domínio:** URL padrão do Render em uso durante o desenvolvimento: `https://sistema-pontos-0i0k.onrender.com` (**não confirmado** um domínio customizado).

### Migrations em produção
**Nunca automáticas.** Depois de um deploy que inclui uma migration nova, é preciso rodar o script manualmente contra o banco de produção — ver o procedimento da seção 20. Isso exige ter a `DATABASE_URL`/credenciais de produção disponíveis num ambiente seguro (nunca coladas em texto puro num chat ou commitadas) e, como `src/config/database.js` não lida com uma URL única, é preciso ou (a) definir as variáveis `DB_*` discretas apontando para produção temporariamente no ambiente de execução do script, com `PGSSLMODE=no-verify` (o driver `pg` respeita essa variável de ambiente para habilitar SSL sem precisar alterar o código), ou (b) usar um script avulso com `new Client({ connectionString, ssl: { rejectUnauthorized: false } })` apontado para a URL de produção. **De qualquer forma, sempre come confirmação explícita antes, e sempre com uma consulta somente-leitura primeiro.**

### Verificação pós-deploy / smoke test (o que já foi usado na prática)
1. `curl` na raiz do domínio de produção → esperar `200`.
2. `curl` numa rota que não existe → esperar `404` com `{"mensagem":"Rota não encontrada"}` (não um HTML de erro do Render).
3. Testar `POST /login` sem credenciais válidas → esperar `401`, nunca `500`.
4. Se o deploy incluiu mudança de schema: **antes de qualquer outra coisa**, inspecionar o schema de produção (seção 8/20) e comparar com o schema esperado pelo código recém-implantado.
5. Testar manualmente, logado como um usuário real, as telas que dependem do código novo.

### O incidente já ocorrido (documentado em detalhe, porque já aconteceu de verdade)
- **Sintoma:** depois de um deploy, `GET /recompensas` e `GET /recompensas/admin` passaram a responder **500 "Erro ao listar recompensas"** em produção, quebrando a tela de recompensas do cliente e do admin.
- **Causa raiz confirmada:** o código já implantado (`reward.controller.js`) consultava as colunas/tabela `recompensas.destacada` e `recompensas_favoritas`, mas as migrations #6 e #7 (seção 20) nunca tinham sido rodadas contra o Postgres de produção — só contra o local.
- **Diagnóstico:** reproduzido via `curl` sem token (confirmando servidor/rotas de pé, sem erro 502/503) e depois inspeção **somente leitura** do schema real de produção via conexão direta, confirmando ausência da coluna e da tabela.
- **Correção:** as migrations #6 e #7 foram executadas diretamente contra o Postgres de produção (mesmos scripts do repositório, sem nenhuma variação de código), e o schema foi reconfirmado depois — coluna e tabela presentes, dados reais (recompensas, usuários, resgates) intactos, contagens antes/depois idênticas.
- **Lição permanente:** ver o "ALERTA" e o "Procedimento seguro de migration" na seção 20 — este incidente é a razão concreta por trás dessa regra.

---

## 22. BACKUPS

- **Existe um backup local:** `backup-sistema-pontos.sql`, na raiz do projeto — um dump manual do banco (arquivo `.sql`, não versionado pelo Git — aparece como `??` em `git status`, ou seja, está no diretório de trabalho mas fora do controle de versão, o que é apropriado para não vazar dado real num repositório).
- **Como gerar um backup novo** (Postgres local, usando `pg_dump`, ferramenta padrão que acompanha a instalação do PostgreSQL):
  ```bash
  pg_dump -U postgres -d sistema_pontos -F p -f backup-sistema-pontos.sql
  ```
- **Como restaurar:**
  ```bash
  psql -U postgres -d sistema_pontos -f backup-sistema-pontos.sql
  ```
  (ou criar um banco novo antes, se for restaurar do zero: `createdb -U postgres sistema_pontos_restaurado` e apontar o `-d` para ele).
- **Cuidados:** nunca commitar um dump que contenha dados reais de usuário (senha hash, email, etc.) num repositório público — o arquivo atual já está fora do controle de versão por essa razão; se o `.gitignore` for revisado no futuro, confirmar que `*.sql` (ou pelo menos este arquivo por nome) continua excluído.
- **Quando fazer backup:** antes de qualquer migration destrutiva (nenhuma existe hoje, mas se uma vier a existir), antes de qualquer operação manual de `UPDATE`/`DELETE` em massa contra produção, e periodicamente como prática geral (**não confirmado** nenhuma rotina automática de backup agendada — o Render Postgres gerenciado normalmente oferece backups automáticos próprios, mas isso é uma configuração do painel do Render, não deste repositório, e não foi confirmada aqui).

---

## 23. LIMITAÇÕES ARQUITETURAIS ATUAIS

Estas são limitações **reais e conscientes**, não bugs — a distinção importa para quem for mexer no projeto sem reintroduzir o mesmo problema por engano.

- **Imagens em base64 dentro do PostgreSQL.** Funciona bem no volume atual (dezenas de recompensas), mas não escala indefinidamente: cada `GET /recompensas` transporta todas as imagens inteiras a cada chamada, e o banco cresce proporcionalmente ao número de fotos. Ver seção 15 para a razão da escolha (filesystem efêmero do Render) e seção 30 para a sugestão de storage dedicado como possível V2.
- **JWT em `localStorage`, não em cookie `httpOnly`.** Aceito para V1 (seção 17) — o compromisso é: mais simples de implementar (sem CSRF token, sem configuração extra de cookie cross-site), mas qualquer XSS futuro teria acesso total ao token. Hoje não há XSS conhecido, mas a arquitetura em si não tem essa camada de defesa extra.
- **Rate limit de login alto em desenvolvimento (`NODE_ENV=development` → 1000/15min).** Existe só para não travar testes manuais locais — nunca deve vazar para produção (a allow-list explícita em `auth.routes.js` já protege contra isso por padrão, mas depende de `NODE_ENV` nunca ser setado como `"development"` no ambiente do Render).
- **Nenhuma migration roda automaticamente no deploy.** Toda mudança de schema exige um passo manual separado — já causou um incidente real de produção (seção 21). É uma limitação de processo, não de código.
- **Escalabilidade do banco:** sem índices dedicados em `movimentacoes_pontos.usuario_id`, `resgates.status`/`usuario_id`, `recompensas.empresa_id` — cada consulta de saldo/histórico hoje faz uma busca sobre a tabela inteira. Sem impacto perceptível na escala atual (dezenas de linhas); precisa ser revisitado antes de um crescimento real de volume de dados.
- **Ausência de storage de objeto dedicado** (S3, Cloudinary, etc.) para as imagens — decisão deliberada (seção 15/24), mas é uma limitação real se o catálogo crescer muito.
- **Sem paginação em nenhum endpoint de listagem** (`GET /usuarios`, `GET /recompensas`, `GET /resgates`, etc. sempre devolvem a lista inteira). Funciona bem no volume atual; seria necessário revisitar com uma base de dados maior.
- **Sem cache de qualquer tipo** (nem de aplicação, nem `Cache-Control` explícito nas respostas da API) — cada requisição sempre bate no banco.
- **Um único processo Node servindo tudo** (API + arquivos estáticos) — não há separação entre frontend e backend em serviços diferentes; simples de operar hoje, mas significa que reiniciar o backend também interrompe o carregamento das páginas HTML/CSS/JS por alguns instantes.
- **Sem testes automatizados permanentes** (seção 18) — toda regressão precisa ser verificada manualmente/por script avulso a cada mudança relevante.

---

## 24. DECISÕES TÉCNICAS

| Decisão | Motivo confirmado no projeto |
|---|---|
| **Express** (não Fastify/Koa/NestJS) | Framework mais simples e direto para uma API deste porte, sem necessidade das abstrações extras de um framework maior |
| **PostgreSQL** (não MongoDB/MySQL) | Dados fortemente relacionais (usuário↔empresa↔recompensa↔resgate↔movimentação) e necessidade real de transações com `FOR UPDATE` para consistência de saldo — casos de uso onde um banco relacional com transação forte é a escolha natural |
| **JWT** (não sessão em servidor) | Simplicidade de operar sem armazenamento de sessão no backend — cada requisição se autentica sozinha, sem consulta a uma tabela de sessões |
| **bcrypt com 10 rounds** | Valor padrão amplamente recomendado — equilíbrio entre custo computacional de verificação e resistência a força bruta offline em caso de vazamento do hash |
| **Imagem em base64 no Postgres** (não arquivo em disco, não S3) | O Render tem filesystem efêmero — qualquer arquivo local se perde a cada redeploy/restart; o Postgres gerenciado é persistente. Zero custo/dependência adicional (ver seção 15) |
| **Crop de imagem no navegador (`<canvas>`), não no servidor** | O admin já teria que enviar a imagem de algum jeito; processar no cliente evita subir o arquivo original inteiro (potencialmente grande) e mantém o backend livre de qualquer biblioteca de processamento de imagem |
| **Saída fixa de 1000×750 no crop** | Mesma proporção (4:3) usada em todos os cards de recompensa no frontend — garante que toda foto nova já nasce no formato exato que a interface espera, sem distorção nem re-processamento |
| **Limite de dimensão de imagem em 4000×4000** | 4× de margem sobre o único tamanho que o fluxo real produz (1000×750), suficiente para acomodar uso fora do editor sem abrir espaço para "decompression bomb" (ver seção 15) |
| **Destaque global separado de favorito individual** (tabelas/colunas diferentes, de propósito) | São conceitos de negócio genuinamente diferentes — um é uma decisão editorial da equipe (visível a todos), o outro é uma preferência pessoal (visível só a quem escolheu). Misturar os dois numa coluna booleana só (`recompensas.favorita`) tornaria a informação global por engano — decisão explicitamente evitada durante o desenvolvimento |
| **Expiração de resgate em exatamente 5 horas** | Prazo de negócio definido para dar tempo real ao cliente de ir até o estabelecimento sem deixar pontos "presos" indefinidamente num resgate esquecido |
| **`roleMiddleware` como fábrica de função** (`roleMiddleware("admin","funcionario")`) em vez de checagem manual em cada controller | Reaproveitamento simples e centralizado da regra "quem pode chamar esta rota", sempre lido só de `req.usuario.tipo` |
| **Transações + `SELECT ... FOR UPDATE`** em toda operação que mexe em saldo (entrada, saída, resgate, validação, expiração) | É o mecanismo padrão do Postgres para serializar operações concorrentes sobre a mesma linha — usado consistentemente em todo o projeto, nunca substituído por lock em memória (que não funcionaria entre múltiplas requisições/processos) |
| **Migrations como scripts Node avulsos** (não uma ferramenta como Knex/Prisma Migrate) | Simplicidade — cada migration é só um script que roda `ALTER TABLE`/`CREATE TABLE` idempotente, sem a sobrecarga de configurar uma ferramenta de migration dedicada para um projeto deste porte |
| **Sem framework de frontend** | Escopo do projeto não justificou a complexidade adicional; HTML/CSS/JS puro é suficiente para o número de telas existente |

---

## 25. PADRÕES DE CÓDIGO

Para quem for escrever código novo neste projeto, os padrões abaixo já são seguidos de forma consistente em **todo** o código existente — seguir o mesmo padrão facilita revisão e evita inconsistência.

### Backend

- **Controllers** — sempre `async function nomeDaAcao(req, res) { try { ... } catch (erro) { console.log(erro); res.status(500).json({mensagem: "..."}) } }`. Nunca deixam uma exceção não tratada escapar. Mensagens de erro para o cliente são sempre strings fixas e genéricas — o erro real só vai para o log do servidor.
- **Routes** — só compõem `router.<metodo>(caminho, authMiddleware, roleMiddleware(...), validate*, controller.funcao)`. Nunca contêm lógica de negócio.
- **Middlewares de validação** (`validate*.js`) — uma função por formato de body, sempre `function validarX(req, res, next) { ... if (invalido) return res.status(400).json(...); next(); }`. Nunca validam a *existência* de um recurso relacionado (isso é feito no controller, contra o banco) — só o *formato* do campo.
- **Transações** — sempre o padrão `const client = await pool.connect(); try { await client.query("BEGIN"); ...; await client.query("COMMIT"); } catch { await client.query("ROLLBACK"); } finally { client.release(); }`. Nunca usar `pool.query` diretamente quando mais de uma escrita precisa ser atômica.
- **Colisão de valor único gerado aleatoriamente** (código de resgate, `qr_token`) — padrão de `SAVEPOINT` + retry dentro da mesma transação, nunca abortar a transação inteira por uma colisão estatisticamente rara.
- **Utils (`src/utils/`)** — sempre funções puras, sem `req`/`res`, sem acesso a `pool` (exceto `empresas.js:empresaAtivaExiste`, que recebe o `db`/`client` como parâmetro explícito, nunca importa um pool próprio — assim funciona tanto fora quanto dentro de uma transação existente).
- **Nomenclatura** — tudo em português (nomes de função, variável, coluna, mensagem de erro), com raras exceções de termos técnicos em inglês (`req`, `res`, `Client`, `Pool`). Comentários explicam sempre o *porquê*, nunca o *o quê* (o código já diz o que faz).

### Frontend

- **Um arquivo JS por tela**, sempre uma IIFE `(function () { ... })()` — nenhuma variável global além de `window.Auth`, `window.api`, `window.ApiError`, `window.UI`.
- **`window.api(caminho, opcoes)`** (`api.js`) é o **único** ponto que faz `fetch` em todo o frontend — nenhum outro arquivo chama `fetch` diretamente contra a própria API (algumas telas fazem `fetch` direto só para coisas que não são a API, como `getUserMedia`, que não é HTTP).
- **DOM sempre via `textContent` para dado dinâmico**, nunca `innerHTML` com valor vindo da API — `innerHTML` só é usado para limpar (`= ""`) ou para strings 100% estáticas (ex.: cabeçalho de tabela).
- **CSS tokens** (`tokens.css`) — variáveis nomeadas por papel semântico (`--color-red`, `--space-4`, `--text-lg`), reaproveitadas em `components.css`/`dashboard.css`/`admin.css`; nunca um valor de cor/espaçamento "mágico" direto numa regra.
- **Duplicação deliberada entre telas parecidas** (ex.: `dashboard.js` e `recompensas.js` têm funções de card de recompensa quase idênticas; `funcionario.js` espelha estrutura de `admin-validar.js`/`admin-identificar-cliente.js`) — decisão consciente já documentada em comentários no próprio código: cada tela mantém sua própria cópia pequena em vez de forçar um módulo compartilhado prematuro. **Seguir o mesmo princípio ao adicionar uma tela nova parecida com uma existente.**
- **Estados de UI** — sempre os três (carregando/vazio/erro) tratados explicitamente, nunca uma tela que simplesmente "não faz nada" enquanto espera ou quando não há dado.
- **Guardas de página** (`ui.js`) — toda tela protegida chama `window.UI.protegerPagina()` (ou a variante `Admin`/`Funcionario`) logo no topo do arquivo, **antes** de qualquer outra lógica.

### Banco
- Toda tabela nova segue o padrão: `id SERIAL PRIMARY KEY`, `criado_em TIMESTAMP NOT NULL DEFAULT now()` (exceto `usuarios`, que usa `CURRENT_TIMESTAMP` — inconsistência histórica, não repetir em tabelas novas), FKs sempre nomeadas pelo padrão automático do Postgres (`tabela_coluna_fkey`), `CHECK` para restringir valores de enum-like (`status`, `tipo`, `origem`) em vez de criar um tipo `ENUM` do Postgres (mais simples de alterar depois, sem `ALTER TYPE`).

---

## 26. COMO ALTERAR O PROJETO SEM QUEBRAR NADA

### Fluxo recomendado

```
ANTES DE ALTERAR
   │
   ▼
1. Localizar o fluxo (seção 14) que envolve a mudança
   │
   ▼
2. Localizar o(s) endpoint(s) envolvido(s) (seção 12) — ler o controller
   e o(s) middleware(s) de validação inteiros antes de tocar em qualquer
   linha
   │
   ▼
3. Localizar a(s) tabela(s) envolvida(s) (seção 8) — conferir
   constraints/FKs que já existem antes de assumir que um valor é livre
   │
   ▼
4. Verificar dependências — quem mais chama esse controller/usa essa
   coluna? (grep pelo nome da função/coluna em todo o projeto, backend
   e frontend)
   │
   ▼
5. Testar o comportamento ATUAL antes de mudar nada (rodar o fluxo
   manualmente, ou com um script avulso — seção 18) — assim dá para
   comparar depois
   │
   ▼
6. Alterar — mudança pequena e isolada, sem "aproveitar" para mexer em
   outra coisa não relacionada
   │
   ▼
7. Testar de novo — o mesmo fluxo, mais os fluxos vizinhos que dependem
   da mesma tabela/endpoint (regressão)
   │
   ▼
8. Migration, se a mudança envolveu schema (seção 20) — rodar local
   primeiro, sempre
   │
   ▼
9. Deploy (seção 21) — só depois de tudo acima
   │
   ▼
10. Smoke test em produção (seção 21) — confirmar que o schema de
    produção também recebeu a migration, antes de considerar concluído
```

### Arquivos sensíveis e áreas de maior risco

| Arquivo/área | Por que é sensível |
|---|---|
| `src/controllers/redemption.controller.js` | Mexe em saldo real de pontos — qualquer erro de transação pode gerar desconto duplicado ou saldo inconsistente |
| `src/services/resgateExpiracao.service.js` | Roda sozinho em background — um bug aqui pode devolver pontos errados silenciosamente, sem ninguém percebendo na hora |
| `src/controllers/points.controller.js` | Mesma categoria — qualquer alteração precisa preservar o padrão `FOR UPDATE` + recálculo de saldo a partir de `movimentacoes_pontos` |
| `src/middlewares/authMiddleware.js` / `roleMiddleware.js` | Qualquer bug aqui é uma falha de segurança em potencial, não só um bug funcional |
| `src/utils/validarImagem.js` | Parsing binário manual — um erro sutil no offset de leitura pode aceitar uma imagem inválida ou rejeitar uma válida silenciosamente |
| `scripts/migrate-*.js` | Alteram schema de um banco com dados reais — nunca editar um script de migration já aplicado; sempre criar um novo |
| `server.js` | A **ordem** dos middlewares (`helmet → cors → json → static → rateLimit → rotas`) é significativa — mover algo de lugar pode desabilitar uma proteção sem gerar nenhum erro visível |
| `frontend/assets/js/auth.js` / `api.js` | Usados por todas as outras 17 telas — um bug aqui quebra a aplicação inteira, não só uma tela |

---

## 27. CHECKLIST DE NOVA FEATURE

Reutilizável para qualquer funcionalidade futura — inspirado diretamente no processo já seguido nas últimas features implementadas (destaque/favoritos, expiração de 5h, validação de imagem).

```
[ ] Regra de negócio escrita em CONDIÇÃO → AÇÃO → RESULTADO (como a seção 9)
[ ] Tabela(s)/coluna(s) necessárias identificadas — conferir se algo já
    existente pode ser reaproveitado antes de criar algo novo
[ ] Migration nova escrita (idempotente, IF NOT EXISTS) — nunca editar uma
    migration já aplicada
[ ] Migration rodada e testada LOCALMENTE primeiro
[ ] Endpoint(s) definido(s) — método, caminho, papéis permitidos
[ ] Middleware de validação de entrada escrito (validate*.js)
[ ] Controller escrito, seguindo o padrão try/catch + transação quando
    houver mais de uma escrita
[ ] Frontend: tela(s) atualizada(s), reaproveitando componentes/CSS
    existentes sempre que possível
[ ] Validação de segurança: quem pode chamar isso? IDOR é possível?
    O usuario_id vem sempre do token, nunca do corpo?
[ ] Responsividade testada em pelo menos 390px e 1440px
[ ] Testes manuais/script avulso cobrindo o caminho feliz E os principais
    caminhos de erro
[ ] Regressão: os fluxos vizinhos (mesma tabela/endpoint) continuam
    funcionando exatamente como antes?
[ ] Testado contra produção (SOMENTE LEITURA, nunca escrita de teste)
    depois do deploy, se aplicável
[ ] Este documento (docs/PROJETO-MOVEMENT-BENEFICIOS.md) atualizado nas
    seções afetadas (schema, regras de negócio, API, fluxos, roadmap)
```

---

## 28. CHECKLIST DE DEPLOY

```
[ ] git status — confirmar exatamente o que vai ser commitado, nada a mais
[ ] Testes manuais/script avulso relevantes rodados e passando
[ ] node --check em todos os arquivos .js alterados (e idealmente no
    projeto inteiro — são só ~65 arquivos, rápido)
[ ] npm audit — nenhuma vulnerabilidade nova introduzida
[ ] Migration nova? → já rodada e confirmada LOCALMENTE
[ ] Backup do banco de produção feito (se a mudança envolve schema ou
    dado sensível)
[ ] Commit criado (mensagem clara do que mudou e por quê)
[ ] Push para origin/main
[ ] Deploy do Render disparado/confirmado
[ ] Migration nova rodada MANUALMENTE contra produção (nunca é automática
    — ver seção 20/21) — antes de assumir que o deploy "terminou"
[ ] Smoke tests contra produção: raiz responde 200, rota inexistente
    responde 404 JSON, login com credenciais inválidas responde 401
[ ] Logs do Render conferidos por erro inesperado logo após o deploy
[ ] Endpoint(s) novo(s)/alterado(s) testado(s) manualmente em produção,
    logado como usuário real
[ ] Frontend conferido visualmente em produção (não só via curl)
[ ] Schema do banco de produção reconfirmado (seção 8/20) se a mudança
    envolveu migration — este passo já evitou seria necessário para
    detectar o incidente da seção 21 mais cedo
```

---

## 29. PROBLEMAS CONHECIDOS

Só o que realmente existe, confirmado nesta data.

### CRÍTICO
Nenhum conhecido.

### ALTO
Nenhum conhecido.

### MÉDIO
Nenhum **em aberto** — os dois médios identificados na auditoria de segurança (timing attack no login, validação de imagem por magic bytes/dimensão) já foram corrigidos no código (ver seção 17), ainda que **não commitados** (ver nota de rodapé no topo do documento e seção 19).

### BAIXO
1. Política de senha fraca (mínimo 6 caracteres, sem exigência de complexidade) — `src/middlewares/validateUser.js`, `validateLogin.js`.
2. Identificadores de login fixos e previsíveis (`"admin"`, `"funcio"`) — `src/middlewares/validateLogin.js`.
3. Sem validação de tamanho máximo de string (nome/email/telefone/slug) — excede o limite da coluna e gera 500 em vez de 400 — `reward.controller.js`, `user.controller.js`, `empresa.controller.js`.
4. Sem teto de sanidade em `pontos_necessarios`/`quantidade` — valor acima do range de `INTEGER` do Postgres gera 500.
5. `points.controller.js:saida()` não confirma `tipo='cliente'` (diferente de `entrada()`).
6. Faltam índices em colunas de filtro frequente (`movimentacoes_pontos.usuario_id`, `resgates.status`/`usuario_id`, `recompensas.empresa_id`).
7. `CORS_ORIGIN` local aponta para uma origem de desenvolvimento não utilizada (`localhost:5173`).
8. Sem `Cache-Control: no-store` explícito em respostas JSON autenticadas.

### ADIADO (para V1.1, ver seção 30)
- JWT em `localStorage` em vez de cookie `httpOnly`.
- Todos os itens BAIXO acima.

### OBSERVAÇÃO DE HIGIENE DE DADOS (não é falha de segurança nem de código)
Durante a auditoria de fechamento, foram encontrados no banco **local**: 2 recompensas de teste remanescentes de uma rodada anterior de testes Playwright (nomes claramente identificáveis, ex. "PW Upload UI 390px"), e 1 resgate cancelado numa conta de teste compartilhada conhecida (`Maria Teste`) cuja origem exata (interação real ou resíduo de teste) não pôde ser confirmada com certeza. Nenhum dos dois foi removido nas rodadas de auditoria (etapas declaradas como somente leitura) — ficam registrados aqui para decisão/limpeza numa próxima etapa explícita.

### NENHUM CONHECIDO
Nenhuma outra categoria de problema (funcional, de dados, de infraestrutura) foi identificada além do que está listado acima.

---

## 30. ROADMAP

Baseado exclusivamente no que já foi implementado (V1), no que já foi identificado como aceito-mas-pendente (auditoria de segurança) e em limitações técnicas já documentadas (seção 23) — **nenhum item abaixo é uma promessa de produto**, e itens marcados **SUGESTÃO** são ideias derivadas de limitação técnica, não uma decisão já tomada.

### V1 (implementado, sujeito só aos dois hardenings não commitados)
Toda a lista de "IMPLEMENTADO" da seção 2. Considerado **pronto para congelar**, segundo a última auditoria de fechamento.

### V1.1 (identificado como pendente, ainda não iniciado)
- Corrigir os 8 itens BAIXO da seção 29 (política de senha, validação de tamanho máximo de string, teto de valores numéricos, consistência `saida()`/`entrada()`, índices de performance, limpeza de `CORS_ORIGIN`, `Cache-Control` explícito).
- Commitar e enviar ao Render as duas correções de segurança já implementadas (timing attack, validação de imagem) — tecnicamente já "prontas", só falta o passo de deploy.
- Rotacionar/confirmar senha forte nas contas fixas de demonstração (`"admin"`/`"funcio"`) em produção, se ainda existirem lá.
- Limpar os dados de teste residuais identificados na seção 29 (com identificação explícita de cada registro antes de remover, seguindo o mesmo padrão já usado em todas as limpezas de dado deste projeto).

### V2 / SUGESTÃO (derivado de limitação arquitetural, não uma decisão tomada)
- **SUGESTÃO:** migrar armazenamento de imagem de base64-no-Postgres para um storage de objeto dedicado (S3-compatível, Cloudinary, etc.), se o catálogo de recompensas crescer significativamente (seção 15/23).
- **SUGESTÃO:** migrar token de sessão de `localStorage` para cookie `httpOnly` + `Secure` + `SameSite`, como camada extra de defesa contra XSS futuro (seção 17/23) — exige redesenhar CORS/CSRF.
- **SUGESTÃO:** paginação nos endpoints de listagem, quando o volume de dados justificar (seção 23).
- **SUGESTÃO:** pipeline de CI/CD com testes automatizados permanentes, substituindo os scripts avulsos usados até aqui (seção 18).
- **SUGESTÃO:** possibilitar que empresas parceiras se cadastrem/gerenciem parcialmente sozinhas, se o modelo de negócio evoluir para multi-tenant (hoje é 100% cadastro manual pelo admin — seção 1).

---

## 31. GUIA PARA OUTRA IA

Você está assumindo o projeto **Movement Benefícios** (repositório `sistema-pontos`) — um sistema de fidelidade em pontos para pequenos negócios parceiros, backend Node.js/Express + PostgreSQL, frontend HTML/CSS/JS puro sem framework, hospedado no Render. Este documento é a fonte de verdade sobre o estado do projeto nesta data — mas **o código é sempre a fonte de verdade final**; se algo aqui divergir do código, confie no código e, se possível, atualize este documento.

### Arquitetura, em uma frase
Um único processo Express serve tanto os arquivos estáticos do frontend quanto a API JSON; autenticação por JWT (`Authorization: Bearer`); todo dado vive em 6 tabelas PostgreSQL (seção 8); toda regra de negócio sensível a concorrência (pontos, resgates) usa transação + `SELECT ... FOR UPDATE`.

### Onde procurar (mapa mental rápido)
- Regra de negócio → `src/controllers/*.js` (seção 9).
- Quem pode fazer o quê → `src/routes/*.js` + `roleMiddleware` (seção 10).
- Formato aceito num body → `src/middlewares/validate*.js`.
- Schema/colunas reais → consulte o banco diretamente (`information_schema.columns`, `pg_constraint`) antes de confiar de olhos fechados na seção 8 deste documento, especialmente se muito tempo tiver passado desde a data no topo.
- Tela do frontend → `frontend/<nome>.html` + `frontend/assets/js/<nome>.js` (seção 13).
- "Como isso deveria acontecer, passo a passo" → seção 14 (Fluxos Completos).

### Regras que NÃO podem ser quebradas
1. **Nunca** ler `usuario_id`/`tipo` do corpo/query/params quando a ação é "sobre o próprio usuário" — sempre `req.usuario.id`/`req.usuario.tipo` (populados pelo `authMiddleware` a partir do JWT). Quebrar isso é reintroduzir IDOR.
2. **Nunca** aceitar `tipo`/`ativo`/`destacada` vindos do corpo de um endpoint que não seja o endpoint dedicado para mudar aquele campo especificamente — é o padrão usado para `tipo` (só nos scripts de setup), `ativo` de recompensa/empresa (só `desativar`/`reativar`/`ativar`), `destacada` (só `destacar`/`remover-destaque`).
3. **Nunca** mexer em saldo de pontos fora de uma transação com `FOR UPDATE` na linha do usuário.
4. **Nunca** apagar de verdade um resgate, uma recompensa, uma empresa ou um usuário por padrão — o padrão deste projeto é sempre soft-delete (`ativo=false`) ou, no caso de resgate, `status='cancelado'`, preservando histórico.
5. **Nunca** commitar/logar/expor um valor de `.env`, `JWT_SECRET`, senha de banco, ou qualquer segredo — nem mesmo em texto de commit, comentário, ou neste documento.
6. **Nunca** validar imagem só pelo rótulo declarado — sempre pelos magic bytes reais (já implementado, ver `src/utils/validarImagem.js` — não remover essa camada ao alterar o arquivo).

### Como executar (resumo — ver seção 6 para o completo)
```bash
npm install
# criar .env local (seção 7, nunca copiar valores reais de produção)
node scripts/create-admin.js "Nome" "email@x.com" "senha"
npm start          # http://localhost:3000
```

### Como testar (resumo — ver seção 18)
Não há suíte automatizada. Escreva um script Node avulso, use `fetch` contra `http://localhost:3000`, crie contas de teste com email claramente identificável (ex. `algo.teste@teste.local`), **sempre delete os dados de teste ao final do próprio script** (mesmo em caso de erro — use `try/catch`/`finally` ou um bloco de limpeza no `.catch()` do `main()`), e nunca rode testes de escrita contra produção.

### Como trabalhar com o banco
- Sempre queries parametrizadas (`$1, $2...`), nunca concatenação de string.
- Antes de qualquer `ALTER TABLE`/`CREATE TABLE`, inspecione o schema atual primeiro (seção 8) — não assuma que uma coluna existe ou não existe.
- Toda migration nova: script avulso em `scripts/`, usando `IF NOT EXISTS`, testado localmente antes de sequer cogitar produção.

### Quando criar uma migration
Sempre que uma feature precisar de uma coluna/tabela nova. Nunca altere uma tabela existente "na mão" via um `ALTER TABLE` avulso que não fique registrado como um arquivo de migration em `scripts/` — mesmo que seja só para o ambiente local, isso documenta a mudança para quem vier depois (inclusive você mesma, numa sessão futura).

### Como lidar com produção
- **Nunca** escreva dados de teste em produção.
- **Nunca** peça ao usuário para colar a credencial de produção no meio do chat se puder evitar — prefira pedir para ele definir como variável de ambiente ou um arquivo local git-ignorado que você possa ler diretamente. Se ele mesmo colar, use a credencial só operacionalmente e nunca a reproduza de volta em nenhuma resposta.
- Toda alteração de schema em produção é manual (seção 20/21) — sempre com uma consulta somente-leitura antes e depois.
- Se encontrar um dado de origem ambígua durante uma investigação (ex.: um registro que pode ser real ou pode ser resíduo de teste), **não apague** — reporte explicitamente e peça confirmação, exatamente como já foi feito no incidente documentado na seção 29.

### Nunca expor secrets
Nomes de variável de ambiente podem ser documentados livremente (seção 7); valores, nunca — nem em resposta de chat, nem em arquivo, nem em log, nem em mensagem de commit.

### Preservar compatibilidade
Este projeto tem um histórico consistente de **nunca quebrar uma funcionalidade existente para entregar uma nova** — cada fase de desenvolvimento documentada (seção 19) testou explicitamente que os fluxos antigos continuavam funcionando antes de considerar a fase concluída. Mantenha esse padrão: toda mudança termina com uma checagem de regressão dos fluxos vizinhos (seção 26/27).

### Testar regressões
Antes de considerar qualquer mudança concluída, rode manualmente (ou via script) pelo menos: login dos 3 papéis, uma ação central de cada um (cliente resgata, funcionário lança pontos, admin edita algo), e qualquer fluxo que compartilhe tabela/endpoint com o que você alterou.

### Sequência recomendada para começar a entender o projeto
1. Leia a seção 1 e a seção 32 (resumo executivo) deste documento.
2. Leia `server.js` inteiro (curto, ~95 linhas) — dá a visão geral de como tudo se conecta.
3. Leia `src/config/database.js` (trivial) e uma tabela por vez na seção 8, junto com o controller correspondente.
4. Escolha um fluxo da seção 14 que pareça relevante para o que você vai fazer, e leia o controller/rota envolvidos de ponta a ponta.
5. Só depois disso, comece a editar — e sempre volte à seção 26 antes de considerar uma mudança "pronta".

---

## 32. RESUMO EXECUTIVO FINAL

### O projeto em 5 minutos

**Objetivo:** programa de fidelidade em pontos compartilhado entre pequenos negócios parceiros (hoje: oficina, academia e um terceiro parceiro cadastrado) — cliente acumula pontos consumindo nos parceiros e troca por recompensas oferecidas por eles.

**Stack:** Node.js 24 + Express 5 no backend; PostgreSQL como único armazenamento (inclusive imagens, em base64); HTML/CSS/JS puro no frontend, sem framework, sem build; JWT para autenticação; `bcrypt` para senha; `helmet`+`cors`+`express-rate-limit` para segurança HTTP.

**Arquitetura:** monolito único — o mesmo processo Express serve o frontend estático e a API. `routes → middlewares (auth/role/validação) → controllers → (transação/service) → PostgreSQL`.

**Usuários:** 3 papéis na mesma tabela `usuarios` (`cliente`, `funcionario`, `admin`), diferenciados pela coluna `tipo` e por `roleMiddleware` em cada rota.

**Principais funcionalidades:** cadastro/login; lançamento e histórico de pontos; catálogo de recompensas com imagem (upload + recorte no navegador); resgate com código único + validação no balcão; **expiração automática de resgate pendente após 5 horas, com devolução de pontos**; destaque global de recompensa (admin/funcionário); favoritos individuais (cliente); identificação de cliente por QR Code; painel administrativo completo, incluindo "Ver mais" de cada empresa parceira.

**Banco:** 6 tabelas (`usuarios`, `empresas`, `recompensas`, `resgates`, `movimentacoes_pontos`, `recompensas_favoritas`), todas com FK e `CHECK` constraints reais no Postgres — não só validação na aplicação. Saldo do cliente nunca é uma coluna fixa: é sempre a soma calculada de `movimentacoes_pontos`.

**Segurança:** já passou por três rodadas de auditoria com dezenas de testes de ataque ao vivo (SQL injection, XSS, IDOR, autorização, concorrência/double-spend, upload malicioso) — **0 crítico, 0 alto** encontrados nas três rodadas; os dois médios encontrados (timing attack no login, validação de imagem por magic bytes) **já foram corrigidos no código**, ainda pendentes só de commit/push/deploy.

**Deploy:** GitHub (`MarcosViniciusUC/sistema-pontos`, branch `main`) → Render (build automático, `npm install` + `npm start`), com PostgreSQL gerenciado próprio de produção. HTTPS forçado. Já houve um incidente real de schema desatualizado em produção depois de um deploy — corrigido e documentado, com um procedimento formal criado para não repetir (seção 20/21).

**Estado atual:** V1 funcionalmente completa e testada, última auditoria de fechamento concluiu **"APTO PARA CONGELAR V1"**. Existem duas correções de segurança já implementadas e testadas no diretório de trabalho, ainda não commitadas.

**Próximos passos (não uma decisão de produto, só o que já foi identificado):** commitar/enviar/implantar as duas correções pendentes; endereçar os 8 achados de severidade baixa (política de senha, validação de tamanho de string, índices de performance, etc.) como V1.1; considerar migração de storage de imagem e de sessão para cookie `httpOnly` como possíveis evoluções de arquitetura mais à frente (V2/sugestão).

---

## 33. APÊNDICE TÉCNICO

### Árvore de arquivos relevante
Ver seção 4 para a árvore completa comentada. Contagens: 16 páginas HTML, 19 arquivos JS de frontend, 5 arquivos CSS, 9 arquivos em `src/controllers`+`src/routes`+`src/services` (8 controllers + 8 routes + 1 service — alguns arquivos de rota/controller correspondem 1:1, total de 17 arquivos nessas três pastas), 14 middlewares, 4 utils, 9 scripts. **65 arquivos `.js` no total no projeto** (fora `node_modules`), todos confirmados sintaticamente válidos (`node --check`) na última auditoria.

### Lista completa de endpoints (35)
Ver seção 12 para a tabela completa com auth/perfil/body/resposta/erros. Lista só de rotas, por arquivo:

- `src/routes/auth.routes.js`: `POST /login`
- `src/routes/user.routes.js`: `POST /usuarios`, `GET /usuarios/me`, `GET /usuarios`, `GET /usuarios/qr/:qr_token`, `GET /usuarios/buscar-cliente`, `PUT /usuarios/:id`
- `src/routes/admin.routes.js`: `GET /admin/dashboard`
- `src/routes/empresa.routes.js`: `POST /empresas`, `GET /empresas`, `GET /empresas/admin`, `GET /empresas/:id/detalhes`, `PUT /empresas/:id`, `PATCH /empresas/:id/ativar`, `PATCH /empresas/:id/desativar`
- `src/routes/points.routes.js`: `POST /pontos/entrada`, `POST /pontos/saida`, `GET /pontos/saldo`, `GET /pontos/historico`, `GET /pontos/resumo`
- `src/routes/reward.routes.js`: `POST /recompensas`, `GET /recompensas`, `GET /recompensas/admin`, `PUT /recompensas/:id`, `DELETE /recompensas/:id`, `PATCH /recompensas/:id/reativar`, `PATCH /recompensas/:id/destacar`, `PATCH /recompensas/:id/remover-destaque`
- `src/routes/redemption.routes.js`: `POST /resgates`, `GET /resgates`, `GET /resgates/meus`, `POST /resgates/validar`
- `src/routes/favorito.routes.js`: `GET /favoritos`, `POST /favoritos/:id`, `DELETE /favoritos/:id`

### Lista completa de tabelas (6)
`usuarios`, `empresas`, `recompensas`, `resgates`, `movimentacoes_pontos`, `recompensas_favoritas` — ver seção 8 para colunas/constraints completas de cada uma.

### Lista de migrations (9 arquivos em `scripts/`)
`migrate-empresas.js`, `migrate-movimentacoes-origem.js`, `migrate-recompensas-imagem.js`, `migrate-resgates-fluxo-imediato.js`, `migrate-usuarios-qr-token.js`, `migrate-recompensas-destaque.js`, `migrate-recompensas-favoritas.js` (migrations de schema) + `create-admin.js`, `create-funcionario.js` (scripts de dado, não de schema). Ver seção 20.

### Lista de variáveis de ambiente
`DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV`. Ver seção 7 (nenhum valor real documentado).

### Dependências de produção (`package.json`, versões resolvidas em `package-lock.json`)
| Pacote | Versão |
|---|---|
| `bcrypt` | 6.0.0 |
| `cors` | 2.8.6 |
| `dotenv` | 17.4.2 |
| `express` | 5.2.1 |
| `express-rate-limit` | 8.7.0 |
| `helmet` | 8.3.0 |
| `jsonwebtoken` | 9.0.3 |
| `pg` | 8.23.0 |

105 pacotes no total contando dependências transitivas. `npm audit`: 0 vulnerabilidades na última verificação.

### Comandos importantes
```bash
npm install                              # instalar dependências
npm start                                 # iniciar o servidor (porta 3000)
node scripts/create-admin.js              # criar administrador
node scripts/create-funcionario.js        # criar funcionário
node scripts/migrate-<nome>.js            # rodar uma migration específica
node --check <arquivo>.js                 # validar sintaxe de um arquivo
npm audit                                 # checar vulnerabilidades de dependência
pg_dump -U postgres -d sistema_pontos -F p -f backup-sistema-pontos.sql   # backup
psql -U postgres -d sistema_pontos -f backup-sistema-pontos.sql          # restaurar
```

### Scripts importantes (`scripts/`)
- `create-admin.js` / `create-funcionario.js` — únicas formas de criar essas contas; rodam interativamente se argumentos não forem passados na linha de comando.
- Todas as `migrate-*.js` — ver seção 20 para o efeito exato de cada uma.

---

*Fim do documento. Ver nota de verificação final e limitações confirmadas na mensagem de entrega deste documento (fora do arquivo), conforme solicitado.*
