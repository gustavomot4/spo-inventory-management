# Integração do plano Brasil Drop no SPO

## Escopo aplicado

O documento fornecido descreve dois projetos. Neste repositório foi implementado o trilho **Brasil Drop → SPO**, correspondente às fases 4 e 5 e à validação aplicável da fase 6: controles de fonte e tema claro/escuro/sistema. As fases de DTO, persistência e comprovante Angular pertencem ao Brasil Drop e não são alterações deste sistema.

A orientação de “modo plano” no documento descreve a análise anterior; a solicitação atual autoriza a implementação. O repositório Git encontrado está em `Desktop/spo-inventory-management`. A pasta `Desktop/SPO_inventory_management` contém somente diretórios operacionais vazios, sem código Git.

## Arquitetura preservada

O SPO usa Next.js 14/App Router, componentes React, Route Handlers, Prisma 5.22 e SQLite. Produtos possuem variações com estoque; vendas mantêm valores em centavos e snapshots de preço. Acesso sensível continua protegido pelo PIN. Dashboard usa seu próprio AppShell; as demais páginas internas compartilham o layout `(app)`; PIN fica fora desse layout.

O provider foi colocado no layout raiz para cobrir todas essas entradas. A integração não altera APIs, schema, migrations, PIN, preços, taxas ou movimentações de estoque. Não há importação de Angular nem dependência de serviços do Brasil Drop.

## Decisões e implementação

- Fonte: 87,5%, 100%, 112,5% e 125%; reset para 100%. Percentuais respeitam o tamanho padrão de fonte configurado no navegador.
- Tema: `light`, `dark` ou `system`, padrão `system`; alterações do sistema operacional são acompanhadas em tempo real nesse modo.
- Preferências: `spo_font_scale_v1` e `spo_theme_v1`, validadas ao ler. Valores inválidos retornam ao padrão; falhas de armazenamento não interrompem a interface. O evento `storage` sincroniza abas.
- Um script síncrono no `<head>` aplica tema/fonte antes do corpo ser exibido. O primeiro render React usa estado estável, e a hidratação lê as preferências salvas. Somente o `<html>`, modificado pelo script, usa `suppressHydrationWarning`.
- Cores de superfícies, textos, marca, sucesso, alerta, erro, bordas e foco usam tokens semânticos em `globals.css` e no Tailwind. Eixos, séries e tooltips Recharts também usam esses tokens.
- Ações destrutivas têm fundo próprio, separado da cor do texto de erro, para manter contraste em ambos os temas.
- Controles têm nomes acessíveis, grupos, indicação do tema selecionado e botões desabilitados nos limites. O menu suporta rolagem e aguarda hidratação antes de aceitar abertura. Elementos do drawer fechado ficam invisíveis e fora da navegação por teclado.
- Textos antes fixos em pixels foram convertidos a `rem`. Campos em telas de toque mantêm pelo menos 16px e acompanham o aumento da fonte. Movimentos são reduzidos com `prefers-reduced-motion`.
- Impressão redefine a raiz para 16px, preserva comanda de 72mm úteis em papel de 80mm e libera os contêineres de rolagem para evitar cortes. A prévia responde à preferência de leitura; o documento impresso é independente dela.

## Verificação reproduzível

```sh
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
docker build -t spo-accessibility-qa:local .
```

Os testes de navegador criam um SQLite vazio em um diretório temporário e aplicam as três migrations existentes. O servidor usa PIN exclusivo de teste e porta 3100, sem reutilizar servidor ou banco da loja. As capturas e traces ficam em `test-results/`, ignorados pelo Git e pelo Docker. No Windows é possível selecionar o Edge com `PLAYWRIGHT_CHANNEL=msedge`.

`npm test` cobre validação de valores, armazenamento indisponível, equivalência entre inicialização pré-render e runtime para todos os temas/escalas e contraste mínimo de 4,5:1 dos pares semânticos de texto/superfície.

Playwright verifica limites/reset, persistência após recarga, navegação, sincronização entre abas, mudanças do tema do sistema, armazenamento inválido/bloqueado, PIN/menu mobile em 375px, rotas principais, gráficos e comanda. As operações de criação de produto/venda para as verificações usam somente o banco temporário.

## Resultado da validação local (13/09/2026)

| Verificação | Resultado |
|---|---|
| Prisma Client e três migrations em banco temporário | Passou |
| TypeScript e ESLint | Passou, sem erros ou avisos de lint |
| Testes unitários/preferências/contraste | 4 passaram |
| Playwright no Edge, desktop e 375px | 4 passaram |
| Build Next de produção | Passou |
| Build Docker Linux/Node 20 | Passou |
| Container isolado e `GET /api/health` | Passou: `ok: true` |
| Impressão em mídia emulada, claro e escuro | Passou |

Capturas revisadas: [menu mobile a 125%](qa-accessibility/mobile-menu-dark-125.png), [PIN mobile a 125%](qa-accessibility/mobile-pin-dark-125.png), [relatórios escuros](qa-accessibility/reports-dark.png), [venda clara](qa-accessibility/sale-light.png) e [impressão a partir do tema escuro](qa-accessibility/print-dark.png).

A prévia Docker usa `http://localhost:3110`, container `spo-accessibility-preview`, com banco temporário em memória, separado da instalação da loja. Para encerrá-la, use `docker stop spo-accessibility-preview`. Reiniciar esse container recria os dados de demonstração vazios.

## Observações preexistentes e limites

- `src/lib/prisma.ts` usa `$executeRaw` em PRAGMAs que retornam resultados. O Prisma 5.22 emite `P2010: Execute returned results, which is not allowed in SQLite` nesses casos. A aplicação captura esse erro; as migrations e operações de teste continuam funcionando. Esse trecho não foi alterado nesta integração visual.
- O install reporta vulnerabilidades nas dependências existentes; não foi feita atualização geral de versões de produção neste escopo.
- No servidor de desenvolvimento, o redirecionamento para PIN pode normalizar `127.0.0.1` para `localhost`. Preferências locais pertencem à origem; os testes usam `localhost` durante todo o fluxo.
- Impressão é validada por emulação de mídia no navegador. A impressão física em equipamento térmico e o rollback operacional da loja precisam de validação no equipamento de destino.

## Reversão

Esta alteração não precisa de migration ou restauração do banco. Para reverter o recurso, retorne à versão anterior do frontend/imagem pelo procedimento de release já existente. As novas chaves locais serão ignoradas pela versão antiga. Para somente restaurar a leitura, use reset para 100% e selecione Claro; para voltar ao padrão novo, escolha Sistema.

A implementação foi preparada na branch `feat/acessibilidade-temas`. Publicação no GHCR e atualização da instalação da loja são etapas de release, separadas desta alteração local.
