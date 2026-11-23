# LPS Agenda — plano de desbloqueio (Fase I1)

**Atualizado em:** 23/11/2026
**Decisão herdada da H:** **NO-GO comercial**. Este documento prepara as ações para removê-lo; não constitui autorização de deploy, contratação, rotação hospedada ou ativação financeira.

## Estado inicial confirmado

- `main` e `origin/main` estavam no SHA `c14921a6d71220bd1006c17c6035a9b011992f6d`, workspace limpo no início de I1.
- A última homologação H registrou 763 testes em 36 arquivos, Next build/typecheck/lint aprovados e 29 migrations no Supabase hospedado até `20261120180000`.
- Preflight remoto somente de leitura: 1 gestor, 0 operadores, sem contratos/trials/faturas/Pix confirmados, sem pendências financeiras/Asaas; onboarding e worker desligados, `pg_cron` ausente.
- O Supabase hospedado está `ACTIVE_HEALTHY` na região `us-east-1` (US East/Northern Virginia). O `projects list` não expôs plano contratado; isso precisa ser confirmado no Dashboard/faturamento da organização.
- Metadata somente de leitura da API Keys indica uma chave `publishable`, uma `secret` e duas entradas legadas. Nenhum valor de chave foi revelado.
- A URL/chave pública local correspondem ao projeto esperado e Auth respondeu 200. A `SUPABASE_SERVICE_ROLE_KEY` local foi rejeitada pelo PostgREST hospedado. Nenhuma operação remota de escrita foi feita.
- `.env.local` permanece ignorado pelo Git, não foi alterado e não deve ser usado como fonte de produção. A origem pública nele configurada é loopback; builds H sobrescreveram as variáveis no processo e usaram Supabase QA local.

## A. Resolvido / confirmado com evidência

| Item | Evidência |
| --- | --- |
| Git e baseline | Branch `main`, SHA e `origin/main` confirmados antes do trabalho; sem alterações inesperadas. |
| Banco hospedado | 29 migrations, última `20261120180000`; sem escrituração financeira de plataforma; flags de onboarding/worker off; sem `pg_cron`. As consultas foram `--read-only`. |
| Região e estado do projeto | Metadata do CLI: `us-east-1`, `ACTIVE_HEALTHY`; a região não pode ser mudada in-place segundo a documentação Supabase. |
| Chaves hospedadas disponíveis | A listagem de metadata confirma tipos publishable/secret no projeto correto, sem revelar material. O plano da organização não aparece nessa listagem. |
| Chave local exposta — escopo | A chave em questão tem claims locais de `service_role`/`supabase-demo`, sem claim de ref de projeto. Probe GET de zero linhas: hospedado rejeitou; as três APIs Supabase locais ativas a aceitaram. Nenhuma escrita foi feita. |
| Aplicação local | Não havia listener Node nas portas de dev/QA verificadas no momento da auditoria. O Next carrega `.env.local` quando iniciado; `createAdminClient` consome a variável server-only. |
| Compatibilidade de API key atualizada | Usando somente a `SECRET_KEY` local de B2A2 capturada em memória, `@supabase/supabase-js` 2.119.0 passou GET de zero linhas e Auth Admin para um UUID sintético inexistente (404 esperado). Valores não foram impressos. Isso valida compatibilidade local, não a credencial hospedada. |
| AdSense | Flags/ID/CMP permanecem desligados ou não configurados; não é bloqueio se assim permanecer. |
| Homologação H preservada | O estado, limitações e resultados completos constam em `docs/launch-readiness-h.md`, `docs/launch-test-results-h.md` e `docs/launch-runbook-h.md`. |

## B. Preparado tecnicamente nesta fase

### Incidente de credencial

O token de demonstração não autentica no projeto hospedado, mas é aceito como chave privilegiada pelas APIs locais. O segredo é o valor padrão/local conhecido do Supabase CLI; apesar de não ser uma credencial de produção, deve ser tratado como exposto porque apareceu em transcript e concede acesso `service_role` às stacks locais.

| Stack ativa | Resultado do probe | Exposição de porta Docker |
| --- | --- | --- |
| B2A2 QA preexistente | Aceita | Todas as interfaces do host |
| B1/bill-fix QA preexistente | Aceita | Todas as interfaces do host |
| `lps-agenda` local preexistente | Aceita | Todas as interfaces do host |

O firewall não foi inspecionado e o acesso a partir de outra máquina não foi testado; portanto, o alcance real à LAN é **desconhecido**, não presumido como bloqueado. A credencial pode ler/escrever por caminhos privilegiados que bypassam RLS em cada stack, inclusive Storage e operações administrativas; os dados do stack local `lps-agenda` não foram inventariados neste incidente. A auditoria H já identificava B2A2/B1 como QA, mas isso não reduz a necessidade de rotação/isolamento.

**Prioridade imediata: P1 — contenção/rotação das três stacks locais antes de reutilizá-las em redes não confiáveis.** Nenhuma rotação foi executada: são ambientes preexistentes e mudar a chave JWT invalida chaves legadas e sessões locais; isso pode interromper trabalho/QA. É necessária uma janela aprovada pelo proprietário/DevOps.

Procedimento seguro preparado:

1. Antes da janela, confirmar que o `.env.local` não será usado por Next nem por scripts; não imprimir seu conteúdo, não copiar a chave e não a usar como fallback.
2. Restringir primeiro o acesso de entrada aos endpoints Docker locais (firewall/host para loopback e rede confiável). Os mapeamentos atuais são `0.0.0.0`; não assumir que são privados à máquina.
3. Em cada raiz local, guardar/configurar um segredo JWT único por projeto em ambiente ignorado e protegido por ACL, referenciado pelo campo `auth.jwt_secret` do `supabase/config.toml` via `env()`. Usar o nome de variável documentado/suportado pela versão CLI local e validar com `supabase config validate --resolve-env`. Não reutilizar o segredo padrão entre projetos.
4. Fazer backup/snapshot local apropriado e usar `supabase stop` **sem** `--no-backup`; reiniciar apenas a stack aprovada com `supabase start`. Isso invalida sessões e as chaves HS256 antigas, mas deve preservar os volumes/linhas do banco. Nunca executar `db reset`, remover volumes ou `docker system prune` para esta rotação.
5. Capturar a saída de `supabase start/status` apenas em memória; a CLI mostra credenciais. Gerar/configurar chaves novas sem eco, atualizar só os ambientes locais correspondentes e confirmar que a chave antiga falha em cada API e a nova passa um GET de zero linhas e o smoke Auth Admin sintético.
6. Comparar contagens/backup antes e depois, reexecutar os testes locais e verificar que os três projetos usam segredos diferentes. Não compartilhar os novos valores entre projetos, `.env.local`, transcript, shell history, CI ou Git.
7. Remover a chave de demonstração de qualquer arquivo local que ainda a contenha somente após a configuração correta ter sido validada; não guardar uma cópia “temporária”.

O Supabase documenta que um stack local emite suas próprias chaves, que `supabase status -o env` pode incluí-las e que a configuração local é reiniciada com stop/start. O JWT secret legado é compartilhado com as chaves `anon`/`service_role`; rotacioná-lo invalida essas chaves e sessões. A documentação de API keys recomenda migrar para `sb_publishable_…` e `sb_secret_…`, que podem ser rotacionadas individualmente. O novo `secret` hospedado já aparece no metadata do projeto; criar, instalar ou revogar qualquer chave hospedada requer aprovação, não foi feito aqui.

### Credencial hospedada correta

O código atual lê `SUPABASE_SERVICE_ROLE_KEY` em `src/lib/env/server.ts` e `src/lib/supabase/admin.ts`. A lista de metadata mostrou que há um tipo `secret` no projeto correto, mas o seu valor não foi revelado nem copiado. Depois da autorização do proprietário:

1. A pessoa autorizada abre **Settings → API Keys** do projeto correto no Dashboard e obtém/cria a chave `secret` desse mesmo projeto (preferencialmente o novo tipo `sb_secret_…`). Não usar chave de outro projeto, não usar `--reveal` e não enviar a chave por chat/e-mail.
2. Inserir diretamente no secret manager do provedor como variável server-only que o código lê atualmente (`SUPABASE_SERVICE_ROLE_KEY`). O nome é legado; o valor pode ser a chave `secret` nova, pois a compatibilidade do SDK com esse tipo foi provada na stack local. Uma mudança futura de nome para `SUPABASE_SECRET_KEY` deve ser um commit separado, testado e coordenado com o ambiente.
3. Configurar `NEXT_PUBLIC_SUPABASE_URL` e a chave pública/publishable do mesmo projeto no ambiente público/build. Nunca prefixar a chave `secret` com `NEXT_PUBLIC_`.
4. Antes do deploy, em preview/staging autorizado, fazer probe de zero linhas, testar `createAdminClient`/Auth Admin com um usuário sintético inexistente, verificar que nenhuma chave privada chega ao bundle e repetir as rotas críticas. Não revelar valores nos logs.
5. O HMAC/legacy `service_role` remoto foi rejeitado. Isso não prova nem exige rotação de chaves hospedadas; só o proprietário decide alteração das chaves do projeto. Se o Dashboard indicar que uma chave hospedada real foi exposta, seguir a rotação oficial em janela aprovada: criar/instalar nova, inventariar consumidores, testar, só então retirar a antiga/legacy.

### Diagnóstico sem vazamento

- Nunca usar `Get-Content`, `cat`, `grep` ou `Select-String` para imprimir linhas de `.env*`; nunca imprimir `$env:*`, bearer/API headers, tokens, JWTs, URLs com credenciais ou `supabase start/status` diretamente na tela/CI.
- Capturar `supabase start`/`supabase status -o env` em memória e imprimir somente nome-presente, role/issuer (sem claims privados), código HTTP e flags booleanas. Não usar `--reveal`.
- Para testar, preferir um GET de zero linhas sem dados, sem corpo de resposta/headers nos logs. Suprimir bodies de erro que possam conter headers ou valores.
- `git check-ignore` e `git ls-files` verificam se env files estão fora do Git; revisar `git diff --cached --name-only` antes de todo commit. Secret manager/clipboard do provedor, nunca esta conversa, é o canal para credenciais.

## C. Decisões e autorizações do proprietário

| Decisão/autorizações | Por que é necessária | Evidência/critério para encerrar |
| --- | --- | --- |
| Aprovar uma janela para restringir rede e rotacionar as 3 stacks locais preexistentes | A chave foi aceita por elas; JWT/keys e sessões antigas serão invalidados, embora os volumes devam ser preservados. | Três provas “token antigo rejeitado/novo por-stack aceito”, volumes/contagens preservados e QA refeita. |
| Escolher provedor, plano/orçamento e domínio oficial | Há trade-off de região, custo, operação e transferência internacional; nenhum foi contratado. | Decisão escrita; domínio controlado, HTTPS e serviço de preview autorizado. |
| Autorizar instalação de secret key hospedada no secret manager | Sem a credencial, rotas que exigem o cliente admin não estão prontas para runtime. Não compartilhar em chat. | Provas de projeto/key correspondentes, endpoint admin em staging e bundle sem segredo. |
| Confirmar plano da organização/projeto Supabase, compute, PITR e add-ons | CLI não expôs o contrato/plano nem backups habilitados. | Tela/fatura oficial e Backups/PITR salvos no registro operacional restrito. |
| Escolher fornecedor e domínio SMTP/remetente; aprovar taxa de envio e captcha/rate-limit | Confirmação/recovery reais dependem de email confiável; o default do Supabase é restrito e best-effort. | SPF/DKIM/DMARC validados e fluxo de envio autorizado em staging para destinatários de teste. |
| Designar proprietário de suporte, privacidade/encarregado, gestor financeiro, substituto e plantão do worker | H não confirmou nomes, substituição, canais ou cobertura de falhas. | Matriz de responsáveis assinada e contatos oficiais publicados. |
| Confirmar destinatário WhatsApp no aparelho corporativo | Teste de `wa.me` valida URL, não titularidade. | Conferência humana documentada sem enviar mensagem automática. |
| Aprovar futuro executor externo e/ou alteração do plano de API keys | Executor e migração de chaves têm impacto operacional; worker é psql/TLS e não `pg_cron`. | Ticket, escopo mínimo, backup, plano de rollback e owner approval. |

## D. Dependências de fornecedores

### Supabase hospedado

- Região atual confirmada: `us-east-1` (US East/Northern Virginia). A região é fixa por projeto; mover exige novo projeto e migração aprovada. Região de hospedagem e localização não são, por si só, declaração de conformidade.
- `projects list` retorna região/status, mas não o plano/contrato da organização. O responsável precisa confirmar em Billing/Organization Dashboard se é Free, Pro, Team ou Enterprise, compute/limites, fatura e add-ons.
- Segundo a documentação oficial atual, Free não inclui backups automáticos; Pro guarda backups diários por 7 dias, Team por 14, Enterprise até 30. PITR é add-on; quando habilitado, substitui os backups diários. Backups PostgreSQL não incluem objetos do Storage e restauração in-place substitui o estado atual. Confirmar o que está realmente ativo no Dashboard e ensaiar restore em projeto separado.
- A proteção contra senhas vazadas existe no Supabase Auth somente em Pro ou acima, via Pwned Passwords/HIBP. O plano da LPS não foi confirmado; decidir o plano antes de afirmar disponibilidade ou desativar esse risco.
- O Supabase documenta depreciação de `anon`/`service_role` legados até o fim de 2026. O projeto lista chaves novas `publishable`/`secret`; o valor não foi revelado. Planejar compatibilidade e remoção legacy com inventário de todos os consumidores; não desativar a chave antiga antes de validá-los.

### SMTP e email

O SMTP padrão do Supabase serve somente endereços pré-autorizados da equipe, tem limite atual de 2 emails/hora e não oferece SLA. Custom SMTP é requisito para produção; após configurar, a Supabase aplica limite inicial de 30 emails/hora, que pode precisar ajuste no painel. Fornecedor ainda não escolhido. O provedor precisa autenticar domínio (SPF, DKIM, DMARC), suportar bounces/reputação e reportar entrega. Usar subdomínio separado para autenticação, se aprovado pelo proprietário.

### Hospedagem — comparação e recomendação

O LPS Agenda é Next.js full-stack (Server Components/Actions, Auth SSR, rotas dinâmicas, `sharp`); não é um site estático exportável. Node deve respeitar o engine do Next fixado (`>=20.9.0`) e a mesma versão precisa passar o build antes da adoção.

| Alternativa | Compatibilidade/rotina | Região e latência para o projeto atual | Segredos, observabilidade e rollback | Custo/risco |
| --- | --- | --- | --- | --- |
| **Vercel Pro — recomendação técnica inicial** | Suporte nativo de primeira parte a Next, builds por Git, CDN, domínios HTTPS e rollback de deployment; menor trabalho de operação do runtime. | Functions default `iad1` (Washington DC/US East), próximo da Supabase `us-east-1`; `gru1` São Paulo existe, mas mover compute para lá aumenta a ida/volta às consultas do banco nos EUA. Conteúdo estático continua no CDN global. | Environment variables e logs de Functions; escolher região e evitar auto-deploy até aprovação. | Hobby é exclusivamente pessoal/não comercial segundo Vercel; operação comercial requer plano elegível. Página oficial listava Pro a US$20/mês base + consumo/créditos quando consultada, impostos/uso à parte; confirmar antes de contratar, sem tratar como orçamento. |
| Render Node Web Service | Guia oficial para Next SSR/Node; configurar build `npm ci && npm run build` e start `npm start`; app deve respeitar `PORT`. Inclui custom domain/TLS, health check, maintenance mode, logs e rollback. | Virginia é a opção mais próxima da Supabase `us-east-1`; regiões documentadas não incluem Brasil. | Environment/secret variables, logs por serviço e rollback de build. Desligar auto-deploy até autorização; deploy de `main` pode publicar mudanças automaticamente. | Compute/workspace plan e tráfego definem custo; consultar preço atual/estimativa com sizing, sem cotação nesta tarefa. |
| Fly.io Machines | Next pode ser empacotado em Docker/standalone; mais controle do runtime/VM e escala. Requer operação explícita de Machines, imagem, métricas e regiões. | `iad` (Ashburn) aproxima do banco; `gru` (São Paulo) aproxima clientes mas deixa o DB nos EUA e adiciona latência entre regiões. | Secrets criptografados no app e injetados em runtime, health checks e rolling deploy; rollback é novo deploy de imagem anterior e não reverte migrations/config/secrets. | Cobrança baseada em Machines/CPU/memória/tráfego/armazenamento; estimar com uso medido. Mais carga operacional que Vercel/Render. |

**Recomendação:** manter Vercel Pro/`iad1` como primeira opção para avaliação do proprietário: native Next e co-localização aproximada com o Supabase atual reduzem operação e round trips ao banco. Não contratar nem configurar. Render/Virginia é alternativa regional comparável se o proprietário preferir serviço Node contínuo. Fly.io é opção se a equipe aceitar operação de Machines e houver motivo para escolher `iad` ou `gru`. Se a residência de dados no Brasil for requisito, compute em São Paulo sozinho não resolve; seria necessário decidir e autorizar um projeto Supabase `sa-east-1` separado e uma migração.

Fontes oficiais consultadas em 23/11/2026: [Next.js/Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [regiões Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region), [planos Vercel](https://vercel.com/docs/plans/hobby), [Next.js no Render](https://render.com/docs/deploy-nextjs-app), [regiões Render](https://render.com/docs/regions), [custom domains/rollback Render](https://render.com/docs/custom-domains), [Next.js no Fly.io](https://fly.io/docs/js/frameworks/nextjs), [regiões Fly.io](https://fly.io/docs/reference/regions), [secrets Fly.io](https://fly.io/docs/apps/secrets) e [backups Supabase](https://supabase.com/docs/guides/platform/backups). Valores e disponibilidade podem mudar; confirmar com o fornecedor antes de assumir compromisso.

## E. Revisão jurídica e privacidade pendente

As páginas `/privacidade` e `/termos` estão públicas, mas não são versões aprovadas para operação comercial. Não alterei texto contratual em I1. Inventário para jurídico:

- política/termos: finalidades e bases legais por finalidade, dados coletados e públicos, suporte, cookies, WhatsApp, anúncios futuros, limitações e duração;
- papéis: avaliar barbearia como controladora da agenda/clientes, LPS como operadora em determinados fluxos, e LPS como controladora independente para conta, segurança, operação financeira e suporte;
- direitos: canal público de titular/encarregado/responsável, autenticação da solicitação, prazo/resposta, correção, acesso, portabilidade, bloqueio e exclusão, exceções e retenção legal;
- inventário de dados: conta, profissionais/fotos, clientes, telefones, horários/reservas/avaliações e dados administrativos/financeiros; retenção, backups, descarte e suboperadores;
- transferências: projeto Supabase em US East (EUA); avaliar mecanismo e cláusulas da Resolução ANPD 19/2024 e contratos/termos do host, SMTP, logs e outros fornecedores;
- incidentes: papel de controlador/operador, comunicação entre LPS/barbearia, preservação de evidências, contato, ANPD/titulares conforme Resolução 15/2024; definir encarregado ou responsável e plantão;
- ECA Digital: a reserva pública é acessível sem conta e pode ser usada por menores. O jurídico deve analisar o teste de “acesso provável”, melhor interesse, riscos/idade, transparência e obrigações aplicáveis. Não implementar coleta/verificação de idade sem escopo jurídico e minimização de dados.

Fontes oficiais consideradas: [LGPD compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [Lei 15.352/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15352.htm), [ECA Digital](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm), [guia ANPD de fornecedores (28/10/2026)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-fornecedores-de-produtos-ou-servicos-de-tecnologia-da-informacao.pdf/@@display-file/file), [direitos do titular](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares), [Res. 15/2024 incidentes](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024), [Res. 18/2024 encarregado](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-18-de-16-de-julho-de-2024-572632074), [Res. 19/2024 transferência internacional](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024), [guia ANPD para pequenos agentes — Res. 2/2022](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022).

## F. Pendências e bloqueios do lançamento

| ID | Severidade | Impacto | Responsável necessário | Evidência atual | Próxima ação | Critério verificável de conclusão |
| --- | --- | --- | --- | --- | --- | --- |
| I1-SEC-01 | **P1 imediato (local)** | Chave local `service_role` aceita por 3 Supabase locais; RLS bypass e portas Docker em todas as interfaces. Conteúdo de `lps-agenda_local` não foi classificado. | Proprietário + DevOps/endpoint owner | HMAC local demonstrativo; 3 probes REST `200`; host remoto rejeitou; nenhum Next listener; firewall externo não verificado. | Aprovar contenção de rede e rotação por stack, preservando volumes e invalidando sessões antigas; depois atualizar os ambientes QA sem ecoar chaves. | Chave antiga rejeitada nos 3 projetos; novas chaves distintas funcionam; firewall/port binding revisado; dados/backups contados antes/depois; QA passa. |
| I1-SEC-02 | **P1, bloqueia uso hospedado** | Serviço server/admin não tem credencial válida configurada no ambiente testado. | Proprietário Supabase + DevOps | PostgREST hosted rejeitou a chave local; metadata confirma secret/publishable da mesma conta; valor não revelado. | Obter secret key pelo Settings > API Keys no projeto correto e injetar no secret store do host; nenhum valor por chat. | URL/chave de mesmo projeto; zero-row GET e Auth Admin sintético passam em staging; bundle não contém secret; logs redigidos. |
| I1-KEY-03 | **P1, prazo 2026** | Supabase documenta depreciação de `anon`/`service_role` até o fim de 2026. O código ainda usa nomes de variável legados. | Proprietário + DevOps/desenvolvedor | Uma chave `sb_secret` e uma `sb_publishable` já aparecem no metadata hospedado; SDK local validou `sb_secret`; nenhuma chave hosted instalada/testada. | Planejar migration de config/API keys em QA; secret pode ser entregue pelo env server-only atual após teste; inventariar integrações antes de desativar legacy. | Public/secret keys testadas em host de staging; Next, Auth Admin e todas as integrações documentadas passam; chave legacy só é desativada com aprovação e consumers mapeados. |
| I1-INF-01 | **P1, bloqueia lançamento** | Sem host/domínio/HTTPS final, callbacks e material QR não têm origem de produção. | Proprietário + DevOps | Nenhum provedor/domínio escolhido; origem `.env.local` é loopback; região Supabase US East. | Aprovar provedor/região/orçamento, domínio e DNS; configurar preview sem auto-deploy. | HTTPS público, headers, redirects Auth, build/QR e smoke sintético validados sem produção financeira. |
| I1-AUTH-01 | **P1, bloqueia cadastro real** | Sem SMTP verificado; o serviço default não atende destinatários gerais e é limitado/best-effort. HIBP protection exige Pro+. | Proprietário + provedor SMTP + Supabase admin | Signup/recovery passaram apenas em Mailpit; Auth hospedado e plano não verificados. | Contratar/selecionar SMTP, autenticar domínio, configurar callbacks/templates/rate limit/CAPTCHA e verificar plano para leaked-password protection. | Confirmação e recovery reais entregues em endereços de teste autorizados, SPF/DKIM/DMARC pass, proteção de senha definida e alertas/limites definidos. |
| I1-BCP-01 | **P1, bloqueia dados reais** | Não há evidência de backup restaurável, retenção, PITR, RPO/RTO ou cópia de Storage. | Proprietário + Supabase admin + DevOps | Plano não aparece em metadata; nenhum restore/backup foi ensaiado. | Confirmar plano/add-ons e políticas no Dashboard; decidir export off-site e Storage backup separado; ensaiar restore em projeto isolado. | Evidência da última cópia, retenção, Storage, restore test e RPO/RTO aceitos. |
| I1-PRIV-01 | **P1, bloqueia dados reais** | Canais de direitos/exclusão não estão prontos; papéis, transferência US, termos e ECA Digital não aprovados. | Jurídico/privacidade + proprietário | Páginas atuais explicitam canais/fluxos pendentes; Supabase `us-east-1`; não houve revisão jurídica. | Aprovar inventário e textos finais, contratos, base legal, retenção, transferências e análise ECA. | Termos/política publicados e aprovados; canal de titular funcional; procedimentos e responsável definidos. |
| I1-FIN-01 | **P1 para cobrar/automatizar** | Sem responsáveis substitutos, executor, segredo, heartbeat/alertas ou plantão. | Gestor financeiro + proprietário + DevOps | RPCs/worker passaram em QA; hosted flags off e 0 operadores; executor não provisionado. | Nomear gestor/substituto e operador; aprovar executor psql/TLS, acesso mínimo, schedule, alertas e reconciliação. | Runbook ensaiado com acesso restrito, alertas recebidos e owner approval; worker segue off até janela separada. |
| I1-COM-01 | **P1 comercial** | Sem domínio final, suporte e responsável de cobrança; destinatário WhatsApp ainda não validado humanamente. | Proprietário + comercial | Link e mensagens passaram sem envio; identidade não verificada em aparelho. | Definir suporte, SLA, conferente e canal; validar WhatsApp no aparelho da empresa. | Contatos publicados, responsáveis substitutos e destinatário confirmados. |
| I1-ACQ-01 | **P1 operacional** | Flags do trial desligam o trial, não todo signup/Server Action; não há kill switch global para aquisição. | Proprietário + DevOps | Fluxos de conta legado permanecem fora da flag de trial; runbook H recomenda WAF/manutenção. | Escolher e ensaiar regra de manutenção/WAF para bloquear signup e onboarding POST sem quebrar login/admin. | Exercício reversível demonstrando bloqueio imediato, propagação e restauração de login/suporte. |
| I1-WA-02 | **P2** | Link correto não prova que o número pertence à LPS. | Responsável comercial | Link `wa.me` validado em QA, sem envio real. | Conferir no aparelho corporativo. | Confirmação documentada; mensagem continua sendo enviada somente pela pessoa usuária. |

## Checklist técnico para a próxima fase

- [ ] Aprovar e executar, em janela local, contenção/rotação do segredo demo nas três stacks sem descartar volumes.
- [ ] Proprietário confirmar o plano Supabase e backup/PITR/Storage no Dashboard.
- [ ] Proprietário aprovar provedor, plano, domínio e custo; recomendação técnica é Vercel Pro/IAD1, decisão não tomada.
- [ ] Criar ambiente de preview sem auto-deploy e configurar secrets por painel, nunca por chat.
- [ ] Usar chaves publishable/secret do projeto correto; testar SDK/Server Actions/Auth Admin em staging e mapear legacy key consumers.
- [ ] Configurar SMTP e DNS e testar confirmação/recovery com destinatários autorizados.
- [ ] Aprovar política/termos/canais, papéis e avaliação ECA/transferência internacional.
- [ ] Criar backups verificáveis, restaurar em novo projeto e definir monitoramento/alertas.
- [ ] Designar suporte, gestor, substituto, operador e plantonista; ensaiar kill switch de aquisição.
- [ ] Manter onboarding, worker, `pg_cron`, cobrança e AdSense desligados até autorizações próprias.
- [ ] Rodar smoke sintético no domínio final somente após autorização explícita de deploy; classificar os resultados e atualizar a decisão do NO-GO.

## Fontes técnicas oficiais consultadas em 23/11/2026

- Supabase: [API keys/rotação](https://supabase.com/docs/guides/getting-started/api-keys), [migração para publishable/secret](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [rotacionar chave comprometida](https://supabase.com/docs/guides/security/rotate-leaked-api-keys), [Supabase local CLI/config](https://supabase.com/docs/guides/local-development/cli/config), [SMTP customizado](https://supabase.com/docs/guides/auth/auth-smtp), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security), [backups/PITR](https://supabase.com/docs/guides/platform/backups), [regiões](https://supabase.com/docs/guides/platform/regions).
- Hospedagem: [Next.js/Vercel regions](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel Hobby/Pro](https://vercel.com/docs/plans/hobby), [Vercel pricing](https://vercel.com/pricing), [Next.js/Render](https://render.com/docs/deploy-nextjs-app), [Render regions](https://render.com/docs/regions), [Render rollbacks](https://render.com/docs/rollbacks), [Next.js/Fly.io](https://fly.io/docs/js/frameworks/nextjs), [Fly regions](https://fly.io/docs/reference/regions), [Fly secrets](https://fly.io/docs/apps/secrets), [Fly health checks](https://fly.io/docs/reference/health-checks).
