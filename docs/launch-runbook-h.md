# LPS Agenda — runbook de preparação operacional (Fase H)

**Atualizado em:** 23/11/2026
**Este documento prepara uma futura janela; nenhum passo de ativação foi executado.**

## 1. Donos, autorização e pré-condições

Antes de planejar uma janela, registrar responsáveis nominados (não apenas funções):

- proprietário que autoriza hospedagem, domínio, deploy e liberação comercial;
- operação/infraestrutura que mantém host, secrets, DNS, SMTP, backup e monitoramento;
- gestor financeiro e substituto que conciliam cada recebimento;
- responsável por executar e monitorar o worker externo;
- responsável por suporte e canal para titulares/privacidade;
- jurídico/responsável de privacidade que aprova termos, política e contratos.

Obter aprovação escrita para cada mudança reversível ou financeira. Esta Fase H não autoriza cobrança, confirmação de Pix, onboarding, worker, anúncios, migrations hospedadas nem deploy.

## 2. Hospedagem e domínio

1. Escolher provedor compatível com a versão fixada Next.js 16.4.5/Node e documentar região, runtime Node, limites, processo de build, logs, suporte, plano de continuidade e contato de incidente. Não presumir Vercel.
2. Escolher domínio oficial e configurar DNS, certificado HTTPS, canonical/origin. Testar redirects HTTP→HTTPS e headers no destino; definir a estratégia de manutenção/WAF.
3. Configurar a origem raiz em `NEXT_PUBLIC_APP_URL` antes do build. O valor é usado em metadados, callbacks e material QR; build feito com localhost não serve para cartaz definitivo. Uma troca de domínio exige recompilar e emitir QR novo.
4. Testar a origem a partir de celular/rede externa, registrar certificado e validar redirects. Não comprar domínio/contratar plano como parte desta Fase H.

## 3. Variáveis e segredos

Injetar valores por secret manager/ambiente do host; não gravar secrets em Git, logs, argumentos de terminal, browser bundle, relatório ou `.env.local`.

| Variável | Tratamento antes da janela |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto hospedado aprovado. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do mesmo projeto; validar Auth health e origem. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server-only válido do mesmo projeto; conferir leitura de zero linhas em staging. Nunca prefixar `NEXT_PUBLIC_`. A chave local atual foi rejeitada e não é fonte de produção. |
| `NEXT_PUBLIC_APP_URL` | Origem HTTPS definitiva; definir antes do build. |
| `LPS_COMMERCIAL_WHATSAPP` | Número canônico aprovado; a validação automática só comprova formato. |
| `MANUAL_TRIAL_ONBOARDING_ENABLED` | Manter `false` até aprovação de aquisição e homologação do runbook. |
| Asaas legada (`ASAAS_ENV`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`) | Só preencher se operação legada exigir; manter sandbox onde aplicável e não iniciar cobranças novas nesta fase. Não usar credenciais como fallback. |
| `BILLING_CRON_SECRET` | Apenas para endpoints legados autorizados; não reutilizar no executor PostgreSQL. |
| `ADSENSE_*` | Manter os gates `false`/não configurados enquanto a monetização estiver pendente. |
| SMTP | Configuração do provedor Auth/Supabase, não segredo público do Next. Guardar credenciais e domínio remetente no ambiente apropriado. |

No build, `NEXT_PUBLIC_*` pode ser incorporado ao bundle. Antes de cada build, verificar host/URL e examinar bundles para garantir ausência de service role, Asaas, cron, SMTP e outros segredos. A `.env.local` atual aponta para Supabase hospedado e tem URL de aplicação local; não rodar teste de escrita com esse arquivo carregado. Usar QA local explicitamente.

## 4. Supabase e Auth

1. Confirmar projeto de destino por URL, chave pública, Auth health e conexão administrativa de leitura. Uma falha de chave aborta a janela; não copiar a chave local atual.
2. Confirmar a lista ordenada de migrations e comparar com a release. O snapshot H hospedado é 29 migrations até `20261120180000`. Não executar `db push`, reset, migration ou mudança manual de schema sem ticket, backup, aprovação, janela e QA descartável.
3. Configurar `Site URL` e allowlist exata de callback e recovery para `https://<domínio>/auth/callback`; revisar templates de confirmação/recuperação e evitar redirects wildcard. Nunca desabilitar confirmação de e-mail para facilitar cadastro.
4. Configurar SMTP confiável, domínio remetente, SPF, DKIM e DMARC; conferir bounce, limites, alertas e entrega em destinatários de teste. Mailpit em loopback serve só para QA. Testar signup, confirmação, reenvio e recuperação no domínio autorizado.
5. Rever proteção contra senhas vazadas (advisor atual desativado), política de senha, rate limits e sessão. Repetir teste de Auth e proteção de rota após configuração.
6. Verificar RLS, grants, ACL de funções e Storage após qualquer migration. Não conceder papel administrativo como fallback; bootstrap financeiro não é para ser repetido.

## 5. Pré-ativação e aquisição

Antes de abrir campanhas, completar o checklist de `docs/launch-readiness-h.md`. A oferta de 168 horas depende de decisão comercial e de duas gates independentes. Se aprovada futuramente:

1. Registrar ticket, responsável, valor anterior e janela; testar em QA descartável o signup, confirmação, uma reserva sintética e o limite Básico.
2. Habilitar `MANUAL_TRIAL_ONBOARDING_ENABLED=true` em todas as instâncias Next, validar versão e secrets; habilitar `private.manual_trial_activation.enabled` por último, sob aprovação e procedimento de mudança.
3. Repetir snapshot, observar primeiro cadastro sintético autorizado e confirmar 168 horas/limite. Não criar dados de cliente real para smoke test.
4. Em rollback, desligar primeiro a flag de banco e depois a de todas as instâncias Next; confirmar os dois estados sem apagar cadastros/histórico.

**Desativação emergencial de aquisição:** não há uma única flag de aplicação que encerre todo cadastro de conta e bloqueie todas as tentativas de Server Action. As flags do trial controlam o onboarding manual, não equivalem a bloqueio global de aquisição. Antes da abertura, o responsável pelo host deve configurar e ensaiar manutenção/WAF/roteamento para bloquear signup e submissão de onboarding (incluindo POST Server Actions), preservando login e suporte quando possível. Alternativa: rollback para uma release previamente validada. Não confiar apenas em remover CTA ou desligar trial.

## 6. Fluxo financeiro manual

- A LPS combina plano, preço, cobertura, competência, vencimento e condições fora do sistema; o gestor/operador registra o acordo autenticado em `/admin/assinaturas`.
- Emitir mensalidade por competência no painel. A emissão registra título; não inicia cobrança bancária automática.
- Confirmar Pix somente após conferência independente do crédito integral no extrato oficial. Comprovante do cliente não é confirmação. Registrar referência e seguir idempotência/auditoria do fluxo.
- Não misturar pagamentos dos serviços da barbearia com mensalidades da plataforma. Não alterar, converter ou limpar histórico Asaas/manual para corrigir aparência.
- Para atraso, seguir as regras validadas: primeiro vencimento não concede carência; contrato anteriormente ativo pode ter 72 horas; reprocessamento não reinicia o período; pagamentos antigos não quitam competência nova; suspensão/cancelamento preservam bloqueios.
- Nomear conferente, substituto, canal bancário, rotina de conciliação, escalonamento e retenção de evidências antes de qualquer cobrança real.

## 7. Worker e inadimplência

O worker é externo via `psql`/TLS. Não instalar `pg_cron` nem habilitar o worker nesta Fase H.

1. Provisionar executor restrito sem login humano ou `service_role`, com capacidade apenas de `SET ROLE lps_overdue_runner`; secret/passfile e CA em cofre, `sslmode=verify-full`, ACL e timeout.
2. Ensaiar `scripts/run-manual-overdue.sql` em QA local, incluindo disabled, lock concorrente, retry, falha parcial e código de saída. Agendamento futuro documentado em `docs/financial-go-live-e.md` a cada 5 minutos, somente após autorização.
3. Criar heartbeat, log sanitizado, alerta fora do worker para ausência de sucesso (>15 min com flag ligada), retries persistentes, falha de job, idade elegível crescente e estado `partial/failed/review`.
4. A flag começa desligada. Registrar mudança e valor anterior, habilitar em último lugar e acompanhar `/admin/assinaturas/saude` e `private.overdue_runs` por conexão autorizada.
5. Incidente: pausar agenda externa, desligar flag, esperar transação em curso, preservar log/auditoria, investigar SQLSTATE e só retomar com autorização. Revogar/rotacionar executor em suspeita de comprometimento.

## 8. WhatsApp, AdSense e comunicação

- O WhatsApp configurado é `5571999555390`. Os testes validaram URLs `https://wa.me/` e mensagens pré-preenchidas, sem enviá-las. Uma pessoa da LPS deve confirmar no dispositivo corporativo se o destinatário é realmente o da empresa.
- O produto altera estado interno de notificação/confirmação, mas não envia mensagens WhatsApp automaticamente.
- Manter AdSense desativado: sem Publisher ID, CMP, aprovação de domínio ou consentimento; não carregar script/anúncios. Política, CMP certificada e revisão jurídica futuras são pré-condição apenas para a monetização publicitária, não para lançar agenda sem anúncios.

## 9. Backup, observabilidade e recuperação

Antes de escolher o plano hospedado, obter evidência de retenção de backup, RPO/RTO, PITR disponível, região e limites. Criar responsável e alertas para Auth/email, Next HTTP 5xx, Postgres, Storage, jobs/worker, webhook legado e financeiro. Configurar logs com retenção e acesso restritos, sem cookies, JWT, e-mails, telefones, dados Pix ou payloads.

Fazer ensaio de restauração em projeto isolado, verificar migrations, RLS, buckets e integridade do ledger antes de aceitar cliente. Documentar passos e aprovações do provedor. Não presumir backups automáticos nem testar restore sobre produção.

Rollback de código: manter artefato/release anterior, fazer rollback somente após identificar regressão e verificar compatibilidade de schema. Não usar rollback destrutivo de migrations e não excluir histórico. Em incidente financeiro, interromper novas ações, preservar eventos, reconciliar com extrato e escalar ao gestor.

## 10. Incidentes e titulares

Antes do lançamento, jurídico/privacidade deve aprovar canal público de privacidade, encarregado ou responsável e procedimento de confirmação, acesso, correção, bloqueio, portabilidade e exclusão, considerando retenções legais/financeiras. Para incidente, conter sem apagar evidências, identificar barbearia/controlador, operador e fornecedores, avaliar titulares/dados/risco, registrar timeline, acionar o responsável jurídico e seguir a Resolução ANPD 15/2024 e demais normas vigentes; não prometer prazo ou dispensa sem confirmar enquadramento legal.

## 11. Checklist da janela futura

- [ ] Decisão escrita do proprietário: domínio, host, deploy e data.
- [ ] Credenciais verificadas no secret manager; build para a origem final.
- [ ] Auth callback, confirmação, recovery e SMTP real verificados.
- [ ] Domínio HTTPS, DNS, headers e monitoramento validados.
- [ ] Backup/PITR, restauração e plano de recuperação ensaiados.
- [ ] Jurídico aprova política, termos, papéis, contrato, canais e análise ECA Digital.
- [ ] Senhas vazadas/segurança Auth avaliadas; advisor e rota de mitigação revisados.
- [ ] Responsáveis de suporte, privacidade, financeiro, operação e plantão designados.
- [ ] WhatsApp conferido humanamente; acquisition kill switch/WAF ensaiado.
- [ ] Financeiro: acordo e Pix reais ainda desligados até ordem separada; executor e alertas em aprovação própria.
- [ ] Onboarding manual, worker, `pg_cron` e AdSense permanecem desligados, salvo autorizações específicas posteriores.
- [ ] Depois de deploy explicitamente aprovado, smoke test sintético concluído e assinado antes da primeira barbearia real.
