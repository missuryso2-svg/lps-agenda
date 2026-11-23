# LPS Agenda — resultados de homologação (Fase H)

**Atualizado em:** 23/11/2026
**Ambientes de escrita:** Supabase local QA descartável; nunca o projeto hospedado.
**Deploy:** não executado.

## Complemento I1 — preparação Vercel (23/11/2026)

- Decisão do proprietário registrada: Vercel exclusivamente; Supabase hospedado preservado; repo `missuryso2-svg/lps-agenda`, branch Production pretendida `main`.
- `vercel.json` preparado com região `iad1`, `git.deploymentEnabled=false` para todas as branches e sem `crons`. O teste `tests/billing-scheduler.test.ts` agora verifica auto-deploy Git/Cron desligados, região e rota protegida legada.
- Não existe link local `.vercel/`, Vercel token, projeto remoto confirmado, importação GitHub, build remoto ou deployment. A documentação oficial da Vercel indica que o primeiro deployment é sempre Production; `git.deploymentEnabled=false` não impede deploy manual ou inicial.
- Nenhuma alteração foi feita no Supabase hospedado, configuração Auth, DNS/domínio, plano/faturamento Vercel, variáveis de ambiente, credenciais, onboarding, automações financeiras ou AdSense. Nenhum secret foi exibido.
- `npm run typecheck`: passou. `npm run lint`: passou. `npm test`: 36 arquivos/763 testes passaram, incluindo os 3 testes de segurança operacional Vercel.
- `git diff --check`: passou; o checkout Windows só reportou os avisos normais de conversão LF/CRLF.
- `npm run build`: passou em uma cópia temporária do repositório sem arquivos `.env*`, Vercel link ou secrets; Next.js 16.4.5 completou build TypeScript e geração estática em Node `v26.13.0`. O build é local, não foi enviado à Vercel.
- Observação: o Next carrega `.env.local` automaticamente em builds do checkout. Um build inicial local não imprimiu valores e nenhuma escrita Supabase ocorreu; a validação final foi repetida na cópia sem `.env*` para evitar carregar essas variáveis.

## Resumo dos comandos

| Comando | Resultado H |
| --- | --- |
| `git diff --check` | Passou na revisão final antes do commit; warnings são apenas normalização CRLF do checkout Windows. |
| `npm run typecheck` | Passou. |
| `npm run lint` | Passou. |
| `npm test` | 36 arquivos e 763 testes passaram. |
| `npm run build` | Build de produção Next.js 16.4.5 passou contra variáveis da QA local. Rotas privadas/admin, cron e APIs foram compiladas. |
| `npm ls --depth=0` | Passou, sem dependências de topo ausentes. |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades. |
| `npm audit --audit-level=high` | 10 moderadas, todas em dependências de desenvolvimento (`minimatch` transitivo). Nenhuma alta/crítica de produção observada; não foi usado `npm audit fix --force`. |

## PostgreSQL e Data API

- Instalação limpa da stack B2B: 29 migrations até `20261120180000`.
- 15 suítes PostgreSQL passaram: F1 Storage, operações F3, onboarding e acesso ao trial, billing manual, B2B, dashboard C2, cutover financeiro e concorrência.
- Foram observadas 268 mensagens explícitas `PASS`; `product-f1.sql` e `operations-f3-concurrency.sql` também terminaram com sucesso e verificações estruturais sem mensagens `PASS`.
- Atualização descartável desde a migration 19 com 3 fixtures legadas sintéticas. Migration 20–29 aplicadas; `manual-billing.sql` passou 75 verificações e preservou as 3 linhas de fixture. Nenhuma fixture representa cliente real.
- B2B Data API: 18 verificações HTTP para `anon`, `authenticated` legado e `service_role`; 744 comparações de âncoras mensais entre TypeScript/PostgreSQL passaram.
- Financeiro/concorrência exercitados: acordo com preço acordado, emissão idempotente, Pix sintético com confirmação explícita, resposta perdida e retry, lock, revogação, suspensão/cancelamento, carência de 72 h, trial de 168 h e preservação do histórico.
- Flags e tabelas foram verificadas em banco descartável. A rotina não foi ativada no hospedado.

## Integração HTTP e navegador

| Jornada | Resultado observado |
| --- | --- |
| `financial-cutover.mjs` | Signup, confirmação por e-mail local/Mailpit e callback PKCE; recuperação genérica para endereço existente/inexistente, mensagem recovery, callback, redefinição, rejeição da senha antiga, logout e redirect de cookie expirado/inválido passaram. Saúde financeira permitida ao gestor e negada a usuário comum; crons inválidos retornam 401; contadores financeiros ficaram inalterados. |
| `commercial-phase-d.mjs` | Landing, planos, teclado, WhatsApp interceptado, cadastro/login, demo e estados comerciais passaram em 375, 768 e 1280 px. Flags de aquisição/trial da QA ficaram fechadas durante o ensaio. |
| `c2-dashboard-http.mjs` | Anon e papéis sem autorização negados; gestor/operador, acordo, emissão Pix, retry após resposta perdida, concorrência, auditoria e revogação passaram. O erro `ERR_FAILED` esperado foi injetado para testar resposta perdida/idempotência. |
| `c1-finance-http.mjs` | Tentativas via Data API negadas; bootstrap financeiro privado, concessão limitada e revogação testados em QA. |
| `manual-trial-http.mjs` | Duas flags, concorrência/idempotência de cadastro, trial de 168 h, cobertura, bloqueio após expiração e acesso histórico passaram. Fixture atualizado para respeitar expediente e cobertura real. |
| `product-f1.mjs` | Upload, normalização, Storage privado, isolamento owner/staff/tenant, substituição concorrente e remoção passaram; landing/cadastro/equipe/clientes/plano em 375 e 1280 px. |
| `operations-f3.mjs` | SQL/Data API/Next/browser: reserva concorrente, pausa, confirmação, notificação, atendimento presencial e avaliação passaram. Repetição isolada terminou com exit 0. |
| `booking-qr-g1.mjs` | QR decodificado para URL real `/agendar/[slug]`, PNG, PDF A4, acesso por tenant, mobile e reserva pública com pausa/notificação passaram usando origem HTTPS reservada de QA. |

### Revisão visual e acessibilidade

- Viewports 375, 768 e 1280 px exercitados nas jornadas de marketing/planos; F1 também em 375/1280 px. Não foi confirmado overflow horizontal nas telas amostradas.
- Fluxos de teclado/foco foram verificados no contato comercial e na confirmação financeira em duas etapas. Inputs e fluxos de Auth foram exercitados no navegador e por HTTP.
- Não foi executada auditoria automatizada WCAG/Axe, medição sistemática de contraste, leitor de tela, teste físico do cartaz QR, Lighthouse ou prova de carga. Não declarar conformidade de acessibilidade/performance com base nesses testes.

## Auditoria hospedada somente de leitura

- Snapshot final: 29 migrations; 1 gestor, nenhum operador; sem contratos/trials/faturas/Pix/Asaas vigentes/fila de compensação ou retry; onboarding e worker desligados; sem `pg_cron`.
- Catálogo: 22/22 tabelas públicas com RLS; zero privilégio efetivo de tabela para `anon`; 25 funções públicas `SECURITY DEFINER`, 20 executáveis por `authenticated`, zero por `anon`, zero com `search_path` inseguro.
- Advisors: 20 avisos de `SECURITY DEFINER` para usuários autenticados, 1 de leaked-password protection desativada e 1 aviso de inicialização RLS/performance.
- Verificação de ambiente: URL e chave pública correspondiam ao projeto esperado e Auth health respondeu 200. A chave `service_role` local recebeu `Invalid API key`; não foi corrigida nem usada em QA. A URL pública local é loopback. O SMTP hospedado não foi verificado.
- As consultas hospedadas usaram `--read-only`. Nenhuma conta, dado de cliente, plano, contrato, competência, Pix, operador, flag, migration, cron ou anúncio foi criado/alterado remotamente.

## Não executado ou limitado

- Sem hostname/domínio definitivo, projeto/deployment Vercel, DNS, HTTPS hospedado, SMTP transacional ou redirect real: recuperação/cadastro foram provados apenas no Supabase local/Mailpit.
- Não houve smoke test pós-deploy, confirmação de e-mail real, leitura física do QR, confirmação humana do WhatsApp, teste de backup/restore, monitoramento, WAF ou incidente real.
- A expiração natural de um JWT de uma hora não foi aguardada; foi testado o redirect seguro com cookie inválido/expirado-simulado. Sessões múltiplas foram usadas pelos testes, sem teste de carga de sessões concorrentes.
- Não foi testado o fluxo da flag de onboarding habilitada no Supabase hospedado; ambas as flags permaneceram desligadas.
- Advisor de senha vazada exige decisão; nenhum aviso foi alterado automaticamente.

## Reprodutibilidade e segurança da evidência

Os comandos de escrita foram limitados às stacks locais B2A2 QA preexistente e B2B descartável. A B2A2 já continha dados sintéticos antes de H; ela não foi resetada nem parada e continua ativa. A B2B foi criada para H e foi parada com `--no-backup`; a cópia temporária dos SQLs que continha a DSN local foi removida. Não copiar chaves, cookies, e-mails, IDs de tenants, screenshots com dados privados ou conteúdo de Mailpit para logs/commits.
