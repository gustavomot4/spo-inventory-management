# 🌶️ SPO — Sistema Pimenta Ousada

Sistema de gestão de estoque e vendas para a loja **Pimenta Ousada**. Controle de produtos e variações, registro de vendas (dinheiro, PIX, débito, crédito com parcelamento), entradas de estoque, relatórios de estoque e de vendas, tudo protegido por um PIN de acesso.

**Stack:** Next.js 14 (App Router) · TypeScript · Prisma · SQLite · Tailwind CSS · Docker

## Acessibilidade e aparência

O menu lateral (ou menu no celular) e a tela de PIN têm controles de fonte e tema:

- **A− / A+**: 87,5%, 100%, 112,5% e 125%. Clique no percentual para restaurar 100%.
- **Claro / Escuro / Sistema**: Sistema acompanha a preferência de aparência do dispositivo.
- As escolhas persistem por navegador e endereço do sistema e sincronizam entre abas. Sem acesso ao armazenamento local, continuam funcionando durante a sessão da página.
- A comanda térmica mantém texto preto, fundo branco e tamanho de impressão independente dessas escolhas.

Detalhes da adaptação do plano Brasil Drop, validação e reversão: [docs/merge-brasil-drop.md](docs/merge-brasil-drop.md).

Para verificar as preferências e o contraste, execute `npm test`. Os testes de navegador usam um banco temporário e a porta 3100: instale o Chromium com `npx playwright install chromium` e execute `npm run test:e2e`. No Windows, para usar o Edge já instalado, defina `$env:PLAYWRIGHT_CHANNEL='msedge'` no PowerShell antes do comando. Não execute o build local e o servidor de testes simultaneamente, pois ambos usam `.next`.

---

## 🤖 Como este projeto foi feito (vibe coding)

Este é um projeto de **vibe coding**: em vez de escrever o código linha a linha, ele foi construído **descrevendo em linguagem natural o que se queria** e deixando agentes de IA implementarem, com uma pessoa dirigindo e revisando cada etapa.

O processo, bem resumido, foi um pipeline de agentes especializados (os prompts ficam em `77777777_SPO_Project_DOCs/`):

1. **Contexto e planejamento** — definição do que a loja precisava e do plano de build.
2. **Agente de banco de dados** — modelagem do schema Prisma e das migrations.
3. **Agentes de implementação** — APIs, telas e regras de negócio.
4. **Agente de QA (adversarial)** — várias passagens caçando bugs, corrigindo e documentando cada achado (relatórios em `77777777_SPO_Project_DOCs/e_qa/`). Até esta versão foram 14 passagens e 84 achados encontrados e corrigidos (QA-001 a QA-084).

Ou seja: a pessoa atua como **diretor e revisor**, e os agentes fazem o trabalho pesado de código — sempre com verificação (type-check, testes de borda, revisão de segurança) antes de cada entrega.

---

## ▶️ Como rodar

Há **dois modos**. O **modo Docker é o oficial** (recomendado para uso na loja, não exige instalar Node). O **modo Node** é para desenvolvimento.

### Modo 1 — Docker (oficial / produção)

**Pré-requisito:** ter o Docker instalado e em execução.
- **Windows:** instalar o **Docker Desktop** ([docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)) e abri-lo (esperar ficar "Running").
- **Linux:** instalar **Docker Engine + plugin Docker Compose** ([docs.docker.com/engine/install](https://docs.docker.com/engine/install/)).

A imagem oficial é **pré-construída e publicada no GHCR** (`ghcr.io/gustavomot4/spo`) — não é necessário compilar o projeto na máquina da loja.

#### Windows

Dê **duplo clique em `iniciar.bat`**. Ele:
1. Verifica/inicia o Docker Desktop.
2. Verifica se há uma atualização publicada (GitOps — ver seção abaixo) e aplica automaticamente.
3. Baixa a imagem pinada pelo `SPO_VERSION` (arquivo `.env`) e sobe o container com `docker compose up -d`.

Na primeira execução (bootstrap, antes de qualquer release publicado) ou se o pull da imagem falhar, ele recorre ao build local via `docker-compose.dev.yml`.

#### Linux / Mac

```bash
cp .env.example .env              # apenas na primeira vez
docker compose up -d              # baixa a imagem pinada por SPO_VERSION e inicia
docker compose logs -f            # acompanhar os logs
docker compose down               # parar o sistema (dados preservados)
```

Se ainda não houver uma imagem publicada para a versão fixada (bootstrap), use o override de build local:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

➡️ Acesse **http://localhost:3000**. Os dados (banco SQLite) ficam salvos e **persistem** entre reinícios e atualizações de imagem.

### Modo 2 — Node / npm (desenvolvimento)

**Pré-requisito:** Node.js 20 LTS ([nodejs.org](https://nodejs.org/pt/download)).

#### Windows e Linux (mesmos comandos)

```bash
npm install                    # 1. instalar dependências (primeira vez)
npx prisma migrate deploy      # 2. criar/atualizar o banco
npm run dev                    # 3. iniciar em modo desenvolvimento
```

➡️ Acesse **http://localhost:3000**. Para encerrar: `Ctrl + C` no terminal.

> No Linux, `./iniciar.sh` automatiza esses três passos (instala dependências se faltarem, aplica migrations, copia `.env.example` → `.env` se necessário e inicia `npm run dev`). É um atalho para desenvolvimento — para rodar em produção via Docker no Linux, use os comandos do Modo 1.

> 🔑 **PIN de acesso:** o PIN padrão é **`1234`** (configurável pela variável `APP_PIN`, ou trocável pela tela de Configurações). A sessão dura 8 horas. Enquanto o PIN padrão não for alterado, a tela de Configurações exibe um aviso lembrando a dona de definir um PIN próprio (RN-007.6).
>
> A tela de **Vendas/Histórico** é área aberta (sem PIN) — apenas **Relatórios** e **Configurações** exigem PIN (RN-007.4).

---

## 🧰 Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Servidor em produção (requer build) |
| `npm run typecheck` | Verifica tipos TypeScript sem compilar |
| `npm run lint` | Executa o ESLint |
| `npm run db:migrate` | Cria e aplica nova migration (dev) |
| `npm run db:migrate:deploy` | Aplica migrations existentes (produção/CI) |
| `npm run db:studio` | Abre o Prisma Studio (UI visual do banco) |
| `npm run db:generate` | Regenera o Prisma Client após mudanças no schema |
| `npm run db:reset` | Recria o banco do zero (⚠️ apaga os dados) |

---

## ⚙️ Variáveis de ambiente

Copie `.env.example` para `.env` (os scripts de inicialização fazem isso automaticamente na primeira vez):

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Caminho do arquivo SQLite. Em produção, aponte para fora da pasta do projeto (ex.: `file:C:/SPO/dados/spo.db`). |
| `SESSION_SECRET` | `TROQUE-ESTE-VALOR` | Senha usada pelo iron-session para assinar o cookie de sessão. **No Docker não precisa ser definida** — o `docker-entrypoint.sh` gera e persiste um segredo aleatório por instalação (`/data/session_secret`, QA-060). Em modo Node, defina um valor próprio (mín. 32 caracteres, `openssl rand -base64 32`); o placeholder do `.env.example` faz o sistema recusar iniciar em produção até ser trocado (QA-082). |
| `APP_PIN` | `1234` | PIN de acesso de 4 dígitos (RN-007.6). Pode ser trocado pela tela de Configurações. |
| `NODE_ENV` | `development` | Ambiente de execução (`production` ativa cookie seguro). |
| `SPO_VERSION` | `v1.1.0` | Versão da imagem Docker a ser usada pelo `docker-compose.yml` (`ghcr.io/gustavomot4/spo:${SPO_VERSION}`). Nas máquinas da loja é gerenciada automaticamente pelo `spo-updater` (GitOps — ver seção abaixo). |

---

## 🔐 Autenticação

Acesso protegido por **PIN de 4 dígitos** via **iron-session** (cookie `spo_pin_session`, HTTP-only, validade de 8 horas). Não há login com usuário/senha nem NextAuth — é um sistema *single-tenant* (uma única loja). O `middleware.ts` protege:

- **Páginas:** `/configuracoes`, `/relatorios`
- **APIs:** mutações de configurações/produtos/categorias/maquininhas, `/api/reports/*`, `/api/sales/:id/cancel`, leitura de `/api/stock-entries`

A tela de **Vendas** (PDV e histórico) e o registro de entrada de estoque são **área aberta**, alinhados à RN-007.2/RN-007.4 — qualquer pessoa na loja pode vender e consultar o histórico, mas taxa/maquininha só aparecem com o PIN ativo. Quando o PIN expira ou não existe sessão, páginas protegidas redirecionam para a tela de PIN e APIs retornam `401`.

---

## 🔄 Atualizações automáticas (GitOps)

A partir da v1.1.0, as máquinas da loja **recebem novas versões automaticamente** — sem `git pull` nem reconstrução manual:

```
Release (CI):  tag vX.Y.Z → typecheck + build → push para GHCR (tag + digest)
               → atualiza deploy/edge.json (canal de testes)
Promoção:      "Promote to stable" (manual) → deploy/stable.json (canal das lojas)
Máquina:       iniciar.bat (no boot) + Tarefa Agendada diária (18h30) executam
               deploy/spo-updater.ps1, que:
               1. lê deploy/stable.json
               2. faz backup do banco (Online Backup API)
               3. baixa a nova imagem e reinicia (docker compose pull && up -d)
               4. verifica /api/health por até 120s
               5. se falhar → rollback automático para a versão anterior
                  (e restaura o backup, se a release for "breaking")
Offline:       sem internet, o updater desiste em ~5s e o sistema sobe
               normalmente na versão atual
```

`GET /api/health` expõe `{ ok: true, version: "vX.Y.Z" }` e é usado pelo updater para validar a atualização.

Guia operacional completo (bootstrap, releases, rollback manual, troubleshooting): `77777777_SPO_Project_DOCs/c_docs_tecnicos/d_runbook.md`. Detalhes de arquitetura: ADR-005 em `77777777_SPO_Project_DOCs/a_contexto/f_decisoes_arquitetura.md`.

---

## 🗂️ Estrutura do projeto

```
SPO_inventory_management/
├── prisma/
│   ├── schema.prisma          # Schema do banco (modelos, índices, triggers)
│   └── migrations/            # Histórico de migrations
├── src/
│   ├── app/
│   │   ├── (app)/             # Páginas internas (protegidas por PIN)
│   │   │   ├── produtos/      # Catálogo, cadastro e edição de produtos
│   │   │   ├── vendas/        # PDV (nova venda) e histórico
│   │   │   ├── estoque/       # Entradas de estoque
│   │   │   ├── relatorios/    # Relatórios de estoque e de vendas
│   │   │   └── configuracoes/ # Loja, PIN e maquininhas de cartão
│   │   ├── api/               # Rotas de API (REST) — auth, products, sales, etc.
│   │   ├── pin/               # Tela de PIN
│   │   └── globals.css        # Estilos globais + Tailwind
│   ├── components/            # Componentes de UI reutilizáveis
│   ├── lib/                   # prisma, session, rate-limit, sku, timezone, utils, enums
│   ├── types/                 # Tipos TypeScript compartilhados
│   └── middleware.ts          # Proteção de rotas por PIN
├── deploy/                     # GitOps: manifestos de canal, updater, runbook
│   ├── edge.json               # Canal de testes (atualizado pelo CI a cada tag)
│   ├── stable.json             # Canal das lojas (atualizado via "Promote to stable")
│   ├── spo-updater.ps1         # Agente de atualização (backup, pull, health, rollback)
│   └── instalar-atualizacao-automatica.bat  # Cria a Tarefa Agendada (18h30)
├── .github/workflows/          # CI: release.yml (build+push GHCR) e promote.yml
├── Dockerfile                  # Build multi-stage (node:20-alpine → standalone)
├── docker-compose.yml          # Orquestração — imagem pinada via SPO_VERSION
├── docker-compose.dev.yml      # Override de build local (dev / bootstrap)
├── iniciar.bat                 # Launcher Windows (Docker + verificação de atualização)
├── iniciar.sh                  # Launcher Linux para desenvolvimento (modo Node)
└── .env.example                # Modelo das variáveis de ambiente
```

---

## 💾 Banco de dados e backup

- **Desenvolvimento:** `dev.db` na raiz do projeto (criado automaticamente).
- **Produção:** aponte `DATABASE_URL` para um caminho **fora** da pasta do projeto, para não ser sobrescrito.

Backup é simplesmente uma cópia do arquivo `.db`:

```bash
# Linux
cp dev.db ~/backups/spo_backup_$(date +%Y%m%d_%H%M%S).db
```

```bat
:: Windows
copy dev.db "%USERPROFILE%\Desktop\spo_backup.db"
```

> ⚠️ Nunca commite o arquivo `.db` (já está no `.gitignore`). Para inspecionar os dados visualmente: `npm run db:studio` (abre em `http://localhost:5555`).

---

## 📐 Convenções de desenvolvimento

- **Dinheiro sempre em centavos (Int):** `R$ 59,90` = `5990`. Nunca usar `Float` para valores monetários. Use `formatCurrency()` / `parseCurrencyToCents()` de `src/lib/utils.ts`.
- **Taxas em basis points (Int):** `1,99%` = `199`.
- **IDs:** `cuid` (string opaca gerada pelo Prisma) — nunca inteiros sequenciais como ID público.
- **Datas:** armazenadas em UTC (ISO 8601); o "dia comercial" da loja usa o fuso fixo de `src/lib/timezone.ts` (UTC−3).
- **TypeScript estrito:** `strict` + `noUncheckedIndexedAccess`. Evitar `any`.
- **Estilo:** Tailwind CSS, mobile-first (viewport mínimo 375px).

---

## 🧪 Tecnologias

| Tecnologia | Versão | Papel |
|---|---|---|
| Next.js | 14.2 | Framework full-stack (App Router) |
| TypeScript | 5.x | Linguagem (modo estrito) |
| Prisma | 5.22 | ORM e migrations |
| SQLite | — | Banco de dados local |
| iron-session | 8.x | Sessão por PIN (cookie HTTP-only) |
| bcryptjs | 2.x | Hash do PIN |
| Tailwind CSS | 3.x | Estilização |
| Docker | — | Empacotamento e execução (node:20-alpine) |
| Node.js | 20 LTS | Runtime |

---

*SPO — Sistema Pimenta Ousada | v1.1.0 | Projeto de vibe coding · 2026*
