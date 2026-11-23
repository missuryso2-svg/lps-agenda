# LPS Agenda — runbook operacional de preparação (Fases H/I1 — Vercel)

**Atualizado em:** 23/11/2026
**Decisão de hospedagem:** Vercel exclusivamente; Supabase hospedado existente preservado.
**Estado:** prepara futura janela; conta/projeto Vercel e domínio não configurados; nenhum deploy/ativação foi executado.

## 1. Donos, autorização e pré-condições

Antes de planejar uma janela, registrar responsáveis nominados (não apenas funções):

- proprietário que autoriza hospedagem, domínio, deploy e liberação comercial;
- operação/infraestrutura que mantém host, secrets, DNS, SMTP, backup e monitoramento;
- gestor financeiro e substituto que conciliam cada recebimento;
- responsável por executar e monitorar o worker externo;
- responsável por suporte e canal para titulares/privacidade;
- jurídico/responsável de privacidade que aprova termos, política e contratos.

Obter aprovação escrita para cada mudança reversível ou financeira. Esta Fase H não autoriza cobrança, confirmação de Pix, onboarding, worker, anúncios, migrations hospedadas nem deploy.

O repositório é `missuryso2-svg/lps-agenda`, branch de produção pretendida `main`. A verificação local não encontrou `.vercel/`/link de projeto nem token Vercel; não se confirmou projeto remoto. A configuração versionada em `vercel.json` fixa `iad1`, não agenda `crons` e define `git.deploymentEnabled=false`. Isso não cancela Cron Jobs de deployments existentes nem bloqueia deploys manuais/CLI/API. Se a equipe já tiver projeto, conferir jobs e deployments no Dashboard antes de qualquer futura publicação.

## 2. Vercel — conta, projeto e gate de deployment

### Plano e acesso

1. O proprietário cria/usa a conta corporativa da LPS Solutions, ativa MFA e cria uma Team. Restringir Owners/Billing/Members e manter acesso de leitura para demais pessoas quando suficiente. Não usar conta ou projeto de terceiros.
2. **Pro é o plano recomendado para uso comercial**, sujeito à aprovação do proprietário. Consulta oficial de 23/11/2026: taxa Pro de **US$20/mês**, 1 assento com permissão de deploy incluído e US$20/mês de crédito de uso; cada assento adicional Owner/Member custa US$20/mês; Viewer é gratuito e ilimitado. Valores em USD, antes de impostos. Crédito mensal é compartilhado entre recursos gerenciados; o uso que exceder o crédito passa a on-demand. Pro não é um teto de gasto. Não iniciar teste Pro nem assinatura nesta fase.
3. Antes de cadastrar pagamento, projetar consumo e aprovar budget. Confirmar se o On-Demand Budget padrão informado pela Vercel (US$200 para novas equipes) está configurado, seu owner e quem recebe as notificações. Configurar alertas Web/e-mail 50/75/100% e, se autorizado, SMS a 100%. Vercel pode verificar o limite com atraso de minutos; alertas não impedem consumo. Habilitar pausa automática só após ponderar a interrupção de produção e obter aprovação explícita. Assentos/add-ons podem ser cobrados à parte.
4. Não habilitar Password Protection (US$20/mês por projeto Pro), Observability Plus (uso por evento), Log Drains, domains ou outros add-ons sem estimativa e aprovação próprias. Vercel Authentication para proteger Preview está incluída; preferi-la para colaboração interna.

### Importação e build — somente após autorização do primeiro deployment

**Não importar/conectar o GitHub nesta fase.** A documentação Vercel diz que o primeiro deployment de um projeto novo é sempre Production, mesmo que a origem seja importação GitHub, branch não-main ou tentativa de Preview. O primeiro deployment usa variáveis Production. Não clicar **Import/Deploy**, nem rodar `vercel`, `vercel deploy`, `vercel --prod`, API ou Deploy Hook sem aprovação escrita da janela que aceita esse primeiro deployment. `git.deploymentEnabled=false` bloqueia deployments automáticos de commit Git, mas não bloqueia esses mecanismos manuais nem o primeiro deployment.

Quando a janela de primeiro deploy for autorizada:

1. Usar integração GitHub com acesso mínimo somente ao repo `missuryso2-svg/lps-agenda`; selecionar o root `/`, conferir preset **Next.js** e Production Branch `main`.
2. Usar Node.js `26.x` (o build isolado foi validado localmente em `v26.13.0` e Vercel o lista como LTS default), ou outra LTS Vercel aprovada após testes com a mesma major. Next.js 16.4.5 exige Node `>=20.9.0`, porém Node 20 foi retirado da Vercel em 01/10/2026; versões disponíveis documentadas na data: 22.x, 24.x e 26.x.
3. Preservar o lockfile npm e as configurações automáticas do framework. `package.json` define `build: next build`; comando de build `npm run build`; preset Next.js detecta output e servidor. Não selecionar `Other`, output estático nem configurar `npm start` na Vercel.
4. Antes do clique em Deploy, preparar por Dashboard as variáveis Production e a proteção disponível na criação. Se a importação tentar iniciar o primeiro deployment antes que proteções, domínio e segredos possam ser revisados, cancelar/adiar e solicitar orientação ao Vercel Owner; não publicar para “testar”. O primeiro deployment é Production mesmo quando vier de branch diferente de `main`.
5. Após criar o projeto em janela autorizada, conferir `main` como Production Branch e manter deployments Git desligados em todas as branches, tanto em `vercel.json` quanto no Dashboard. Revisar GitHub Actions, Deploy Hooks, CLI e API. Só reabilitar automação após procedimento de PR/CI, aprovação, gate de promoção e rollback documentado; a tarefa atual não os habilita.

### Preview, região, requisições e segurança

- Manter Preview e URLs imutáveis de deployment protegidos por **Vercel Authentication**; testar sem sessão/acesso autorizado. Standard Protection protege previews/deploy URLs, mas não domínios Production. Não compartilhar links de bypass. Password Protection no Pro custa US$20/mês por projeto e exige autorização separada.
- Usar `iad1` como região única das Functions, perto do Supabase `us-east-1` (Northern Virginia); arquivos estáticos são servidos pela CDN global. Confirmar região no Dashboard. Supabase mantém sua própria residência/região e não muda por essa configuração.
- Pro suporta até 5 regiões de Functions, mas esta arquitetura usa uma. Fluid Compute: default de 300 s, máximo Pro 800 s, 1.800 s em Beta; 2 GB/1 vCPU default, até 4 GB/2 vCPU. Request/response de Function até 4,5 MB normalmente; 20 MiB está em Beta com configuração extra. Next Server Actions têm limite de body default 1 MB. Não elevar esses limites sem teste/aprovação.
- Functions escalam automaticamente; não há um único limite de RPS para toda aplicação. Acompanhar invocações, CPU/memória, requests/CDN, transferência e chamadas ao Supabase; concorrência máxima publicada não é SLA nem teste de capacidade. Pro cobra CPU ativa, memória provisionada e invocações via crédito e depois on-demand.
- O tier inicial de Flat Rate CDN do Pro tem capacidade publicada de 1 milhão de CDN requests e 1 TB de transferência/mês; confirmar no Dashboard a cobrança de excedentes/tiers. Function invocations são uso medido Pro e consomem o crédito mensal antes de cobrança on-demand.
- Sem QA Supabase isolado, não configurar credenciais em Preview e não gerar deployment Preview funcional. Nunca usar Production service key, URL ou dados em branch Preview.

## 3. Domínio e HTTPS

1. Domínio ainda não foi escolhido/comprado. O proprietário deve confirmar titularidade e canonical host; esta execução não compra nem altera DNS.
2. Depois de projeto e domínio aprovados, adicionar hostname em **Project → Settings → Domains**, aplicar somente os registros DNS recomendados pela Vercel e preservar registros MX/TXT já usados por e-mail/validações. Não mudar nameservers sem inventário e autorização.
3. Confirmar DNS, TLS provisionado pela Vercel, certificado válido, canonical host, redirect HTTP→HTTPS e security headers em rede externa/celular; definir manutenção/WAF e estratégia de restauração.
4. `NEXT_PUBLIC_APP_URL` deve ser a origem HTTPS final (sem path) antes do build que gere metadados, callback e QR Code. Não usar o fallback localhost nem `*.vercel.app` em QR de produção. Trocar o domínio exige novo build e reemissão/validação física do QR.

## 4. Variáveis e segredos

Cadastrar valores no Dashboard Vercel, com escopos independentes **Production**, **Preview** e **Development**. Usar tipo **Secret** para credenciais e **Config** para valores públicos/de configuração; Vercel criptografa em repouso, mas pessoas com permissão do projeto podem acessar ou usar variáveis no deployment. Alterações valem apenas para deployments novos.

| Variável | Production | Preview | Development | Tratamento |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase hospedado aprovado | URL de Supabase QA isolado; se não existir, sem Preview funcional | URL do Supabase local QA | Pública/config; URL e key devem pertencer ao mesmo projeto. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave publishable pública do mesmo projeto (nome de variável legado) | Chave pública do projeto QA | Chave pública local QA | Pública, incluída no bundle. Nunca substituir pela chave administrativa. |
| `SUPABASE_SERVICE_ROLE_KEY` | Valor `sb_secret` do projeto correto, inserido diretamente como Secret server-only, após autorização | Apenas chave administrativa do QA isolado; se ausente, não expor rotas que dependem dela | Chave local QA única e rotacionada; não usar o token potencialmente exposto | Segredo crítico; nunca `NEXT_PUBLIC_`, chat, Git, logs ou fallback de outro projeto. O valor local atual foi rejeitado pelo Supabase hospedado. |
| `NEXT_PUBLIC_APP_URL` | Origem HTTPS definitiva, sem path, definida antes do build/QR | Origem estável de QA com callback correspondente; se não houver, deixar Preview desativado | `http://localhost:3000` | Pública; não deixar fallback localhost no deployment final. |
| `LPS_COMMERCIAL_WHATSAPP` | Número comercial aprovado | Contato QA ou institucional aprovado | Valor de QA/contato aprovado | Configuração não secreta; link fica visível. Validar titularidade no aparelho corporativo. |
| `MANUAL_TRIAL_ONBOARDING_ENABLED` | `false` | `false` | `false` por padrão | Não habilitar sem autorização; a flag de DB é independente e também deve continuar off. |
| `ASAAS_ENV` | Ausente (default `sandbox`) | Somente `sandbox`, em QA financeiro isolado e aprovado | Somente `sandbox` em QA local aprovado | O schema atual não aceita modo live. Não configurar integração em Production nesta fase. |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Ausentes | Somente sandbox em QA autorizado | Somente sandbox em QA autorizado | Secrets opcionais para rota legada; não provisionar agora. Webhook token exige 32–255 caracteres e valor aleatório. |
| `BILLING_CRON_SECRET`, `CRON_SECRET` | Ausentes | Ausentes salvo teste financeiro isolado autorizado | Ausentes por padrão | Segredos condicionais, mínimo 32 caracteres; sem `crons` no repositório e sem schedule nesta fase. |
| `ADSENSE_ENABLED`, `ADSENSE_DOMAIN_APPROVED`, `ADSENSE_PRIVACY_REVIEWED`, `ADSENSE_CMP_READY` | `false` | `false` | `false` | Manter todos os gates fechados em todos os ambientes. |
| Demais `ADSENSE_*` | Vazios/ausentes | Vazios/ausentes | Vazios/ausentes | Não cadastrar publisher, slots, domínio, lojas ou CMP. |
| `CLOUDFLARE_TUNNEL_HOST` | Ausente | Ausente | Somente uso local excepcional | `NODE_ENV` e `VERCEL_*` são administrados pela plataforma; não copiar manualmente. |
| SMTP | Configurar no Supabase Auth, após autorização | Só no Supabase QA e com dados de teste | Mailpit/local QA | Não é variável pública do Next. Armazenar credenciais apenas no serviço autorizado. |

Secrets nunca devem ser impressos por build/runtime, incluídos em argumentos de terminal, relatório ou bundle. `NEXT_PUBLIC_*` é compilado para o browser durante `next build`; `NEXT_PUBLIC_APP_URL` e as duas variáveis Supabase públicas precisam estar corretas para o ambiente que se compila. Verificar bundles sem mostrar valores. Não executar `vercel env pull` antes de confirmar ambiente; grava `.env.local`. O `.env.local` atual aponta para Supabase hospedado, tem origem local e chave administrativa local rejeitada; não é fonte de produção nem fallback. Usar QA local explicitamente.

## 5. Supabase hospedado e Auth

1. Confirmar projeto de destino por URL, chave pública, Auth health e conexão administrativa de leitura. Uma falha de chave aborta a janela; não copiar a chave local atual.
2. Confirmar a lista ordenada de migrations e comparar com a release. O snapshot H hospedado é 29 migrations até `20261120180000`. Não executar `db push`, reset, migration ou mudança manual de schema sem ticket, backup, aprovação, janela e QA descartável.
3. Depois de autorização e domínio final, configurar **Site URL** como `https://<domínio>` e allowlist exata `https://<domínio>/auth/callback`. `src/app/auth/callback/route.ts` troca o `code` por sessão e verifica OTP de signup/recovery. O redirect de ações usa `NEXT_PUBLIC_APP_URL`; evitar wildcard de previews em Supabase Production.
4. Revisar templates de confirmação/recuperação, links, remetente e expiração. Nunca desabilitar confirmação de e-mail para facilitar cadastro.
5. Configurar SMTP transacional e autenticação DNS SPF/DKIM/DMARC; rever limites e alertas de envio. Testar enviar e receber confirmação, reenvio e recovery em endereços de teste autorizados. Mailpit em loopback serve apenas para QA.
6. Rever proteção contra senhas vazadas (advisor atual desativado e disponibilidade depende do plano Supabase), política de senha, rate limits e sessão. Repetir teste Auth e proteção de rotas depois da configuração.
7. Verificar RLS, grants, ACL de funções e Storage após qualquer migration. Não conceder papel administrativo como fallback; bootstrap financeiro não é para ser repetido.

Site URL, Redirect URLs, SMTP, templates, proteção contra senhas vazadas, usuários, keys e migrations hospedadas não foram modificados nesta execução. Toda alteração exige autorização do proprietário Supabase.

## 6. Pré-ativação e aquisição

Antes de abrir campanhas, completar o checklist de `docs/launch-readiness-h.md`. A oferta de 168 horas depende de decisão comercial e de duas gates independentes. Se aprovada futuramente:

1. Registrar ticket, responsável, valor anterior e janela; testar em QA descartável o signup, confirmação, uma reserva sintética e o limite Básico.
2. Habilitar `MANUAL_TRIAL_ONBOARDING_ENABLED=true` em todas as instâncias Next, validar versão e secrets; habilitar `private.manual_trial_activation.enabled` por último, sob aprovação e procedimento de mudança.
3. Repetir snapshot, observar primeiro cadastro sintético autorizado e confirmar 168 horas/limite. Não criar dados de cliente real para smoke test.
4. Em rollback, desligar primeiro a flag de banco e depois a de todas as instâncias Next; confirmar os dois estados sem apagar cadastros/histórico.

**Desativação emergencial de aquisição:** não há uma única flag de aplicação que encerre todo cadastro de conta e bloqueie todas as tentativas de Server Action. As flags do trial controlam o onboarding manual, não equivalem a bloqueio global de aquisição. Antes da abertura, o responsável pelo host deve configurar e ensaiar manutenção/WAF/roteamento para bloquear signup e submissão de onboarding (incluindo POST Server Actions), preservando login e suporte quando possível. Alternativa: rollback para uma release previamente validada. Não confiar apenas em remover CTA ou desligar trial.

## 7. Fluxo financeiro manual

- A LPS combina plano, preço, cobertura, competência, vencimento e condições fora do sistema; o gestor/operador registra o acordo autenticado em `/admin/assinaturas`.
- Emitir mensalidade por competência no painel. A emissão registra título; não inicia cobrança bancária automática.
- Confirmar Pix somente após conferência independente do crédito integral no extrato oficial. Comprovante do cliente não é confirmação. Registrar referência e seguir idempotência/auditoria do fluxo.
- Não misturar pagamentos dos serviços da barbearia com mensalidades da plataforma. Não alterar, converter ou limpar histórico Asaas/manual para corrigir aparência.
- Para atraso, seguir as regras validadas: primeiro vencimento não concede carência; contrato anteriormente ativo pode ter 72 horas; reprocessamento não reinicia o período; pagamentos antigos não quitam competência nova; suspensão/cancelamento preservam bloqueios.
- Nomear conferente, substituto, canal bancário, rotina de conciliação, escalonamento e retenção de evidências antes de qualquer cobrança real.

## 8. Worker e inadimplência

O worker é externo via `psql`/TLS. Não instalar `pg_cron` nem habilitar o worker nesta Fase H.

Separadamente, o cron Asaas legado `/api/cron/trial-finalization` permanece como rota protegida, mas **não** está agendado: `vercel.json` não declara `crons`, não configurar `CRON_SECRET`/`BILLING_CRON_SECRET` nem chamar a rota em produção nesta fase. A alteração no repositório não apaga jobs de um projeto Vercel já existente; o owner deve conferir no Dashboard e removê-los só com autorização apropriada. Qualquer rotina futura requer mudança/deploy aprovados, teste em QA, secret, owner financeiro e monitoramento.

1. Provisionar executor restrito sem login humano ou `service_role`, com capacidade apenas de `SET ROLE lps_overdue_runner`; secret/passfile e CA em cofre, `sslmode=verify-full`, ACL e timeout.
2. Ensaiar `scripts/run-manual-overdue.sql` em QA local, incluindo disabled, lock concorrente, retry, falha parcial e código de saída. Agendamento futuro documentado em `docs/financial-go-live-e.md` a cada 5 minutos, somente após autorização.
3. Criar heartbeat, log sanitizado, alerta fora do worker para ausência de sucesso (>15 min com flag ligada), retries persistentes, falha de job, idade elegível crescente e estado `partial/failed/review`.
4. A flag começa desligada. Registrar mudança e valor anterior, habilitar em último lugar e acompanhar `/admin/assinaturas/saude` e `private.overdue_runs` por conexão autorizada.
5. Incidente: pausar agenda externa, desligar flag, esperar transação em curso, preservar log/auditoria, investigar SQLSTATE e só retomar com autorização. Revogar/rotacionar executor em suspeita de comprometimento.

## 9. WhatsApp, AdSense e comunicação

- O WhatsApp configurado é `5571999555390`. Os testes validaram URLs `https://wa.me/` e mensagens pré-preenchidas, sem enviá-las. Uma pessoa da LPS deve confirmar no dispositivo corporativo se o destinatário é realmente o da empresa.
- O produto altera estado interno de notificação/confirmação, mas não envia mensagens WhatsApp automaticamente.
- Manter AdSense desativado: sem Publisher ID, CMP, aprovação de domínio ou consentimento; não carregar script/anúncios. Política, CMP certificada e revisão jurídica futuras são pré-condição apenas para a monetização publicitária, não para lançar agenda sem anúncios.

## 10. Backup, observabilidade e recuperação

Hospedagem escolhida: Vercel; plano Supabase e backups continuam sem confirmação. No Vercel Pro base, runtime logs têm retenção de 1 dia; Observability Plus oferece 30 dias, mas é add-on por evento (preço consultado: US$1,20 por milhão). Não habilitar add-on/Log Drains sem consentimento de custo e privacidade.

Antes de dados reais, nomear owner de observabilidade e configurar/ensaiar alertas de: HTTP 5xx e aumento de 4xx; latência/erros de Functions; invocações, CPU/memória, CDN/transferência e imagens; falhas Auth/SMTP, Supabase/Postgres/Storage; worker e financeiro (estes permanecem desligados). Configurar também Spend Management, destinatários e ações/limites aprovados; conferir Usage pelo menos semanalmente no início. Limites orçamentários podem ser verificados com atraso, e uma pausa automática reduz custo, mas pode derrubar o site.

Runtime/build logs e quaisquer exportações devem ter acesso restrito e nunca incluir secrets, cookies, JWTs, headers de autorização, e-mails, telefones, dados Pix, conteúdo de formulário ou payload integral. Não logar `process.env`; não presumir que a redação automática da Vercel esconda valores curtos ou dados pessoais. Definir retenção, acesso e procedimento de incidente para cada ferramenta.

Para Supabase, confirmar contrato/retention/PITR/Storage no Dashboard. Fazer ensaio de restauração em projeto isolado, verificar migrations, RLS, buckets e integridade do ledger antes de aceitar cliente. Não presumir backup automático nem testar restore sobre produção.

Rollback de código Vercel: registrar o último deployment **known-good** e, em incidente, apontar o domínio Production para um deployment anterior validado (Dashboard ou `vercel rollback` conforme acesso). Observar 5xx antes/depois e verificar rotas/Auth. Isso reverte somente o alias/código; não reverte migrations, dados, variáveis, credenciais, Auth settings, DNS ou add-ons. Verificar compatibilidade de schema antes do rollback; não usar migration destrutiva nem apagar histórico. Até existir deployment anterior saudável, o primeiro lançamento não tem rollback instantâneo — exigir plano de manutenção/contingência e autorização própria. Em incidente financeiro, interromper novas ações, preservar eventos, reconciliar com extrato e escalar ao gestor.

## 11. Incidentes e titulares

Antes do lançamento, jurídico/privacidade deve aprovar canal público de privacidade, encarregado ou responsável e procedimento de confirmação, acesso, correção, bloqueio, portabilidade e exclusão, considerando retenções legais/financeiras. Para incidente, conter sem apagar evidências, identificar barbearia/controlador, operador e fornecedores, avaliar titulares/dados/risco, registrar timeline, acionar o responsável jurídico e seguir a Resolução ANPD 15/2024 e demais normas vigentes; não prometer prazo ou dispensa sem confirmar enquadramento legal.

## 12. Checklist da janela futura

- [ ] Aprovação escrita do proprietário para conta/Team, Pro e orçamento Vercel; domínio e janela do primeiro deployment.
- [ ] Importação restrita ao repo `missuryso2-svg/lps-agenda`; branch Production `main`; confirmar preset Next.js, Node LTS validado, `npm run build`, `iad1` e Git deployments desligados.
- [ ] Verificar/proteger Preview e deployment URLs com Vercel Authentication; Supabase QA isolado, sem credenciais de Production ou bypass links públicos.
- [ ] Credenciais corretas do projeto Supabase verificadas e inseridas como Secrets server-only; validar URL/chave sem imprimir valores.
- [ ] `NEXT_PUBLIC_APP_URL` final HTTPS antes do build de produção e geração do QR.
- [ ] Site URL/Redirect URLs exatas, callback `/auth/callback`, templates e SMTP verificados com destinatários de teste autorizados; leaked-password protection decidida.
- [ ] Domínio HTTPS, DNS, certificado, headers, logs/alertas, spend budget/limite e proteção de acesso validados.
- [ ] Backup/PITR, restauração e plano de recuperação ensaiados.
- [ ] Jurídico aprova política, termos, papéis, contrato, canais e análise ECA Digital.
- [ ] Senhas vazadas/segurança Auth avaliadas; advisor e rota de mitigação revisados.
- [ ] Responsáveis de suporte, privacidade, financeiro, operação e plantão designados.
- [ ] WhatsApp conferido humanamente; acquisition kill switch/WAF ensaiado.
- [ ] First deployment, qualquer promoção de produção e domínio público explicitamente autorizados pelo owner; executar smoke sintético e assinatura de aceite antes de usuários reais.
- [ ] Financeiro: Asaas, Cron trial-finalization, billing-compensation, cobrança real, Pix, executor/worker e alertas seguem desligados até ordem separada.
- [ ] Onboarding manual, `pg_cron` e AdSense permanecem desligados; nenhuma variável/secrets de automação financeira criada.
