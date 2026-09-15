# Documentação Mestra — Movement Benefícios (sistema-pontos)

> Documento de referência técnica e operacional para qualquer pessoa ou IA que precise assumir, manter ou evoluir este projeto sem precisar do histórico da conversa que o gerou.
>
> **Data desta auditoria:** 2026-09-12.
> **Commit HEAD local no momento da auditoria:** `4d07fd4` ("Adiciona scheduler de engajamento em modo simulacao"), branch `main`, **idêntico a `origin/main`** (`git status`: "up to date with origin/main").
> **Alterações locais não commitadas no momento desta auditoria:** toda a funcionalidade de **recuperação de senha por e-mail** (controllers, rotas, middlewares, serviço de e-mail, migration, 2 páginas de frontend) — ver seção 7. Isso significa que o GitHub e o Render **não têm** essa funcionalidade ainda.

### Como ler este documento

Toda informação relevante foi classificada, mesmo que não marcada explicitamente linha a linha:
- **VERIFICADO** — confirmado nesta auditoria lendo o código-fonte real, consultando o banco local e/ou de produção diretamente, ou inspecionando o Git. É o padrão de toda informação factual/técnica abaixo, salvo indicação contrária.
- **INFERIDO** — conclusão razoável a partir de evidência indireta (ex: "o Render provavelmente está publicado no commit X porque o schema de produção bate com o que esse commit exige"), nunca confirmada por acesso direto a um painel/log que a comprovasse de forma definitiva.
- **PENDENTE** — depende de uma decisão de negócio ainda não tomada, de uma implementação futura, ou de uma verificação que não pôde ser feita nesta auditoria (ex: acesso ao painel do Render). Nunca tratado como fato neste documento.

Nenhum valor secreto (senha, connection string, JWT_SECRET, chave de API) aparece neste documento — apenas nomes de variáveis.

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Stack Tecnológica (versões verificadas)](#2-stack-tecnológica-versões-verificadas)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Arquitetura](#4-arquitetura)
5. [Como Executar Localmente](#5-como-executar-localmente)
6. [Variáveis de Ambiente](#6-variáveis-de-ambiente)
7. [Banco de Dados](#7-banco-de-dados)
8. [Autenticação e Login por CPF](#8-autenticação-e-login-por-cpf)
9. [Recuperação de Senha](#9-recuperação-de-senha)
10. [Regras de Negócio — Pontos](#10-regras-de-negócio--pontos)
11. [Regras de Negócio — Recompensas](#11-regras-de-negócio--recompensas)
12. [Regras de Negócio — Resgates](#12-regras-de-negócio--resgates)
13. [Favoritos](#13-favoritos)
14. [Progresso / Fidelização (Bloco 1)](#14-progresso--fidelização-bloco-1)
15. [Motor de Engajamento (Bloco 3)](#15-motor-de-engajamento-bloco-3)
16. [Automações e Eventos — o que é real hoje](#16-automações-e-eventos--o-que-é-real-hoje)
17. [Limite Global de Frequência (7 dias)](#17-limite-global-de-frequência-7-dias)
18. [Scheduler](#18-scheduler)
19. [Providers de Notificação](#19-providers-de-notificação)
20. [Usuários e Permissões](#20-usuários-e-permissões)
21. [API Completa](#21-api-completa)
22. [Frontend](#22-frontend)
23. [Sistema de Migrations](#23-sistema-de-migrations)
24. [Ambiente Local × Render](#24-ambiente-local--render)
25. [Backups](#25-backups)
26. [Git](#26-git)
27. [Testes](#27-testes)
28. [Segurança](#28-segurança)
29. [LGPD / Privacidade](#29-lgpd--privacidade)
30. [O que está pronto](#30-o-que-está-pronto)
31. [O que ainda falta](#31-o-que-ainda-falta)
32. [Checklist para lançamento real](#32-checklist-para-lançamento-real)
33. [Roadmap](#33-roadmap)
34. [Histórico do Projeto](#34-histórico-do-projeto)
35. [Contexto para Outra Inteligência Artificial](#35-contexto-para-outra-inteligência-artificial)

---

## 1. VISÃO GERAL DO PROJETO

**Nome do repositório:** `sistema-pontos`. **Nome do produto (frontend, marca):** **Movement** — rodapé "Seu desempenho. Seus pontos. Suas recompensas." (`frontend/index.html`).

**Objetivo:** programa de fidelidade em pontos compartilhado entre pequenos negócios parceiros. O cliente acumula pontos consumindo nos parceiros e troca por recompensas oferecidas por eles mesmos.

**Problema que resolve:** pequenos estabelecimentos normalmente não têm programa de fidelidade próprio (ou usam cartela de papel). O Movement centraliza isso num único sistema com histórico confiável, prova de resgate por código/QR e validação no balcão.

**Público-alvo / tipos de usuário** (coluna `usuarios.tipo`, sem CHECK constraint no banco — restrição só na aplicação):
| Tipo | Papel |
|---|---|
| `cliente` | Consumidor final — acumula e troca pontos |
| `funcionario` | Atende no balcão — identifica cliente, lança pontos, valida resgates |
| `admin` | Gestor do programa — cadastra empresas/recompensas, visão completa |

**Fluxo principal:** cliente se cadastra → funcionário/admin lança pontos após consumo → cliente acumula saldo (sempre calculado, nunca uma coluna fixa) → cliente resgata recompensa (código gerado, pontos descontados na hora) → cliente apresenta código no balcão → funcionário valida → se não usado em 5h, cancela sozinho e devolve os pontos.

**Estágio atual:** V1 majoritariamente implementada e operando localmente e em produção (Render), com uma segunda camada de fidelização (progresso/gamificação leve) e a infraestrutura de um motor de engajamento (ainda não conectado a nenhum canal real) construída por cima. Recuperação de senha está implementada mas **ainda não publicada** (ver seção 9).

**Implementado (confirmado no código, ver seções correspondentes):** cadastro/login por CPF com contas legadas, JWT, pontos (entrada/saída/saldo/histórico), empresas parceiras, recompensas (CRUD + imagem + destaque), resgate com código único + expiração automática de 5h, favoritos individuais, progresso de fidelização no dashboard (Bloco 1), motor de engajamento em modo simulação com scheduler (Bloco 3), sistema de migrations com rastreamento (`migration_history`), recuperação de senha por e-mail (local, não publicada).

**Planejado / pendente:** ver seções 16, 17 (regras de negócio de automação), 31 e 33.

---

## 2. STACK TECNOLÓGICA (versões verificadas)

Todas as versões abaixo foram lidas diretamente de `package.json`/`package-lock.json` e do ambiente local nesta auditoria — nenhuma foi presumida.

### Backend
| Tecnologia | Versão instalada | Papel |
|---|---|---|
| Node.js | v24.19.0 (ambiente de dev verificado; sem `engines` no `package.json`) | Runtime |
| Express | 5.2.1 | Framework HTTP |
| pg | 8.23.0 | Driver PostgreSQL |
| bcrypt | 6.0.0 | Hash de senha (10 rounds) |
| jsonwebtoken | 9.0.3 | Emissão/verificação de JWT |
| helmet | 8.3.0 | Headers de segurança + CSP |
| cors | 2.8.6 | Controle de origem cruzada |
| express-rate-limit | 8.7.0 | Rate limiting (login, esqueci-senha, global) |
| dotenv | 17.4.2 | Carrega `.env` |
| **nodemailer** | **10.0.9** | Cliente SMTP (recuperação de senha) — adicionado nesta última etapa; versão inicial instalada (6.9.16) tinha vulnerabilidades altas conhecidas, corrigida para 10.0.9 |

Nenhum ORM — todo SQL é escrito à mão via `pg`, sempre parametrizado. Nenhuma lib de imagem (`sharp`/`jimp`) — validação de imagem é `Buffer` puro do Node.

### Frontend
HTML/CSS/JS **vanilla**, sem framework, sem bundler, sem `node_modules` no frontend. 20 páginas HTML, cada uma carregando seus próprios `<script>` na ordem `api.js → auth.js → ui.js → <script da tela>` (exceto `index.html`/`cadastro.html`/`esqueci-senha.html`, que não usam `ui.js`). Bibliotecas externas via CDN, na allow-list da CSP do Helmet:
- **qrcodejs** (`cdnjs.cloudflare.com`) — gera QR Codes.
- **jsQR** (`cdn.jsdelivr.net`) — decodifica QR Code da câmera.
- Google Fonts (Barlow, Barlow Condensed, JetBrains Mono).

### Banco
PostgreSQL — versão do servidor **não fixada** neste documento (confirmado compatível com `CHECK`, `FOR UPDATE`, transações, `pg_advisory_xact_lock`, `ON DELETE CASCADE`).

---

## 3. ESTRUTURA DE PASTAS

```
sistema-pontos/
├── server.js                      # ponto de entrada único do backend
├── package.json / package-lock.json
├── .env                           # segredos locais (gitignored)
├── .gitignore
│
├── frontend/                      # todo o frontend, servido por express.static
│   ├── *.html                     # 20 páginas
│   └── assets/
│       ├── css/  (tokens, base, components, dashboard, admin)
│       ├── js/   (21 arquivos — 1 por tela + api.js/auth.js/ui.js compartilhados)
│       └── img/logo.png
│
├── src/
│   ├── config/database.js         # Pool único do `pg`
│   ├── controllers/                # 9 arquivos
│   ├── routes/                     # 9 arquivos
│   ├── middlewares/                 # 16 arquivos
│   ├── services/
│   │   ├── resgateExpiracao.service.js
│   │   ├── emailService.js         # NOVO — recuperação de senha
│   │   └── engagement/             # Motor de Engajamento (Bloco 3) — 10 arquivos + providers/
│   └── utils/                      # 7 arquivos
│
├── scripts/                        # migrations + criação manual de admin/funcionário
└── docs/
    └── PROJETO-MOVEMENT-BENEFICIOS.md
```

### Responsabilidade de cada camada
- **`src/routes/`** — só compõe `método + caminho + middlewares + controller`. Nenhuma regra de negócio.
- **`src/controllers/`** — regra de negócio de cada domínio, sempre via SQL parametrizado.
- **`src/middlewares/`** — autenticação (`authMiddleware`), autorização por papel (`roleMiddleware`), validação de entrada (`validate*.js`, 12 arquivos — 1 por formato de body), erro (`errorHandler`).
- **`src/services/`** — lógica que roda "por conta própria", não só disparada por uma requisição: expiração de resgates, envio de e-mail, motor de engajamento inteiro.
- **`src/utils/`** — funções puras reaproveitadas por mais de um controller (CPF, QR token, código de resgate, slug de empresa, validação de imagem, identificadores legados, token de recuperação de senha).
- **`scripts/`** — tudo rodado manualmente/via orquestrador: migrations e criação de admin/funcionário.

---

## 4. ARQUITETURA

```
NAVEGADOR (HTML/CSS/JS puro)
   │ fetch() via window.api() — Authorization: Bearer <JWT>
   ▼
server.js (processo único Express)
   1. Helmet (CSP)
   2. CORS (CORS_ORIGIN)
   3. express.json (limite maior só em /recompensas, por causa de imagem base64)
   4. express.static("frontend/")
   5. globalLimiter (300 req/15min, só rotas de API)
   6. Rotas (auth, usuarios, pontos, recompensas, resgates, admin, empresas, favoritos, engajamento)
   7. 404 handler
   8. errorHandler
   + iniciarLimpezaPeriodica() — expiração de resgates, a cada 5min
   + engagementScheduler.iniciar() — só age se habilitado por env var
   ▼
Controllers → SQL parametrizado direto (sem ORM) → PostgreSQL (9 tabelas)
```

**Autenticação:** JWT (`{id, tipo}`, `expiresIn: "1h"`, sem refresh) verificado por `authMiddleware`, que popula `req.usuario`. **Autorização:** `roleMiddleware(...papeis)`, sempre depois de `authMiddleware`. **Identidade:** toda rota "sobre si mesmo" usa `req.usuario.id` do token — nunca um id vindo de body/query/params.

**Responsabilidades que nunca devem se misturar** (convenção já estabelecida no projeto):
- Rotas nunca contêm lógica de negócio.
- Controllers nunca falam SMTP/WhatsApp diretamente — sempre via `emailService`/`notificationService`.
- O motor de engajamento nunca decide se algo é "permitido" sem consultar `notificacoes_historico` sob lock.
- O frontend nunca decide se um resgate/benefício é válido — só apresenta; o backend sempre revalida tudo.

---

## 5. COMO EXECUTAR LOCALMENTE

```bash
npm install
# criar .env (ver seção 6)
npm run migrate      # aplica todas as migrations pendentes (ver seção 23)
node scripts/create-admin.js "Nome" "email" "senha"   # se precisar de um admin novo
npm start             # node server.js, porta 3000 fixa (não configurável por env)
```
Frontend em `http://localhost:3000/index.html`.

---

## 6. VARIÁVEIS DE AMBIENTE

**Somente nomes — nenhum valor real aparece neste documento.**

| Variável | Obrigatória | Finalidade |
|---|---|---|
| `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT` | Sim | Conexão PostgreSQL (`src/config/database.js`) |
| `JWT_SECRET` | Sim | Assina/verifica todo JWT — valor diferente e independente entre local e produção |
| `CORS_ORIGIN` | Sim | Origem permitida pelo CORS |
| `NODE_ENV` | Não | Só usado para relaxar rate limits em dev (`=== "development"`, allow-list) |
| `APP_BASE_URL` | Sim (para recuperação de senha) | Base da URL usada no link do e-mail de redefinição |
| `EMAIL_MOCK` | Não | `"true"` força modo mock de e-mail (nenhuma rede) — também ativado automaticamente se `SMTP_HOST` não estiver definido |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Não localmente (mock ativo); necessárias em produção para envio real | Configuração do transporte SMTP (`src/services/emailService.js`) |
| `ENGAGEMENT_SCHEDULER_ENABLED` | Não | `"true"` liga o scheduler do motor de engajamento — default seguro é desligado |
| `ENGAGEMENT_SCHEDULER_INTERVAL_MS` | Não | Intervalo do scheduler em ms — valor técnico de dev, nunca decisão comercial |
| `DATABASE_URL` | Não | Não lida por nenhum código da aplicação — só usada manualmente, uma vez, como parâmetro de linha de comando para rodar migrations direto contra produção |

Nenhum `.env.example` existe no repositório (verificado — não encontrado).

---

## 7. BANCO DE DADOS

**9 tabelas de domínio confirmadas no banco local** (via `\dt` + `\d` de cada uma, nesta auditoria) — descritas em detalhe abaixo. Desde então, mais 2 tabelas foram criadas como fundação multi-tenant (`tenants`, `admins_plataforma`, ambas fora do modelo de domínio atual) — ver seção 23.

### Diagrama ER simplificado

```
usuarios ──┬──< movimentacoes_pontos >──┐
   │       ├──< resgates >──────────────┤
   │       ├──< recompensas_favoritas >─┼──> recompensas ──> empresas
   │       ├──< notificacoes_historico   │
   │       └──< password_reset_tokens    │
   │ (CASCADE)      (CASCADE)            │
   └── migration_history (sem FK — tabela de infraestrutura, não de domínio)
```

### `usuarios`
| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| id | integer (serial) | não | — | PK |
| nome | varchar(100) | não | — | |
| email | varchar(150) | não | — | UNIQUE — contato + identificador de 3 contas legadas |
| senha | varchar(255) | não | — | hash bcrypt, nunca texto puro |
| telefone | varchar(20) | sim | — | opcional |
| tipo | varchar(20) | não | `'cliente'` | `cliente`/`funcionario`/`admin` — **sem CHECK no banco**, só na aplicação |
| criado_em | timestamp | sim | `CURRENT_TIMESTAMP` | |
| qr_token | varchar(64) | não | — | UNIQUE — 32 bytes aleatórios hex |
| cpf | varchar(11) | **sim** | — | UNIQUE — só dígitos; **nullable de propósito**, ver seção 8 |

Referenciada por: `movimentacoes_pontos`, `resgates` (sem CASCADE — histórico não some), `recompensas_favoritas`, `notificacoes_historico`, `password_reset_tokens` (com CASCADE — artefatos efêmeros).

### `empresas`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| nome | varchar(100) | não | — |
| slug | varchar(50) | não | — (UNIQUE) |
| ativo | boolean | não | true |
| criado_em | timestamp | não | now() |

Desativação é sempre lógica (`ativo=false`), nunca DELETE.

### `recompensas`
| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| id | integer (serial) | não | — | PK |
| nome | varchar(150) | não | — | CHECK: não vazio |
| descricao | text | sim | — | |
| pontos_necessarios | integer | não | — | CHECK > 0 |
| ativo | boolean | não | true | soft-delete |
| criado_em | timestamp | não | now() | |
| empresa_id | integer | sim | — | FK empresas, nullable (histórico) |
| imagem | text | sim | — | data URL base64 completa, direto no Postgres (sem storage externo) |
| destacada | boolean | não | false | destaque GLOBAL (admin/funcionário) |

### `resgates`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| usuario_id | integer | não | FK usuarios |
| recompensa_id | integer | não | FK recompensas |
| pontos | integer | não | CHECK > 0 — snapshot do custo no momento do resgate |
| status | varchar(20) | não | `'pendente_validacao'` — CHECK: `pendente_validacao`/`utilizado`/`cancelado` |
| criado_em / atualizado_em | timestamp | não | now() |
| codigo | varchar(12) | não | UNIQUE |
| empresa_id | integer | sim | FK empresas — snapshot |

### `movimentacoes_pontos`
Livro-razão — o saldo **nunca** é uma coluna, sempre a soma desta tabela.
| Coluna | Tipo | Nullable | Default | Observação |
|---|---|---|---|---|
| id | integer (serial) | não | — | |
| usuario_id | integer | não | FK usuarios | |
| quantidade | integer | não | — | CHECK > 0 (sinal vem de `tipo`) |
| tipo | varchar(10) | não | — | CHECK: `entrada`/`saida` |
| descricao | text | sim | — | |
| criado_em | timestamp | não | now() | |
| origem | varchar(20) | não | `'outro'` | CHECK: `oficina`/`academia`/`promocao`/`ajuste`/`outro` — **coluna legada, não escrita mais pelo código atual** (ver seção 10) |
| empresa_id | integer | sim | FK empresas | é o campo estruturado real, sucessor de `origem` |

### `recompensas_favoritas`
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| usuario_id | integer | não | FK usuarios, **ON DELETE CASCADE** |
| recompensa_id | integer | não | FK recompensas, **ON DELETE CASCADE** |
| criado_em | timestamp | não | now() |

UNIQUE `(usuario_id, recompensa_id)` — impede duplo favorito.

### `migration_history` (infraestrutura — ver seção 23)
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| nome | varchar(255) | não | UNIQUE |
| executado_em | timestamp | não | now() |

### `notificacoes_historico` (Motor de Engajamento — ver seção 17)
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| usuario_id | integer | não | FK usuarios (sem CASCADE) |
| evento | varchar(50) | não | — |
| automacao_nome | varchar(100) | sim | — |
| canal | varchar(20) | sim | — |
| status | varchar(20) | não | CHECK: `enviado`/`falhou`/`bloqueado_por_limite` |
| mensagem | text | sim | — |
| erro | text | sim | — |
| identificador_externo | varchar(255) | sim | — |
| criado_em | timestamp | não | now() |

Índice composto `(usuario_id, status, criado_em)` — é exatamente a consulta do limite de 7 dias.

### `password_reset_tokens` (recuperação de senha — local, não publicada)
| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (serial) | não | — |
| usuario_id | integer | não | FK usuarios, **ON DELETE CASCADE** |
| token_hash | varchar(64) | não | UNIQUE — SHA-256 do token (nunca o token em texto puro) |
| expira_em | timestamp | não | — |
| usado_em | timestamp | sim | NULL = ainda não usado |
| criado_em | timestamp | não | now() |

Índice em `usuario_id`.

### Estado atual dos dados (local, verificado nesta auditoria)
```
usuarios: 3 | empresas: 3 | recompensas: 16 (9 ativas, 2 destacadas)
resgates: 8 | movimentacoes_pontos: 22 | recompensas_favoritas: 0
notificacoes_historico: 0 | password_reset_tokens: 0 | migration_history: 10
```
Os 3 usuários locais são as contas de exceção/legadas — ver seção 8.

---

## 8. AUTENTICAÇÃO E LOGIN POR CPF

**Login normal:** por **CPF**, nunca e-mail. **3 contas legadas** continuam entrando pelo identificador antigo.

### Fluxo (`POST /login`, `src/controllers/auth.controller.js`)
1. `validateLogin.js` aceita o campo `cpf` do body se: (a) bate no formato de CPF real (dígitos verificadores válidos, `src/utils/cpf.js`), ou (b) é **exatamente** um dos 3 valores da lista fechada abaixo.
2. Se for identificador legado → busca `WHERE email = $1`. Senão → normaliza (só dígitos) e busca `WHERE cpf = $1`.
3. `bcrypt.compare()` roda **sempre**, mesmo se o usuário não existir (contra um hash dummy fixo) — protege contra timing attack (diferença medida e corrigida: de ~70ms para ~1-4ms).
4. JWT `{id, tipo}`, `expiresIn: "1h"`.
5. Mensagem de erro sempre idêntica: `"CPF ou senha inválidos"`.

### Contas legadas (`src/utils/identificadoresLegado.js`) — lista fechada, nunca genérica
| Identificador | id | tipo | Motivo |
|---|---|---|---|
| `"admin"` | 73 | admin | Conta de demonstração fixa, sem CPF cadastrado de propósito |
| `"funcio"` | 74 | funcionario | Idem |
| `"maria@teste.com"` | 2 | cliente | Conta legada com e-mail real (não um literal como as outras duas) |

**Por que existe compatibilidade legada:** essas 3 contas existiam antes da migração para CPF e **não têm CPF cadastrado** — nunca foi inventado um CPF para elas (decisão explícita). Qualquer outro valor, mesmo um e-mail real de outro usuário, é **sempre** tratado como CPF — não existe fallback "tenta CPF, se não achar tenta e-mail" para ninguém fora desta lista de 3.

**CPF — normalização e validação** (`src/utils/cpf.js`): remove tudo que não é dígito; rejeita sequências repetidas (`00000000000` etc.); valida os 2 dígitos verificadores pelo algoritmo oficial; só o valor normalizado (11 dígitos) é armazenado — a máscara é responsabilidade do frontend.

**Cadastro público** (`POST /usuarios`): sempre cria `tipo='cliente'` (o body nunca é lido para esse campo); CPF **obrigatório e validado**; e-mail continua obrigatório, para contato e recuperação de senha.

**Rate limiting do login:** `express-rate-limit`, 10 tentativas/15min em produção, 1000/15min quando `NODE_ENV === "development"` (allow-list, nunca deny-list).

---

## 9. RECUPERAÇÃO DE SENHA

> **ESTADO REAL VERIFICADO NESTA AUDITORIA: implementada e testada localmente, mas NÃO commitada, NÃO publicada no GitHub, NÃO deployada no Render.** `git status` confirma todos os arquivos abaixo como "Changes not staged"/"Untracked". Uma checagem HTTP direta em produção confirma `404` para `/login/esqueci-senha` — a rota não existe lá ainda.

### O que existe (local)
- **Endpoints:** `POST /login/esqueci-senha` (recebe `email`), `POST /login/redefinir-senha` (recebe `token`, `senha`, `confirmar_senha`).
- **Páginas:** `frontend/esqueci-senha.html` + `.js`, `frontend/redefinir-senha.html` + `.js` (3 estados: formulário / token inválido / sucesso). Link "Esqueci minha senha" adicionado em `index.html`.
- **Tabela:** `password_reset_tokens` (ver seção 7).
- **Token:** `crypto.randomBytes(32)` hex (256 bits), nunca salvo em texto puro — só o SHA-256 (`src/utils/passwordResetToken.js`). Expira em **60 minutos** (constante hardcoded, mesmo padrão de `HORAS_PARA_EXPIRAR` dos resgates). Uso único — `usado_em` marcado no momento da troca.
- **SMTP:** `src/services/emailService.js`, via `nodemailer`, compatível com Gmail/Google Workspace (porta 587 STARTTLS ou 465 SSL). **Modo mock** ativado automaticamente sem `SMTP_HOST` (ou explicitamente com `EMAIL_MOCK=true`) — nenhuma rede é usada, e-mails ficam só em memória para inspeção em teste.
- **Rate limiting:** limiter dedicado (`express-rate-limit`, mesmo padrão do login), 5 tentativas/15min em produção.
- **Segurança:** resposta **idêntica** para e-mail existente/inexistente ("Se o e-mail estiver cadastrado..."); envio de e-mail nunca aguardado antes de responder (evita vazar por tempo se a conta existe); `SELECT...FOR UPDATE` na validação do token (concorrência); novo pedido invalida qualquer token anterior ainda válido do mesmo usuário.
- **Contas legadas:** admin/funcio nunca chegam a este fluxo (o valor da coluna `email` deles não é um e-mail válido, rejeitado por formato). Maria (e-mail real) é elegível normalmente.
- **JWT existentes:** trocar a senha **não invalida** tokens JWT já emitidos — decisão documentada: o projeto não tem infraestrutura de revogação, os tokens já expiram em 1h, e construir uma blocklist foi considerado desproporcional ao escopo desta etapa.

### PENDENTE
- Commit, push e deploy desta funcionalidade.
- Configuração de SMTP real de produção (Gmail ou outro provedor) no ambiente do Render.
- `APP_BASE_URL` de produção apontando para a URL pública real.

---

## 10. REGRAS DE NEGÓCIO — PONTOS

`src/controllers/points.controller.js`.

| Campo (`movimentacoes_pontos`) | Significado |
|---|---|
| `tipo` | `entrada` (soma) ou `saida` (subtrai) — o sinal nunca vem de um número negativo |
| `quantidade` | Sempre positiva (CHECK > 0) |
| `descricao` | Texto livre, sempre preenchido pelo backend (nunca pelo cliente) |
| `empresa_id` | Campo estruturado real de qual parceiro gerou o lançamento |
| `origem` | **Legado** — `entrada()` não escreve mais aqui de propósito (cai no `DEFAULT 'outro'`); não confiável para saber a empresa de uma movimentação atual |

- **Entrada** (`POST /pontos/entrada`, admin+funcionário): exige `empresa_id` de uma empresa ativa; só para `tipo='cliente'`.
- **Saída manual** (`POST /pontos/saida`, admin apenas): nunca deixa saldo negativo; **não confirma** que o alvo é cliente (inconsistência de dados conhecida, não uma falha de autorização).
- **Saldo:** sempre `SOMA(entrada) − SOMA(saida)`, recalculado em toda consulta — nunca uma coluna.
- **Resgate como saída:** ao resgatar, o backend insere a `saida` diretamente (não passa por `POST /pontos/saida`).
- **Devolução por cancelamento:** o serviço de expiração insere uma `entrada` com `descricao` no padrão `"Pontos devolvidos pelo cancelamento do resgate #<id>"` e **sem `empresa_id`** — esse detalhe é o que permite ao Motor de Engajamento distinguir uma "visita real" de uma devolução (ver seção 15).

---

## 11. REGRAS DE NEGÓCIO — RECOMPENSAS

`src/controllers/reward.controller.js`.

### Estrutura do sistema (isto não muda)
- Criação/edição exigem `empresa_id` de empresa ativa; `ativo`/`destacada` nunca são lidos do body de criar/editar — só mudam pelos endpoints dedicados (`DELETE`/`PATCH .../reativar`/`PATCH .../destacar`/`PATCH .../remover-destaque`).
- Desativação é sempre `ativo=false` (soft-delete) — nunca `DELETE` de verdade; resgates antigos continuam íntegros.
- **Destaque é GLOBAL** (admin/funcionário, `recompensas.destacada`) — diferente de **favorito**, que é individual (ver seção 13).
- Imagem: data URL base64 direto no Postgres, validada por `src/utils/validarImagem.js` (magic bytes reais, não só extensão) — máximo 5MB de base64 (~3.7MB real) e 4000×4000px.

### ⚠️ Dados comerciais atuais ≠ regra fixa
As **16 recompensas cadastradas hoje** (9 ativas, 2 destacadas), seus nomes, custos em pontos e quais empresas as oferecem são **dados de configuração via painel administrativo**, não uma regra do sistema. Qualquer um desses valores pode mudar a qualquer momento sem exigir mudança de código. Nada neste documento deve ser lido como "a recompensa X sempre custará Y pontos".

---

## 12. REGRAS DE NEGÓCIO — RESGATES

`src/controllers/redemption.controller.js` + `src/services/resgateExpiracao.service.js`.

```
cliente → POST /resgates {recompensa_id}
   → backend trava a linha do usuário (FOR UPDATE), recalcula saldo,
     desconta pontos NA HORA, gera código único (retry com SAVEPOINT
     em colisão) → status 'pendente_validacao'
   → cliente apresenta código/QR no balcão
   → funcionário/admin: POST /resgates/validar {codigo}
   → status 'utilizado' (nunca mexe em pontos de novo)
```

- **Expiração automática — regra real do código:** `criado_em + INTERVAL '5 hours' <= NOW()` (comparado sempre no PostgreSQL, nunca no Node/frontend). Constante `HORAS_PARA_EXPIRAR = 5` em `resgateExpiracao.service.js`, exportada para reuso (o Motor de Engajamento a importa em vez de duplicar o número).
- **Devolução:** ao expirar, `status → 'cancelado'` + `entrada` de `resgate.pontos` exatos (nunca recalculado).
- **2 mecanismos de verificação:** (A) `setInterval` a cada 5 minutos desde o boot; (B) sob demanda no início de `GET /resgates/meus`, `GET /resgates`, `POST /resgates/validar`, `GET /admin/dashboard` — garante que mesmo um servidor recém-reiniciado processa o atraso antes de responder.
- **Concorrência:** cada resgate expirado processado em transação própria com `SELECT...FOR UPDATE` — duas varreduras simultâneas nunca devolvem pontos em dobro.
- **Segurança:** `usuario_id` sempre do JWT; pontos/status/código sempre decididos pelo servidor, nunca lidos do body.

---

## 13. FAVORITOS

`src/controllers/favorito.controller.js` — exclusivo de `cliente`.

- `POST/DELETE /favoritos/:id` — `usuario_id` sempre de `req.usuario.id`, idempotente (`ON CONFLICT DO NOTHING`/DELETE sem erro se não existir).
- `GET /favoritos` — **inclui recompensas com `ativo=false`** (a relação sobrevive à desativação) — o frontend mostra "indisponível", nunca esconde.
- `UNIQUE(usuario_id, recompensa_id)` no banco impede duplo favorito mesmo sob concorrência.
- **Recompensa desativada depois de favoritada:** continua na lista, sem progresso calculado (não faz sentido calcular "faltam X pontos" para algo que não pode ser resgatado).
- **Relação com progresso:** ver seção 14 — cada favorito tem sua própria barra de progresso individual no frontend.

---

## 14. PROGRESSO / FIDELIZAÇÃO (BLOCO 1)

Cálculo **inteiramente no frontend** (`frontend/assets/js/ui.js`), reaproveitando dados que `dashboard.js`/`recompensas.js`/`favoritos.js` já buscam para outros fins (`GET /pontos/saldo` + `GET /recompensas`/`GET /favoritos`) — **nenhum endpoint novo**, decisão deliberada de performance. O backend nunca lê nem confia em nada calculado aqui — `POST /resgates` revalida saldo de forma independente sempre.

### Regra de "quase lá"
`saldo / pontos_necessarios >= 80%` — escolhida por escalar (80% de uma recompensa de 60 pontos e de uma de 500 são psicologicamente equivalentes; um número fixo de pontos não seria).

### Prioridade de estado (dashboard)
1. Se existe **qualquer** recompensa com `pontos_necessarios <= saldo` → mostra "já desbloqueou", nomeando a mais barata + contagem das demais (nunca "faltam X" quando já há algo desbloqueado).
2. Senão, se existe uma recompensa com `pontos_necessarios > saldo` → barra de progresso até a mais próxima, com "quase lá" quando aplicável.
3. Se não há **nenhuma** recompensa ativa → estado vazio neutro.

Mesma lógica adaptada para favoritos (`favoritos.js`, individual por recompensa) e um selo discreto "Disponível para resgate" no catálogo (`recompensas.js`).

---

## 15. MOTOR DE ENGAJAMENTO (BLOCO 3)

`src/services/engagement/` — infraestrutura para automações de comunicação. **Hoje opera 100% em modo simulação: nenhuma mensagem real é enviada por nenhum caminho do código.**

| Arquivo | Responsabilidade |
|---|---|
| `collectors.js` | Busca dados reais de 1 cliente OU em lote (`coletarContextoEmLote` — 4 queries fixas para N clientes, evita N+1) |
| `eventCatalog.js` | Catálogo de eventos com status `suportado`/`requer_decisao_comercial`/`requer_schema_novo` e as variáveis de template de cada um |
| `eventDetector.js` | Funções **puras**: dado o contexto, quais eventos se aplicam agora (só 2 detectores reais existem — ver seção 16) |
| `templates.js` | Substituição de `{variavel}` — variável desconhecida vira `{variavel:desconhecida}` visível (nunca falha silenciosa) |
| `automationRegistry.js` | Forma de uma automação (nome, evento, canal, template, `ativa`, `prioridade`, limites) + `escolherMaiorPrioridade()`. **2 exemplos cadastrados, ambos `ativa: false`** |
| `notificationHistory.js` | Persistência real em `notificacoes_historico` + regra de limite global (ver seção 17) |
| `notificationService.js` | `enviarBruto(canal, destinatario, mensagem)` — despacha para o provider certo, nunca grava histórico (isso é feito atomicamente por `notificationHistory`) |
| `providers/whatsappProvider.js`, `emailProvider.js` | **Stubs** — nunca fazem chamada de rede (ver seção 19) |
| `engine.js` | Orquestrador: `simular()` (admin, nunca escreve nada), `processarAutomacoes()` (caminho real de envio, existe mas nunca é chamado por nenhuma rota/cron), `avaliarParaSimulacaoDeLote()` (usado pelo scheduler, também nunca envia) |
| `scheduler.js` / `schedulerConfig.js` | Execução periódica em modo simulação — ver seção 18 |

**Rota administrativa:** `POST /admin/engajamento/simular` (admin only) — gera a mensagem que uma automação mandaria, sem enviar nada.

---

## 16. AUTOMAÇÕES E EVENTOS — O QUE É REAL HOJE

Esta seção existe especificamente para não confundir "documentado no catálogo" com "de fato implementado" — os dois **divergem** em um ponto, confirmado nesta auditoria.

| Evento | Detector de código existe? | Status no catálogo | Observação |
|---|---|---|---|
| `RECOMPENSA_DESBLOQUEADA` | ✅ Sim (`detectarEventosDeRecompensa`) | suportado | |
| `RECOMPENSA_QUASE_DESBLOQUEADA` | ✅ Sim | suportado | Regra de 80%, igual ao Bloco 1 |
| `FAVORITO_DISPONIVEL` | ✅ Sim | suportado | Mesmo detector, filtrado a favoritos |
| `FAVORITO_QUASE_DESBLOQUEADO` | ✅ Sim | suportado | |
| `RESGATE_PROXIMO_DE_EXPIRAR` | ✅ Sim (`detectarResgatesProximosDeExpirar`) | suportado | Só dispara se `horasParaAvisarExpiracao` for passado explicitamente — nunca um default inventado |
| `RESGATE_EXPIRADO` | ⚠️ **NÃO** — nenhuma função detecta isto | catálogo diz "suportado" | **Divergência encontrada nesta auditoria:** o catálogo descreve o evento como pronto, mas não existe hook nenhum ligado a `resgateExpiracao.service.js` que o dispare. Tratar como **não implementado** até ser conectado |
| `SALDO_LEMBRETE` | ❌ Não | requer_decisao_comercial | Dado bruto (saldo) já disponível; falta decidir a condição de disparo |
| `CLIENTE_INATIVO` | ❌ Não (mas `collectors.coletarUltimaMovimentacao` existe, **não é chamada por ninguém** hoje) | requer_decisao_comercial | Falta decidir quantos dias definem "inativo" |
| `CLIENTE_RETORNOU` | ❌ Não | requer_decisao_comercial | Mesma dependência de `CLIENTE_INATIVO` |
| `RESUMO_PERIODICO` | ❌ Não | requer_decisao_comercial | Falta decidir o período |
| `ANIVERSARIO` | ❌ Não | **requer_schema_novo** | Não existe coluna de data de nascimento em `usuarios` — nenhuma migration foi criada para isto |

**JÁ IMPLEMENTADO TECNICAMENTE:** os 5 primeiros eventos da tabela (detectores reais, testados).
**ATIVADO (enviando de verdade):** **nenhum** — `automationRegistry.listarAtivas()` sempre devolve lista vazia hoje.
**AINDA PENDENTE DE REGRA DE NEGÓCIO:** os 4 eventos "requer_decisao_comercial" + a correção do hook de `RESGATE_EXPIRADO` + qualquer valor real de prioridade/limite por automação (os exemplos cadastrados usam prioridades ilustrativas, não uma hierarquia de negócio decidida).

---

## 17. LIMITE GLOBAL DE FREQUÊNCIA (7 DIAS)

**Regra:** cada usuário pode receber no máximo **1 mensagem com `status='enviado'`** em qualquer janela de **7 dias corridos**, valendo para **todas** as automações/eventos — nunca um limite por automação isolada.

- **`status='falhou'` nunca conta** para o limite — só uma tentativa que realmente teria chegado ao destinatário bloqueia a próxima.
- **`status='bloqueado_por_limite'`** é gravado quando uma automação seria elegível mas o limite já está ativo — existe para auditoria ("isto teria disparado, mas foi barrado").
- **Persistência:** 100% em `notificacoes_historico` (Postgres) — nenhum estado em memória do processo. Sobrevive a restart/redeploy/múltiplas instâncias.
- **Concorrência:** `pg_advisory_xact_lock(usuario_id)` — mutex lógico por usuário, escopo de transação (libera sozinho no COMMIT/ROLLBACK). Duas automações concorrentes para o **mesmo** usuário são inteiramente serializadas: a segunda só obtém o lock depois que a primeira já commitou, e nesse momento já enxerga a linha `'enviado'` recém-gravada. Usuários diferentes nunca se bloqueiam entre si. **Testado com 2 tentativas simultâneas reais: exatamente 1 passou.**
- **Índice de apoio:** `(usuario_id, status, criado_em)` em `notificacoes_historico` — cobre exatamente a consulta do limite.
- Função real: `notificationHistory.tentarEnviarComLimiteGlobal({...})` — check + envio + gravação numa única transação sob lock. `verificarBloqueioGlobal()` é a versão só-leitura, usada pela simulação (nunca decide um envio de verdade).

---

## 18. SCHEDULER

`src/services/engagement/scheduler.js` + `schedulerConfig.js`.

- **Objetivo:** rodar o Motor de Engajamento periodicamente, em modo **simulação apenas** — nunca dispara envio real, mesmo que uma automação esteja `ativa: true` (a função que ele usa, `engine.avaliarParaSimulacaoDeLote`, não importa `notificationService`).
- **Ativação:** `ENGAGEMENT_SCHEDULER_ENABLED === "true"` (allow-list) — **default: desligado**. `server.js` sempre chama `iniciar()`, mas ele só age de verdade se habilitado.
- **Periodicidade:** `ENGAGEMENT_SCHEDULER_INTERVAL_MS`, default 60000ms (1 minuto) — **valor técnico de desenvolvimento, não uma frequência comercial decidida**.
- **Escopo de usuários:** só `tipo='cliente'` (`coletarClientesElegiveis`) — admin/funcionário **nunca** são processados.
- **Processamento em lote:** `coletarContextoEmLote(usuarioIds)` — 4 consultas **fixas** para todo o lote (saldo agregado por `GROUP BY`, recompensas ativas buscadas uma única vez, favoritos e resgates pendentes com `WHERE usuario_id = ANY($1)`) — não é 4×N.
- **Sobreposição:** flag `emExecucao` em memória — uma rodada nova encontrada com a flag ligada é **pulada** (log explícito), nunca enfileirada. Testado com 2 chamadas simultâneas: 1 rodou, 1 foi pulada.
- **Execução manual:** `POST /admin/engajamento/scheduler/executar` (admin only) — mesma função, mesma proteção contra sobreposição.
- **Logs:** só o `id` numérico do usuário (nunca nome/email), o nome da automação e o status — nenhum dado pessoal.
- **Encerramento:** `setInterval(...).unref()` — o timer sozinho nunca impede o processo de terminar.

---

## 19. PROVIDERS DE NOTIFICAÇÃO

| Provider | Real ou stub? | Faz chamada externa? | Variáveis futuras |
|---|---|---|---|
| `whatsappProvider.js` | **Stub** | Não, nunca | Nenhuma definida ainda — precisaria de um provedor real (Twilio, Meta Cloud API etc.) e suas credenciais |
| `emailProvider.js` (dentro do Motor de Engajamento) | **Stub** | Não, nunca | Poderia futuramente delegar para `src/services/emailService.js` (que É real, ver seção 9), unificando os dois sistemas de e-mail do projeto |

O sistema está preparado para conectar um provider real trocando só o corpo de `enviar()`, mantendo a mesma assinatura de retorno (`{sucesso, identificadorExterno, erro}`) — nenhuma mudança seria necessária em `eventDetector.js`, `automationRegistry.js`, `engine.js` ou na regra de 7 dias.

---

## 20. USUÁRIOS E PERMISSÕES

| Endpoint | Admin | Funcionário | Cliente |
|---|---|---|---|
| `POST /login`, `POST /usuarios`, `POST /login/esqueci-senha`, `POST /login/redefinir-senha` | ✅ pública | ✅ pública | ✅ pública |
| `GET /usuarios/me` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `GET /usuarios` | ✅ | 🚫 | 🚫 |
| `GET /usuarios/qr/:qr_token`, `GET /usuarios/buscar-cliente` | ✅ | ✅ | 🚫 |
| `PUT /usuarios/:id` | ✅ | 🚫 | 🚫 |
| `GET /admin/dashboard`, `GET /pontos/resumo` | ✅ | 🚫 | 🚫 |
| `POST /empresas`, `PUT /empresas/:id`, ativar/desativar, `/admin`, `/:id/detalhes` | ✅ | 🚫 | 🚫 |
| `GET /empresas` | ✅ | ✅ | ✅ (só ativas) |
| `POST /pontos/entrada` | ✅ | ✅ | 🚫 |
| `POST /pontos/saida` | ✅ | 🚫 | 🚫 |
| `GET /pontos/saldo`, `/historico` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `POST /recompensas`, `PUT`, `DELETE`, `/reativar`, `/admin` | ✅ | 🚫 | 🚫 |
| `GET /recompensas` | ✅ | ✅ | ✅ (só ativas) |
| `PATCH /recompensas/:id/destacar`, `/remover-destaque` | ✅ | ✅ | 🚫 |
| `POST /resgates` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `GET /resgates` (todos) | ✅ | 🚫 | 🚫 |
| `GET /resgates/meus` | ✅ 👤 | ✅ 👤 | ✅ 👤 |
| `POST /resgates/validar` | ✅ | ✅ | 🚫 |
| `GET/POST/DELETE /favoritos*` | 🚫 | 🚫 | ✅ 👤 |
| `POST /admin/engajamento/*` | ✅ | 🚫 | 🚫 |

`👤` = só o próprio recurso, via `req.usuario.id`.

---

## 21. API COMPLETA

**39 endpoints confirmados** (varredura de `router.<método>` em todos os arquivos de `src/routes/` nesta auditoria — inclui os 2 de recuperação de senha, ainda não publicados).

| Domínio | Rotas |
|---|---|
| Auth (3) | `POST /login`, `POST /login/esqueci-senha`, `POST /login/redefinir-senha` |
| Usuários (6) | `POST /usuarios`, `GET /usuarios/me`, `GET /usuarios`, `GET /usuarios/qr/:qr_token`, `GET /usuarios/buscar-cliente`, `PUT /usuarios/:id` |
| Pontos (5) | `POST /pontos/entrada`, `POST /pontos/saida`, `GET /pontos/saldo`, `GET /pontos/historico`, `GET /pontos/resumo` |
| Recompensas (8) | `POST /recompensas`, `GET /recompensas`, `GET /recompensas/admin`, `PUT /recompensas/:id`, `DELETE /recompensas/:id`, `PATCH /recompensas/:id/reativar`, `PATCH /recompensas/:id/destacar`, `PATCH /recompensas/:id/remover-destaque` |
| Resgates (4) | `POST /resgates`, `GET /resgates`, `GET /resgates/meus`, `POST /resgates/validar` |
| Admin (1) | `GET /admin/dashboard` |
| Empresas (7) | `POST /empresas`, `GET /empresas`, `GET /empresas/admin`, `GET /empresas/:id/detalhes`, `PUT /empresas/:id`, `PATCH /empresas/:id/ativar`, `PATCH /empresas/:id/desativar` |
| Favoritos (3) | `GET /favoritos`, `POST /favoritos/:id`, `DELETE /favoritos/:id` |
| Engajamento (2) | `POST /admin/engajamento/simular`, `POST /admin/engajamento/scheduler/executar` |

---

## 22. FRONTEND

**20 páginas HTML** (verificado por listagem de diretório):

| Página | Público |
|---|---|
| `index.html` | Login (CPF + senha, link "Esqueci minha senha") |
| `cadastro.html` | Cadastro público (CPF obrigatório) |
| `esqueci-senha.html` / `redefinir-senha.html` | Recuperação de senha (não publicadas ainda) |
| `dashboard.html` | Início do cliente — saldo + progresso (Bloco 1) + destaque + atividade recente |
| `recompensas.html` | Catálogo + resgate |
| `favoritos.html` | Favoritos com progresso individual |
| `meus-resgates.html`, `historico.html`, `perfil.html` | Cliente |
| `funcionario.html` | Atender cliente, validar resgate, destaque |
| `admin.html`, `admin-clientes.html`, `admin-empresas.html`, `admin-recompensas.html`, `admin-resgates.html`, `admin-validar.html`, `admin-identificar-cliente.html` | Área administrativa |
| `termos.html`, `privacidade.html` | Legal |

`frontend/assets/js/ui.js` centraliza guardas de página (`protegerPagina*`), formatação e o modal genérico — a proteção ali é só UX, a autorização real é sempre o backend.

---

## 23. SISTEMA DE MIGRATIONS

`scripts/migrate.js` — orquestrador central (não existia nas versões antigas deste documento).

### Por que existe
Pelo menos 3 das migrations abaixo fazem `ADD CONSTRAINT` sem `IF NOT EXISTS` — rodar o arquivo isolado duas vezes falharia com erro de constraint duplicada. O orquestrador garante que cada uma rode **exatamente uma vez**.

### Como funciona
1. Cria `migration_history` automaticamente (`CREATE TABLE IF NOT EXISTS`).
2. Para cada migration de uma **lista ordenada explícita** (não a ordem alfabética dos arquivos — não bate com a ordem de dependência real):
   - já tem linha em `migration_history`? → pula.
   - sem linha, mas o **schema já mostra o efeito dela** (reconciliação — ex: a coluna que ela cria já existe)? → registra sem executar de novo. É o que permite rodar isto pela primeira vez num banco que já tem tudo aplicado manualmente, sem estourar os erros de constraint acima.
   - sem linha e sem o efeito no schema? → executa como **processo filho isolado** (`node scripts/<arquivo>.js`, herdando o mesmo ambiente — é assim que a mesma lista funciona local e no Render).
3. Confirma o efeito esperado no schema depois de rodar, só então registra.
4. **Qualquer erro para tudo imediatamente** — nada seguinte roda, nada é registrado como aplicado.

**Diferença entre "aplicada" e "registrada":** uma migration pode ter sido aplicada manualmente há muito tempo (antes deste sistema existir) e só ser **registrada** agora, por reconciliação, sem nunca ter sido *executada* pelo orquestrador.

### As 12 migrations existentes (ordem real de execução)
| # | Arquivo | O que faz |
|---|---|---|
| 1 | `migrate-empresas.js` | Cria tabela `empresas` + `empresa_id` em recompensas/movimentações/resgates |
| 2 | `migrate-movimentacoes-origem.js` | Coluna `origem` (hoje legada) |
| 3 | `migrate-recompensas-imagem.js` | Coluna `imagem` |
| 4 | `migrate-resgates-fluxo-imediato.js` | Coluna `codigo` + novo modelo de `status` |
| 5 | `migrate-usuarios-qr-token.js` | Coluna `qr_token` |
| 6 | `migrate-recompensas-destaque.js` | Coluna `destacada` |
| 7 | `migrate-recompensas-favoritas.js` | Tabela `recompensas_favoritas` |
| 8 | `migrate-usuarios-cpf.js` | Coluna `cpf` (nullable, UNIQUE) |
| 9 | `migrate-engajamento-historico.js` | Tabela `notificacoes_historico` |
| 10 | `migrate-password-reset-tokens.js` | Tabela `password_reset_tokens` — **aplicada só localmente, não commitada** |
| 11 | `migrate-tenants.js` | Tabela `tenants` + seed do Tenant 1 (Movement) — **fundação multi-tenant, etapa 1** (ver nota abaixo) — aplicada só localmente, não commitada |
| 12 | `migrate-admins-plataforma.js` | Tabela `admins_plataforma` (vazia, sem login/JWT/rotas ainda) — mesma etapa — aplicada só localmente, não commitada |

Também existe `scripts/migrate-engajamento-PROPOSTA-nao-executar.js` — **documentação executável, não uma migration real** (sem função `migrar()`, nunca registrada em `migrate.js`): descreve 2 tabelas ainda propostas (`preferencias_notificacao`, `automacoes`), não criadas.

**Como adicionar uma nova migration:** criar o arquivo seguindo o padrão (`CREATE ... IF NOT EXISTS`, transação, sem inventar dado), adicionar 1 entrada em `MIGRATIONS` (`scripts/migrate.js`) com uma checagem `jaAplicada` que verifique o efeito principal dela — nunca editar uma migration antiga já registrada.

**Comando:** `npm run migrate` (local); mesmo comando funcionaria contra o Render apontando as variáveis `DB_*` para lá — nunca copia dado, só aplica schema.

### Fundação multi-tenant — Etapa 1 (`migrate-tenants.js` / `migrate-admins-plataforma.js`)

Primeiro passo de uma migração planejada (não iniciada além disto) do Movement para uma arquitetura SaaS multi-tenant. Nesta etapa, só a fundação passiva:

- **`tenants`** (`id, nome, slug UNIQUE, plano, status CHECK ativo/inativo, criado_em`) — criada com exatamente 1 linha: o próprio Movement (`slug='movement'`, `status='ativo'`), representando o sistema atual como "Tenant 1", sem mover nem duplicar nenhum dado existente.
- **`admins_plataforma`** (`id, nome, email UNIQUE, senha, criado_em`) — representa futuros administradores da Maple Tech (dona da plataforma), deliberadamente **fora** do modelo de tenant (nunca terá `tenant_id`, nunca é a mesma coisa que `usuarios`). Criada **vazia** — nenhum admin real foi cadastrado nesta etapa.

**O que NÃO mudou (de propósito, etapas futuras separadas):** nenhuma tabela de domínio (`usuarios`, `empresas`, `recompensas`, `movimentacoes_pontos`, `resgates`, `recompensas_favoritas`, `notificacoes_historico`, `password_reset_tokens`) ganhou `tenant_id` ainda; login, JWT (`{id, tipo}`, sem `tenant_id`), controllers, rotas e frontend continuam idênticos. `tenants`/`admins_plataforma` hoje não são lidas por nenhum código da aplicação — só existem no schema.

> Nota: a Etapa 2 (não documentada nesta seção ainda) já adicionou `tenant_id` às 8 tabelas de domínio citadas acima, com backfill para `tenant_id=1` (Movement) — ver `scripts/migrate-tenant-id-dominio.js` e `scripts/migrate-tenant-id-default-temporario.js`. Login, JWT e controllers continuam sem uso desse campo.

### Fundação multi-tenant — Etapa 3A (`src/services/tenantResolver.js`)

Camada centralizada de **resolução de tenant** — puramente infraestrutural, ainda não consumida por nenhum controller de negócio.

- **`resolverTenant(req)`** (`src/services/tenantResolver.js`): dado um `req`, extrai um `tenantSlug` explícito (header `X-Tenant-Slug`, senão query `?tenantSlug=`) e busca a linha correspondente em `tenants` via query parametrizada. Sem slug explícito, usa o fallback fixo `'movement'` — hoje o único tenant real. O slug nunca é confiado além de filtro de busca: um valor inexistente ou arbitrário (incluindo tentativas de injeção) sempre resulta em `{ erro: "NAO_ENCONTRADO" }`, nunca em autorização implícita. Esta função **não julga** se o tenant está ativo.
- **`resolverTenantMiddleware`** (`src/middlewares/resolverTenantMiddleware.js`): chama `resolverTenant`, preenche `req.tenantId`/`req.tenant`, ou responde `404` se não encontrado.
- **`exigirTenantAtivoMiddleware`** (`src/middlewares/exigirTenantAtivoMiddleware.js`): middleware **separado** (responsabilidade única) que bloqueia com `403` se `req.tenant.status !== 'ativo'` — roda sempre depois do middleware de resolução.
- **Integração de prova de conceito:** `GET /diagnostico/tenant` (`src/routes/tenantDiagnostico.routes.js`, montada em `server.js`), encadeando os dois middlewares e retornando `{ tenantId, tenant }`. Rota explicitamente temporária/diagnóstica — candidata a remoção quando rotas de negócio reais passarem a consumir `req.tenantId`.

**O que NÃO mudou:** nenhum controller, rota de negócio, JWT (continua `{id, tipo}`) ou query existente foi alterado; login e todas as rotas protegidas testadas (saldo, recompensas, admin, funcionário) continuam com o mesmo comportamento de antes desta etapa.

### Fundação multi-tenant — Etapa 3B (autenticação tenant-aware)

Login, cadastro e recuperação de senha passam a **conhecer** o tenant; nenhum controller de negócio (points, reward, redemption, empresa, favorito, admin, engagement) foi alterado — o isolamento de dados dessas áreas continua pendente de uma etapa futura.

- **JWT agora carrega `tenant_id`:** `{ id, tipo, tenant_id }` (antes: `{ id, tipo }`). O `tenant_id` gravado é sempre lido da linha do usuário encontrada no banco, nunca ecoado de um valor de entrada.
- **`POST /login`** (`auth.routes.js`/`auth.controller.js`): `resolverTenantMiddleware` + `exigirTenantAtivoMiddleware` rodam antes do controller; a busca do usuário passa a filtrar `WHERE tenant_id = $tenant AND (cpf = $cpf OU email = $identificadorLegado)`. Sem slug explícito, cai no fallback `'movement'` — o frontend/fluxo atual não precisa mandar nada novo para continuar funcionando.
- **`POST /usuarios`** (cadastro, `user.routes.js`/`user.controller.js`): rota pública, então o tenant vem do mesmo mecanismo de slug/fallback (nunca do JWT, que ainda não existe nesse momento, nem de um campo do body). `tenant_id` é gravado explicitamente no INSERT a partir do contexto resolvido, sem depender do `DEFAULT` temporário. Também corrigido nesta etapa: os nomes de constraint verificados para erro 409 (`usuarios_tenant_email_key`/`usuarios_tenant_cpf_key`) estavam desatualizados desde a Etapa 2 (renomeados na migration, nunca ajustados no controller) — duplicidade de e-mail/CPF caía num 500 genérico em vez do 409 esperado; corrigido junto por estar na mesma função.
- **`POST /login/esqueci-senha`**: mesmo mecanismo de resolução de tenant; a busca do usuário por e-mail agora filtra também por `tenant_id` (e-mail só é único por tenant desde a Etapa 2) e o token criado em `password_reset_tokens.tenant_id` grava o tenant real do usuário. **`POST /login/redefinir-senha`** não precisa de resolução de tenant: o token de 256 bits já identifica um único usuário/tenant por si só.
- **`authMiddleware`** (`src/middlewares/authMiddleware.js`) passa a exigir `tenant_id` numérico no payload e, a cada requisição autenticada, revalida esse `tenant_id` contra a tabela `tenants` (existe e está `ativo`) — um SELECT por PK extra em toda rota autenticada, decisão deliberada para que desativar um tenant bloqueie sessões já emitidas imediatamente, sem esperar o token expirar. Token sem `tenant_id` (formato antigo) é **rejeitado** com 401 — não há fallback assumido, forçando um novo login; como o token já expira em 1h, o impacto é limitado a uma única reautenticação por usuário logo após o deploy.
- **`src/services/tenantResolver.js`** ganhou `buscarTenantPorId(tenantId)`, usado só por `authMiddleware` para essa revalidação (distinto de `resolverTenant`, que busca por slug vindo de fora).

**O que NÃO mudou (de propósito):** nenhum controller de negócio filtra dados por `tenant_id` ainda — só a camada de identidade (quem está logado, em qual tenant) ficou correta; o isolamento de dados em si é uma etapa futura separada. O `DEFAULT` temporário em `tenant_id` (Etapa 2) continua existindo para escritas que ainda não têm contexto de tenant disponível.

### Fundação multi-tenant — Etapa 3C-1 (isolamento do domínio de USUÁRIOS)

Primeiro domínio de negócio a ficar isolado por tenant — todas as operações de `usuarios` em `user.controller.js` agora filtram por `tenant_id`. Domínios de recompensas, pontos, resgates, favoritos, empresas, engagement e o dashboard administrativo **continuam globais** (etapas futuras separadas).

- **Regra única:** em toda operação autenticada, o tenant vem exclusivamente de `req.usuario.tenant_id` (do JWT, validado por `authMiddleware` — Etapa 3B) — nunca de `body`/`query`/`params`. Testado explicitamente: valores de `tenant_id` forjados em body/query nas rotas de usuários são ignorados, sem exceção.
- **`GET /usuarios`** (listar, admin): antes sem nenhum filtro (retornava usuários de todos os tenants); agora `WHERE u.tenant_id = req.usuario.tenant_id`. Continua trazendo todos os `tipo`, comportamento preservado.
- **`GET /usuarios/buscar-cliente`** (admin/funcionário): mesmo filtro adicionado — sem ele, um funcionário conseguia localizar (e lançar pontos para) um cliente de outro tenant sabendo só nome/e-mail.
- **`GET /usuarios/me`**: passa a filtrar `WHERE id = $1 AND tenant_id = $2`, não confiando só no `id` do token.
- **`PUT /usuarios/:id`** (admin): passa a filtrar `WHERE id = $1 AND tenant_id = $2` — um id de outro tenant não bate com nenhuma linha e cai no mesmo `404` genérico de "não existe", nunca revelando que o id pertence a outro tenant. Também corrigidos nomes de constraint desatualizados desde a Etapa 2 (`usuarios_tenant_cpf_key`/`usuarios_tenant_email_key`), mesmo bug já corrigido em `cadastrar()` na Etapa 3B.
- **`GET /usuarios/qr/:qr_token`**: `qr_token` continua **globalmente único** de propósito (no momento do scan não se sabe a priori o tenant). Estratégia: busca global por `qr_token`, e só DEPOIS de encontrar a linha compara `usuario.tenant_id` com `req.usuario.tenant_id` — se não bater, resposta idêntica ao "QR não encontrado" (nunca revela que o QR existe em outro tenant), e a consulta de saldo só roda depois dessa comparação.
- **Índices:** nenhum novo índice foi criado — os únicos criados na Etapa 2 (`usuarios_tenant_email_key`/`usuarios_tenant_cpf_key`, ambos com `tenant_id` como coluna líder) já servem de prefixo utilizável pelo planner do Postgres para os filtros `WHERE tenant_id = $1` adicionados nesta etapa; volume de dados atual (poucas dezenas de linhas) não justificaria um índice dedicado de qualquer forma.

**O que NÃO mudou (de propósito):** dashboard administrativo (`admin.controller.js`) continua agregando dados de todos os tenants — fora do escopo desta etapa, sinalizado como pendente para uma etapa futura.

### Fundação multi-tenant — Etapa 3C-2 (isolamento do domínio de EMPRESAS)

Segundo domínio de negócio isolado por tenant — todas as operações de `empresas` em `empresa.controller.js` agora filtram por `tenant_id`. Recompensas, pontos, resgates, favoritos, engagement e dashboard administrativo **continuam globais** (etapas futuras separadas). Nenhuma rota de `empresas` é pública — todas já passavam por `authMiddleware`, então nenhuma rota precisou de alteração.

- **Mesma regra da Etapa 3C-1:** tenant vem exclusivamente de `req.usuario.tenant_id`, nunca de `body`/`query`/`params`. Testado: `tenant_id` forjado no body de `POST /empresas` e `PUT /empresas/:id` é ignorado sem exceção.
- **`GET /empresas`** e **`GET /empresas/admin`**: ganharam `WHERE tenant_id = req.usuario.tenant_id` (antes, sem filtro nenhum — qualquer usuário autenticado via qualquer tenant via empresas de todos os tenants).
- **`POST /empresas`**: `tenant_id` gravado explicitamente a partir do contexto autenticado, sem depender do `DEFAULT` temporário (Etapa 2).
- **`PUT /empresas/:id`, `PATCH /empresas/:id/ativar`, `PATCH /empresas/:id/desativar`**: todas passaram a filtrar `WHERE id = $1 AND tenant_id = $2` — um id de empresa de outro tenant cai no mesmo `404` genérico, nunca revelando a existência em outro tenant.
- **`GET /empresas/:id/detalhes`**: a busca da empresa em si agora exige `tenant_id`; as sub-consultas por `empresa_id` em `recompensas`/`resgates`/`movimentacoes_pontos` continuam **sem** filtro de tenant de propósito (esses domínios ainda não foram isolados).
- **`UNIQUE(tenant_id, slug)`** (Etapa 2) validada na prática: o mesmo slug em dois tenants diferentes agora é permitido; o mesmo slug duas vezes no mesmo tenant continua rejeitado com `409`.
- **`empresa_id` ≠ `tenant_id`:** documentado explicitamente em `src/utils/empresas.js` — `empresaAtivaExiste()` (usada por pontos/recompensas para validar um `empresa_id` recebido do cliente) ainda **não** verifica `tenant_id`, de propósito: seus chamadores (pontos, recompensas) ainda não foram isolados. `empresa_id` identifica uma empresa, mas não substitui a checagem de tenant — pendente para quando esses domínios receberem sua própria etapa.
- **Índices:** nenhum criado — `empresas_tenant_slug_key (tenant_id, slug)` já cobre por prefixo os filtros `WHERE tenant_id = $1` desta etapa.

### Governança de identidade do tenant — mover configuração para a Maple Tech

Mudança de arquitetura: a configuração de identidade/contato do tenant (nome comercial, cor principal, telefone, WhatsApp) deixou de ser uma tela do próprio admin do tenant e passou a ser administrada **exclusivamente pela plataforma Maple Tech**.

- **Removido:** `PATCH /tenant/config` (tenant.routes.js), a tela `admin-configuracoes.html` e seu script, o middleware `validateTenantConfigUpdate.js`, e o item de navegação "Configurações" de todo o painel do tenant. `GET /tenant/config` continua existindo sem nenhuma mudança — é só leitura pública (nome/slug/logo/cor/telefone/whatsapp), usada por toda página do tenant via `tenant.js` para aplicar a própria identidade.
- **Criado:** `PATCH /plataforma/tenants/:id` (plataforma.routes.js + `plataformaTenant.controller.js:atualizarConfiguracao`), autenticado exclusivamente por `authPlataformaMiddleware` + `exigirEscopoPlataforma` — nunca por um JWT de tenant. Whitelist explícita (`validatePlataformaTenantEdit.js`): `nome`, `corPrimaria`, `telefone`, `whatsapp`, `plano`, `status`. `tenant_id`/`id` nunca vêm do body (o tenant afetado é sempre o `:id` da URL); `plano` validado contra o mesmo catálogo fechado de sempre (`essencial`/`profissional`/`premium`); `status` contra a mesma lista fechada de sempre (`ativo`/`inativo`). Coexiste com `PATCH /plataforma/tenants/:id/status` (ação rápida dedicada de ativar/desativar) sem conflito — os dois escrevem a mesma coluna.
- **`logo_url` — decisão explícita, NÃO é uma remoção:** a coluna continua existindo em `tenants` sem nenhuma migration (Movement continua usando `/assets/img/logo.png`, e `GET /tenant/config`/`GET /plataforma/tenants/:id` continuam devolvendo o valor, só leitura). Ela só deixou de ser **gravável**: nenhuma rota, nem a do tenant nem a da plataforma, aceita mais essa chave. Não há upload nem nenhuma solução substituta nesta fase — decisão de produto, não lacuna técnica. Uma migration de remoção de coluna só seria cogitada numa etapa futura, se e quando ficar claro que nenhum tenant precisará dela.
- **Frontend Maple:** `plataforma-tenant-detalhe.html` ganhou a seção "Editar tenant" (nome/cor/telefone/whatsapp/plano/status) — logo nunca aparece nesse formulário. Usa sempre a identidade visual da própria Maple Tech (`plataforma.css`); nunca a cor do tenant sendo editado (`tenant.js` não é carregado em nenhuma página de plataforma).

---

## 24. AMBIENTE LOCAL × RENDER

### Ambiente local
- Banco: PostgreSQL local, `sistema_pontos`, porta 5432.
- `.env` com `NODE_ENV=development` (relaxa rate limits) e `EMAIL_MOCK=true` (nunca envia e-mail de verdade).
- Migrations aplicadas via `npm run migrate`.

### Produção / Render (VERIFICADO nesta auditoria via acesso direto ao Postgres gerenciado + requisições HTTP à URL pública — não via painel do Render)
| Item | Valor |
|---|---|
| URL pública | `https://sistema-pontos-0i0k.onrender.com` — **online** (200 na raiz) |
| Commit publicado | **INFERIDO**: `4d07fd4` ou equivalente — `origin/main` está nesse commit, e uma checagem HTTP confirma que as rotas do Motor de Engajamento/scheduler (introduzidas nesse commit) **existem** em produção (`401`, não `404`), enquanto as rotas de recuperação de senha (ainda não commitadas) **não existem** (`404`). Não foi possível confirmar o SHA exato via painel/API do Render nesta auditoria |
| Branch observada | `main` (mesma do GitHub) |
| Build/start command | **PENDENTE DE VERIFICAÇÃO** — sem `render.yaml` no repositório; configuração feita fora do controle de versão. Padrão assumido por convenção Node no Render: build `npm install`, start `npm start` (`node server.js`) — não confirmado no painel |
| Migrations no deploy | **Nunca automáticas** — precisam ser rodadas manualmente contra produção. Confirmado que isso já foi feito recentemente: `migration_history` no Render tem a migration de `notificacoes_historico` registrada (rodada em 2026-09-12, depois do deploy do commit correspondente) |
| Banco Postgres | Gerenciado pelo próprio Render, credenciais completamente diferentes do local |
| `ENGAGEMENT_SCHEDULER_ENABLED` em produção | **PENDENTE DE VERIFICAÇÃO** — não há acesso ao painel de variáveis do Render nesta auditoria. Comportamento padrão do código é desligado se a variável não existir |
| Variáveis esperadas | Mesma lista da seção 6 |

### Schema de produção — verificado nesta auditoria
8 tabelas (não tem `password_reset_tokens` ainda). `usuarios.cpf` **existe** em produção (migration já aplicada lá). `migration_history` tem 9 entradas (falta só a #10, local).

### Dados — produção tem atividade real, diferente do local
| Tabela | Local | Render |
|---|---|---|
| usuarios | 3 | **4** (inclui `id=84 "conta teste"`, uma conta com atividade real de resgate — preservada deliberadamente numa auditoria anterior por não haver certeza se é um cliente real) |
| empresas | 3 | 3 |
| recompensas | 16 | **14** (local tem 2 recompensas de teste do Playwright que nunca foram levadas a produção) |
| resgates | 8 | **10** |
| movimentacoes_pontos | 22 | 22 |
| recompensas_favoritas | 0 | **2** (favoritos reais de uma conta de produção) |
| notificacoes_historico | 0 | 0 |

### Divergências conhecidas — intencionais, não bugs
- **IDs de empresa não são intercambiáveis:** "Vita Açaí" é `id=24` local e `id=22` no Render (mesma empresa real, criada independentemente em cada ambiente). Nunca copiar `empresa_id` cru entre bancos.
- **IDs de recompensa do catálogo "real" também divergem** entre ambientes (criadas uma vez em cada lugar via o admin) — mapear por nome/conteúdo, nunca por ID, ao comparar/sincronizar.
- **Curadoria de `destacada` diverge** entre local e produção — decisão de conteúdo, não erro.
- **`plano ballet` (recompensa antiga)**: `ativo=false` local, `ativo=true` produção — divergência de estado já identificada e deliberadamente não sincronizada (decisão de negócio pendente, não técnica).

### Cuidados para não sobrescrever produção
Nunca presumir que os dois bancos são cópias um do outro — eles compartilham uma origem comum (registros antigos com IDs e timestamps idênticos) e divergiram organicamente desde então. Qualquer sincronização futura precisa comparar por conteúdo (nome, e-mail, slug), nunca por ID, e sempre preservar as 3 contas de exceção + qualquer conta com atividade real (movimentações/resgates/favoritos), local ou remota.

---

## 25. BACKUPS

Estratégia: `pg_dump` manual antes de qualquer operação de risco (migration em produção, limpeza de dados de teste) — nunca automática, nenhuma rotina agendada confirmada. Arquivos salvos na raiz do projeto, **nunca commitados** (aparecem como `??` no `git status`; não estão listados no `.gitignore` por nome, mas nunca foram adicionados ao índice do Git).

**Backups existentes no diretório local nesta auditoria** (arquivos, não commitados):
- `backup-sistema-pontos.sql` (mais antigo, da fase inicial do projeto)
- `backup-sistema-pontos-pre-cpf-*.sql` (antes da migration de CPF local)
- `backup-render-pre-sync-*.sql` (antes de uma sincronização de dados de teste em produção)

**Cuidado permanente:** nunca sobrescrever um backup existente sem antes conferir o conteúdo dele. **Restauração:** `psql -U postgres -d sistema_pontos -f arquivo.sql` (ou criar um banco novo antes, se for do zero).

---

## 26. GIT

- **Branch principal:** `main`, único branch usado.
- **Remoto:** `origin` = `https://github.com/MarcosViniciusUC/sistema-pontos.git`.
- **Estado nesta auditoria:** `main` local idêntico a `origin/main`, ambos em `4d07fd4`. Working tree com a funcionalidade de recuperação de senha inteira **não commitada** (ver seção 9).
- **Relação com Render:** Render observa `main` no GitHub (comportamento **inferido** pela evidência de código deployado corresponder a commits que já estavam em `origin/main`, nunca confirmado via painel) — deploy automático a cada push, migrations sempre manuais depois.
- **Fluxo de commits observado:** commits diretos em `main`, sem PRs — mensagens descritivas em português, um commit por funcionalidade/etapa.

### Últimos 14 commits (`git log --oneline`)
```
4d07fd4 Adiciona scheduler de engajamento em modo simulacao
0f42d1b Adiciona motor de engajamento e limite de notificacoes
4e5d8c1 Adiciona controle de migrations
b9153a0 Adiciona progresso de fidelizacao as recompensas
d45fa04 Adota CPF como identificador de login
b2774ac Aprimora seguranca, UX e documentacao
ec7a2ca Adiciona favoritos, destaques e melhorias no sistema
5cfb015 Adiciona ajuste e recorte de fotos nas recompensas
1e7f52f Adiciona perfil do cliente com QR Code e resumo da conta
5319f1f Atualiza sistema e adiciona leitura de QR no funcionario
4717802 feat: primeira versão do sistema de pontos
761e488 feat: estrutura inicial da API e hardening de seguranca
a320db3 refactor: separar autenticação em controller e rota
dc451b7 chore: commit inicial do projeto
```

---

## 27. TESTES

**Não há suíte de teste automatizada permanente no repositório** (`package.json`: `"test": "echo \"Error...\" && exit 1"`; sem pasta `test/`). Todo teste até hoje foi feito por scripts avulsos (Node + Playwright), executados manualmente contra ambiente real e descartados depois — não commitados.

### TESTES EXECUTADOS E APROVADOS (ao longo do desenvolvimento, por etapa)
| Área | Cobertura |
|---|---|
| Autenticação | Login CPF válido/inválido, identificadores legados, timing attack (medido: ~1-4ms de diferença, dentro do ruído), rate limiting, cadastro com CPF |
| Recuperação de senha | Fluxo completo (solicitar → e-mail mock → token → redefinir → login), token expirado/inexistente/reusado, concorrência no mesmo token, rate limit, ausência de dados sensíveis em log |
| Banco/migrations | Idempotência do orquestrador (2ª execução não repete nada), reconciliação, falha interrompe a cadeia |
| Progresso (Bloco 1) | Saldo zero/parcial/exato/acima, várias recompensas, nenhuma ativa, favoritos em todos os estados |
| Motor de engajamento | Detecção de eventos, prioridade entre automações concorrentes, simulação, limite global de 7 dias (incluindo concorrência real com 2 chamadas simultâneas) |
| Scheduler | Habilitado/desabilitado, execução manual, sobreposição impedida, escopo (só clientes), encerramento limpo do processo |
| Resgate | Criação, validação, expiração automática, regressão completa do fluxo |
| Responsividade | 390×844, 430×932, 768×1024, 1440×900 em todas as telas relevantes, via Playwright |
| Console | Verificação de zero erros de console nas telas testadas |

### TESTES AINDA PENDENTES
- Qualquer teste automatizado permanente (CI).
- Testes de carga/volume (o projeto opera hoje em escala pequena, sem índices de performance adicionais em `movimentacoes_pontos`/`resgates`).
- Teste de envio SMTP real (só testado em modo mock).
- Teste do scheduler com uma automação realmente ativa em ambiente de produção.

---

## 28. SEGURANÇA

**Proteções confirmadas no código:**
- bcrypt (10 rounds) para toda senha.
- JWT (`{id, tipo}`, 1h, sem dado pessoal no payload).
- Rate limiting em 3 pontos: login, esqueci-senha, global da API (300/15min).
- Helmet com CSP restrita (só os 2 CDNs realmente usados).
- CORS restrito a `CORS_ORIGIN`.
- Todo SQL parametrizado (`$1, $2...`), nunca concatenação.
- Autorização por papel em toda rota sensível (`roleMiddleware`), sempre depois de `authMiddleware`.
- Proteção contra enumeração: login (timing) e recuperação de senha (resposta idêntica + envio assíncrono).
- Tokens de recuperação de senha: aleatórios, hash SHA-256 no banco, uso único, expiração curta.
- Segredos sempre por variável de ambiente — varredura nesta auditoria não encontrou nenhuma credencial hardcoded em `src/`.
- Concorrência protegida com `FOR UPDATE`/`pg_advisory_xact_lock` em toda operação financeira ou de uso único (pontos, resgates, tokens de recuperação, limite de notificação).

**Riscos/pontos de melhoria já identificados (V1.1, não bloqueantes):**
- JWT em `localStorage`, não em cookie `httpOnly` (aceito como trade-off para V1).
- Sem índices adicionais de performance em tabelas que crescem (`movimentacoes_pontos`, `resgates`).
- Sem revogação de JWT ao trocar senha (decisão documentada, não uma lacuna descoberta agora).
- Recuperação de senha ainda não publicada — enquanto isso, não há caminho de autoatendimento para senha esquecida em produção.

---

## 29. LGPD / PRIVACIDADE

**Dados pessoais coletados:** nome, e-mail, CPF (obrigatório para novos cadastros), telefone (opcional), senha (hash). Finalidade aparente: identificação para o programa de fidelidade (CPF/login), contato e recuperação de acesso (e-mail), atendimento (telefone).

**Páginas legais existentes:** `termos.html` (Termos de Uso), `privacidade.html` (Política de Privacidade) — conteúdo não auditado linha a linha nesta revisão.

**Pontos a revisar antes de qualquer lançamento comercial real (linguagem deliberadamente cautelosa — isto não é uma avaliação jurídica):**
- Confirmar que a Política de Privacidade menciona explicitamente a coleta de CPF e sua finalidade — **necessita validação jurídica**.
- Base legal para tratamento de CPF sob a LGPD — **necessita validação jurídica**.
- Direito de exclusão/portabilidade de dados — hoje o sistema não tem nenhum mecanismo de "esquecimento" (usuários nunca são hard-deletados pela aplicação) — **ponto a revisar**.
- Retenção de dados de tokens de recuperação de senha (já expiram e ficam marcados como usados, mas nunca são purgados da tabela) — **ponto a revisar**.

Este documento **não afirma conformidade legal** — apenas descreve a **estrutura técnica disponível**.

---

## 30. O QUE ESTÁ PRONTO

**PRONTO / FUNCIONAL** (tecnicamente funcionando, verificado):
- Cadastro, login por CPF, contas legadas, JWT, 3 papéis.
- Pontos (entrada/saída/saldo/histórico), com todas as regras de concorrência.
- Empresas parceiras (CRUD + ativação).
- Recompensas (CRUD + imagem + destaque + soft-delete).
- Resgate completo (código, validação, expiração automática de 5h).
- Favoritos individuais.
- Progresso de fidelização no dashboard/catálogo/favoritos (Bloco 1).
- Motor de engajamento em modo simulação, com 5 eventos realmente detectáveis, limite global de frequência com concorrência segura, scheduler com proteção contra sobreposição.
- Sistema de migrations com rastreamento e reconciliação.
- Recuperação de senha por e-mail — **completa, mas só local** (ver seção 9).

---

## 31. O QUE AINDA FALTA

**PENDENTE TÉCNICO**
- Publicar (commit/push/deploy) a recuperação de senha.
- Conectar `RESGATE_EXPIRADO` a um detector real (hoje é só catálogo).
- Índices de performance em `movimentacoes_pontos`/`resgates` para escala maior.
- Suíte de teste automatizada permanente (CI).

**PENDENTE DE NEGÓCIO**
- Regras de disparo de `SALDO_LEMBRETE`, `CLIENTE_INATIVO`, `CLIENTE_RETORNOU`, `RESUMO_PERIODICO` (quantos dias, qual frequência).
- Qual automação real ativar primeiro, com qual texto/canal/prioridade definitivos.
- Resolver a divergência intencional de `plano ballet`/curadoria de destaque entre local e produção.
- Definição de metas/regras comerciais de qualquer "Bloco 2" de fidelização (explicitamente não implementado — ver histórico de decisão de parar antes de inventar regra comercial).

**PENDENTE DE INFRAESTRUTURA**
- SMTP de produção real (Gmail ou outro) configurado no Render.
- `render.yaml` ou documentação formal do build/start command (hoje fora do controle de versão).
- Coluna de data de nascimento (para `ANIVERSARIO`), se decidido implementar.

**PENDENTE DE OPERAÇÃO**
- Revisão jurídica de Termos/Privacidade quanto a CPF/LGPD.
- Confirmação/classificação da conta `id=84` em produção (cliente real ou teste).
- Treinamento operacional de funcionários para o fluxo de validação de resgate.

**PENDENTE DE TERCEIROS**
- Integração real com WhatsApp (nenhum provider conectado — stub).
- Domínio próprio (hoje só a URL padrão do Render).

---

## 32. CHECKLIST PARA LANÇAMENTO REAL

- [ ] Publicar recuperação de senha (commit + push + deploy + SMTP real).
- [ ] Confirmar/gerar CPF real para as 3 contas de exceção, se algum dia migrarem para login por CPF (hoje continuam de propósito no identificador legado).
- [ ] Cadastro definitivo de empresas parceiras reais (hoje: Oficina, Academia, Vita Açaí — nomes de exemplo/já usados, confirmar se são reais).
- [ ] Cadastro definitivo de recompensas (revisar se as 16 atuais refletem ofertas reais).
- [ ] Decidir e ativar as automações de engajamento desejadas.
- [ ] Domínio próprio + certificado (hoje resolvido automaticamente pelo Render+Cloudflare, mas na URL padrão).
- [ ] Revisão jurídica de Termos de Uso/Política de Privacidade.
- [ ] Backup de produção validado e rotina definida.
- [ ] Treinamento dos funcionários reais no fluxo de validação de resgate/QR.
- [ ] Monitoramento básico (hoje não confirmado nenhuma ferramenta de observabilidade em produção além dos logs do Render).

---

## 33. ROADMAP

**FASE ATUAL:** motor de engajamento construído e testado em modo simulação; recuperação de senha pronta localmente, aguardando publicação.

**PRÓXIMA FASE (já desenhada, aguardando decisão de negócio):** decidir e ativar a primeira automação real de engajamento (mais provável candidata: `RECOMPENSA_QUASE_DESBLOQUEADA`, já com detector, template de exemplo e regra de limite prontos) — depende só de (a) publicar a recuperação de senha primeiro, (b) decidir canal/texto definitivo, (c) conectar um provider real (WhatsApp ou reaproveitar `emailService.js`).

**FUTURO (mencionado em discussões do projeto, não iniciado):** métricas de frequência de visita por empresa ("Bloco 2" de fidelização) — decisão de negócio explicitamente pausada antes de qualquer código ser escrito, porque as perguntas centrais (quantidade de atividades, período, benefício) não tinham resposta definida; evento `ANIVERSARIO` (precisa de schema novo); portal próprio para as empresas parceiras; ranking de clientes.

---

## 34. HISTÓRICO DO PROJETO

Linha do tempo por commit real (`git log`), com o que cada etapa acrescentou (confirmado por diff/leitura de código, quando necessário):

| Commit | O que trouxe |
|---|---|
| `dc451b7` | Commit inicial |
| `a320db3` | Separação de autenticação em controller/rota própria |
| `761e488` | Estrutura inicial da API + hardening de segurança |
| `4717802` | Primeira versão funcional do sistema de pontos |
| `5319f1f` | Leitura de QR Code no funcionário |
| `1e7f52f` | Perfil do cliente com QR Code próprio + resumo da conta |
| `5cfb015` | Upload e recorte de imagem nas recompensas |
| `ec7a2ca` | Favoritos individuais + destaque global + melhorias diversas |
| `b2774ac` | Hardening de segurança (timing attack no login) + UX + primeira versão desta documentação |
| `d45fa04` | Login migrado de e-mail para CPF, com as 3 contas de exceção legadas |
| `b9153a0` | Progresso de fidelização (Bloco 1) no dashboard/catálogo/favoritos |
| `4e5d8c1` | Sistema de controle de migrations (`migration_history` + orquestrador) |
| `0f42d1b` | Motor de Engajamento (Bloco 3): eventos, templates, automações, histórico com limite global de 7 dias |
| `4d07fd4` | Scheduler do Motor de Engajamento, em modo simulação |
| *(não commitado)* | Recuperação de senha por e-mail — implementada e testada localmente nesta última etapa |

---

## 35. CONTEXTO PARA OUTRA INTELIGÊNCIA ARTIFICIAL

Se você está assumindo este projeto sem o histórico da conversa que gerou este documento, leia isto primeiro.

**O que o sistema é:** um programa de fidelidade em pontos (Movement) para pequenos negócios parceiros, com backend Node/Express/PostgreSQL sem ORM e frontend HTML/CSS/JS puro, rodando local e em produção no Render.

**Decisões já tomadas, não reabra sem pedido explícito do usuário:**
- Login é por **CPF**, com exatamente 3 contas de exceção por identificador legado (`admin`, `funcio`, `maria@teste.com`) — nunca generalize isso para "CPF ou e-mail para qualquer um".
- Saldo de pontos nunca é uma coluna — sempre `SOMA(entrada) − SOMA(saida)`.
- Resgate desconta pontos **na criação**, não na validação; expira em 5h (constante no código, não uma env var).
- Progresso de fidelização (Bloco 1) é calculado **no frontend**, reaproveitando dados já buscados — não crie um endpoint novo para isso sem antes checar se dá para reaproveitar `GET /pontos/saldo` + `GET /recompensas`/`favoritos`.
- Motor de Engajamento opera **só em simulação** — nenhuma automação está `ativa: true`, nenhum provider é real. Não ative nada nem invente valores de negócio (frequência, texto de template definitivo, prioridade real) sem o usuário decidir explicitamente — isto já aconteceu uma vez nesta conversa (pedido de "Bloco 2" de fidelização foi **propositalmente pausado** porque as perguntas de negócio não tinham resposta).
- Limite de notificação é **global** (1 msg/usuário/7 dias, todas as automações), não por automação.

**Decisões explicitamente NÃO tomadas — não invente:**
- Frequência de qualquer automação de engajamento futura.
- Textos definitivos de mensagens.
- Quais recompensas/empresas são "as reais" — os dados cadastrados hoje são de configuração/teste, não uma regra fixa.
- Se/quando ativar WhatsApp — nenhum provider real foi conectado.

**Áreas que não devem ser alteradas sem confirmação explícita do usuário:**
- Qualquer coisa em produção (Render) — nunca rodar migration, alterar dado ou fazer deploy sem pedido explícito e confirmação do usuário antes de cada ação.
- As 3 contas de exceção (`admin`/`funcio`/`maria@teste.com`) e qualquer conta de produção com atividade real (ex: `id=84` no Render) — nunca apagar sem confirmação explícita, mesmo que "pareçam" teste.
- Migrations antigas já registradas em `migration_history` — nunca editar, só adicionar novas.
- A regra de limite de 7 dias e o `pg_advisory_xact_lock` que a protege — é fácil "simplificar" isso introduzindo uma condição de corrida; não o faça sem entender a seção 17 por completo.

**Arquivos críticos:**
- `src/config/database.js` — único Pool, nunca criar um segundo.
- `src/services/resgateExpiracao.service.js` — `HORAS_PARA_EXPIRAR` é a fonte da verdade da janela de 5h, reaproveitada pelo Motor de Engajamento.
- `src/services/engagement/notificationHistory.js` — a regra de 7 dias mora aqui; qualquer novo caminho de envio real **precisa** passar por `tentarEnviarComLimiteGlobal`, nunca gravar `status='enviado'` por fora.
- `scripts/migrate.js` — única forma correta de aplicar schema; nunca rodar um `migrate-*.js` isolado manualmente sem necessidade.

**Como o banco funciona:** 9 tabelas, sem ORM, toda constraint de integridade vive no próprio Postgres (`CHECK`, `FOR UPDATE`, `UNIQUE`) — o código de aplicação reforça isso, mas não é a única linha de defesa.

**Como produção funciona:** Render observa `main` no GitHub (auto-deploy, inferido); migrations **nunca** rodam sozinhas — sempre um passo manual separado, e isso já causou um incidente real no passado (deploy sem migration correspondente quebrou `/recompensas` em produção). Sempre confirmar o schema de produção antes de assumir que bate com o código recém-deployado.

**Diferenças Local × Render:** ver seção 24 — os dois bancos compartilham uma origem comum e divergiram organicamente; nunca presuma que são idênticos, nunca copie um ID de um ambiente para o outro sem mapear por conteúdo primeiro.

**O que está pronto:** ver seção 30. **O que ainda depende do usuário:** toda decisão de negócio listada nas seções 16 e 31 — a resposta correta ao encontrar uma dessas lacunas é **perguntar**, não inventar um valor razoável e seguir em frente.

**Como continuar sem quebrar produção:** sempre trabalhar local primeiro; sempre rodar `npm run migrate` (nunca um script de migration isolado) para aplicar schema; sempre fazer backup antes de qualquer operação destrutiva; nunca fazer commit/push/deploy sem que o usuário peça explicitamente essa etapa — em praticamente toda etapa deste projeto até aqui, essas três ações foram proibidas por instrução explícita do usuário até uma etapa final de revisão.
