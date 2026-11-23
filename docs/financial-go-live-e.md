# Fase E · preparação da operação Pix

> **Atualização operacional da Fase H — 23/11/2026.** O inventário datado de 20/11 abaixo é histórico e foi preservado; não deve ser usado como snapshot atual. A consulta hospedada somente de leitura confirmou 29 migrations até `20261120180000`, 1 gestor e 0 operadores; não há trial, acordo manual, mensalidade, Pix confirmado, assinatura Asaas vigente, conflito de origem, item de conciliação/retentativa/compensação, fila de webhook ou `pg_cron`. As flags de onboarding e do executor seguem desligadas. No catálogo, 22/22 tabelas públicas têm RLS, não há privilégio efetivo de tabela para `anon`, e o bucket de fotos é privado. O resumo de segurança encontrou 25 funções públicas `SECURITY DEFINER`: 20 executáveis por `authenticated`, nenhuma por `anon`, todas com `search_path` vazio; os avisos de execução autenticada correspondem a RPCs intencionais com autorização interna e foram exercitados em QA.
>
> A rodada de advisors também apontou proteção contra senhas vazadas desativada e um aviso de plano de inicialização RLS (desempenho). O primeiro exige decisão/configuração no Auth hospedado antes do lançamento; o segundo requer acompanhamento de desempenho, não uma alteração automática. A chave administrativa atualmente disponível na configuração local foi rejeitada pelo PostgREST hospedado e não foi alterada; ela não pode ser considerada credencial de produção. `NEXT_PUBLIC_APP_URL` local é loopback. Hospedagem/domínio e SMTP hospedado continuam sem confirmação. Nenhuma escrita financeira, ativação, migration hospedada ou deploy foi realizada na Fase H.

> A comunicação do trial foi corrigida para informar 168 horas no Básico, sujeitas à liberação da LPS Solutions e com 1 profissional; o cadastro de conta não inicia o teste automaticamente. Consulte `docs/launch-readiness-h.md`, `docs/launch-test-results-h.md` e `docs/launch-runbook-h.md` para a decisão e as evidências atuais.

**Decisão operacional em 20/11/2026: NO-GO para cobrança real.** A mudança de código pode ser publicada separadamente. A LPS Solutions deve registrar a aprovação de ambiente, responsáveis e horário antes de qualquer ativação.

## Inventário por ambiente

A leitura do projeto hospedado `nphxqqbiyudoxntfmiur` foi feita com a opção `--read-only` da CLI. O relatório pode ser repetido antes de cada janela:

```powershell
node_modules\.bin\supabase.cmd db query --remote=nphxqqbiyudoxntfmiur --read-only --file scripts/financial-preflight.sql
node_modules\.bin\supabase.cmd db query --remote=nphxqqbiyudoxntfmiur --read-only --file scripts/financial-reconciliation.sql
```

A primeira consulta funciona desde a migration 26 e conta o conjunto completo. A segunda identifica por barbearia e contrato a origem, o estado, o histórico misto, a sobreposição e os recebimentos posteriores ao encerramento. Guarde os identificadores apenas no registro restrito de conciliação. No ambiente de destino confira também a origem da aplicação e o histórico ordenado de migrations contra o Git.

| Verificação hospedada | Resultado |
| --- | --- |
| Migrations | 26, última `20261120142304`. A 27, `20261120160000_financial_cutover_health.sql`, depende de aplicação futura autorizada. |
| Concessões ativas | 1 gestor, 0 operadores adicionais. |
| Carteira | 0 contratos/assinaturas Asaas ou manuais, 0 trials, 0 mensalidades de plataforma, 0 Pix confirmados. |
| Conciliação e auditoria | 0 origens mistas, contratos atuais duplicados, atrasos manuais, suspensões, pendências de conciliação, baixas posteriores detectadas ou itens na fila de retentativa. Nenhum registro no diário financeiro ou na auditoria `manual_billing.*`. |
| Legado | 0 eventos Asaas, 0 compensações abertas, 0 cobranças Asaas abertas. Webhooks e compensações continuam disponíveis para histórico legítimo. |
| Ativação | Flag privada de trial desligada. Sem extensão ou schema de pg_cron. Nenhum login de aplicação com acesso ao papel B2-B do worker. Agendamentos em fornecedores externos devem ser conferidos com infraestrutura. |

No Next local o onboarding segue desligado por padrão. Na QA descartável a cadeia de 27 migrations inclui os objetos do worker, com seu controle desligado. O modo automático de emissão mensal não existe. Preços do catálogo, contratos e concessões hospedados não foram alterados.

## Canal comercial e cadastro

O número aprovado é **+55 71 99955-5390**. Configure `LPS_COMMERCIAL_WHATSAPP=5571999555390` no ambiente do **processo Next.js** e reinicie/reimplante somente em janela autorizada. Em desenvolvimento use o arquivo local ignorado pelo Git. A variável não leva prefixo público nem vai nos secrets do Supabase. Valide no HTML e no navegador os três planos e o contato geral, com origem `https://wa.me`, caminho `/5571999555390` e apenas o parâmetro `text`. A mensagem fica pronta para revisão. A equipe comercial precisa confirmar a identidade do destinatário em um dispositivo com WhatsApp antes da abertura. Em configuração ausente ou inválida, a vitrine indica canal pendente.

1. O cadastro normal cria a identidade. Com confirmação de e-mail habilitada, o cliente confirma pelo link oficial, faz login e acessa o onboarding. Confira SMTP, URLs permitidas, retorno de confirmação e entrega real na janela de liberação.
2. O trial Básico exige o plano ativo com limite de um profissional, e-mail confirmado conforme a configuração de Auth, sessão válida e as duas ativações. O servidor autoriza a intenção por um minuto, vinculada à identidade e aos dados canônicos. O PostgreSQL cria a barbearia, o vínculo de proprietário e um único trial na mesma transação.
3. Para ativação futura, registre ticket, responsável, referência da migration e valores anteriores. Abra uma janela curta para os novos cadastros, configure primeiro `MANUAL_TRIAL_ONBOARDING_ENABLED=true` em todas as instâncias Next, valide a versão e habilite por último `private.manual_trial_activation.enabled` via infraestrutura. Durante o desencontro das flags, o fluxo manual pode recusar o cadastro. Teste login, confirmação, cadastro, uma reserva sintética e o limite de profissionais em QA antes da janela.
4. Um envio repetido deve reutilizar a intenção e o slug. Em resposta perdida, reabra o formulário na mesma sessão e repita os dados. A RPC recupera a barbearia original do proprietário. Em outra aba, verifique primeiro os vínculos existentes antes de usar outro slug. Não duplique trial, contrato ou usuário para reparar resposta perdida.
5. Em rollback, desabilite primeiro a flag no banco, depois a do Next em todas as instâncias e confirme ambos os estados. Um cadastro já confirmado mantém o histórico. O trial termina no instante de início mais **168 horas** no PostgreSQL. Depois desse instante ficam bloqueados novos agendamentos e as reservas anteriores permanecem consultáveis. A continuidade depende da negociação comercial.

## Modelo de operação e conciliação

| Etapa | Ação e autoridade |
| --- | --- |
| Proposta | O cliente escolhe o plano e conversa com a LPS Solutions. O contato e o cadastro não criam títulos nem pagadores Asaas. |
| Acordo | Gestor ou operador autorizado em `/admin/assinaturas` registra preço em centavos, primeira competência, cobertura, fuso, âncoras, vencimento e referência da negociação. A barbearia precisa ter adesão manual elegível. |
| Mensalidade | A equipe emite cada competência pelo painel. O banco preserva o valor acordado, usa o vencimento inicial explícito e ajusta as âncoras ao último dia civil do mês, no fuso do contrato. Um índice único e o bloqueio do contrato fazem emissões concorrentes convergirem. Pode-se recuperar título já emitido. Contrato cancelado, suspenso ou em conciliação impede nova emissão. Uma competência cuja cobertura ainda não começou é recusada. |
| Pix | O operador localiza o crédito **integral** no extrato, confere valor, competência e instante e registra a confirmação explícita. O comprovante enviado pelo cliente é insuficiente. Uma baixa repetida preserva a identidade e a auditoria. Conferir uma parcela antiga não quita dívida posterior. |
| Atraso | Primeira parcela vencida em contrato pendente pode ficar vencida sem liberar agenda. Para contrato anteriormente ativo, a transição efetiva inicia **72 horas** de carência. Nova parcela e reexecução não renovam o prazo. Processamento atrasado não estende trial ou período pago. Suspensão e cancelamento continuam bloqueando as operações incompatíveis. |

Novas contratações não têm entrada de checkout no Asaas. A retomada exige assinatura Asaas pendente do mesmo plano, referência persistida, evidência da tentativa/vínculo e condições contratadas. A operação usa o lease no banco. Registros sem evidência ou com referências remotas ambíguas exigem revisão. As proteções de conversão de origem, histórico terminal, webhook, outbox e compensação continuam ativas. O cron de finalização de trials Asaas trata exclusivamente o legado dessa origem.

Ao encontrar combinação Asaas/manual, sobreposição, baixa após encerramento, pagamento sem correspondência ou job em revisão, **pause a contratação afetada**. Registre os IDs existentes, datas, competência, gateway, evidência bancária, cobertura e responsável. Confirme junto aos dois lados a inexistência de cobrança e cobertura duplicadas. Histórico misto bloqueia novos acordos e títulos manuais para esse tenant. Não há comando de conversão nesta entrega. Uma decisão de migração individual precisa de aprovação administrativa e procedimento específico de retenção de evidências.

## Worker de atraso e monitoramento

A opção escolhida é um agendador externo executando **psql sobre TLS** em conexão direta ou pool de sessão. Isso evita instalar pg_cron no projeto e mantém o processamento fora do HTTP público. Reserve um executor com cliente PostgreSQL, rede autorizada, cofre, supervisão e alertas. O custo operacional depende do executor, da frequência, das conexões e do volume de varredura. Meça no ambiente de destino. Emissão continua manual. Um futuro emissor recorrente precisará de identidade separada, critérios de competência e homologação própria.

**Somente após aprovação da infraestrutura:**

1. Provisione um login técnico sem privilégios administrativos, sem herança, exclusivamente com autorização para `SET ROLE lps_overdue_runner`. Nenhuma credencial humana, service role, identidade proprietária do banco ou associação ao papel B2-B `lps_manual_overdue_worker` deve estar no agendador. A migration cria apenas um papel sem login. A rotina B2-B de lote mantém o contrato histórico restrito. O novo papel técnico só pode invocar a entrada supervisionada.
2. Registre o destino em `pg_service.conf` e a senha em secret/passfile com ACL exclusiva. Configure `sslmode=verify-full`, CA confiável, nome do host, `connect_timeout=5` e timeout externo de 40 s. Proíba logs de DSN, senha, cabeçalhos, JWT, documentos, dados Pix e payload de webhook. Não informe senhas na linha de comando.
3. Após uma execução em QA, agende a cada **5 minutos**: `psql -X --no-password --dbname=service=lps_overdue --file=scripts/run-manual-overdue.sql`. Verifique o projeto e o usuário técnico antes de habilitar `private.overdue_schedule`. No ticket, registre o valor prévio. A alteração aprovada deve atualizar `enabled` e `changed_at=clock_timestamp()` juntas. Lote do script: 50 (limite 100), timeout SQL 25 s, espera por locks limitada. A flag nasce falsa.
4. Cada acionamento obtém um advisory lock transacional. Execução concorrente retorna `busy`; o lote usa `FOR UPDATE SKIP LOCKED` sobre parcelas/contratos. A auditoria de transição e a alteração da parcela compartilham a transação. Falha de um item reverte esse item, guarda SQLSTATE e nova tentativa após um minuto. `partial` e `failed` são confirmados no histórico antes do código de saída de falha. Uma queda de conexão, cancelamento ou timeout que aborte toda a transação pode deixar **somente** o registro do executor. Preserve esse log sanitizado e alerte por ausência de sucesso.
5. Monitore `/admin/assinaturas/saude`. A página mostra última execução e sucesso, itens processados e execuções com falhas em 24 h, idade da parcela elegível mais antiga, retentativas, contratos em atraso, conciliação, origens mistas, compensações e flags. Examine falhas recentes na conexão de infraestrutura com `select started_at,finished_at,outcome,processed,failed,error_state from private.overdue_runs order by finished_at desc limit 20`. `eligible` respeita a janela de retentativa; uma fila em espera pode existir sem parcela imediatamente elegível.
6. Configure alertas **fora do processo do worker** para saída de erro, heartbeat sem sucesso por mais de 15 min com a flag ligada, retries persistentes, idade elegível crescente e jobs de compensação em revisão. Separe `disabled` planejado de `stale`. Valide a entrega do alerta interrompendo o executor na QA. Defina responsável de plantão e retenção dos logs antes da ativação. Reiniciar o agendador não deve iniciar outro prazo de carência.

**Incidente.** Pause o agendador, desabilite a flag e aguarde a transação em andamento. Confira os contadores e o último commit no banco. Inspecione SQLSTATE e auditoria por competência em canal restrito. Resolva a causa e reexecute um lote no alvo autorizado. Em suspeita de comprometimento, revogue o acesso técnico e rotacione o segredo antes de retomar. Parar o executor é reversível; uma transição ou baixa confirmada permanece no histórico e exige conciliação, nunca edição direta ou exclusão.

## Revisão de segurança

O Next valida a identidade com Supabase Auth. O PostgreSQL verifica a concessão ativa em cada RPC financeira. `finance_health()` tem `search_path` vazio, dono técnico sem login e acesso a uma projeção agregada. As tabelas, as credenciais do worker e os payloads privados não são expostos no PostgREST. O canal comercial só compõe links. Webhook Asaas e crons legados conservam seus segredos independentes; não reutilize nenhum deles no executor. Separe chave pública, chave de serviço necessária ao servidor, credenciais Asaas legadas, segredo do cron legado e credencial PostgreSQL do runner no cofre.

Advisors de segurança no hospedado: **18 avisos** de funções `SECURITY DEFINER` executáveis por `authenticated` e **1 aviso** de proteção contra senhas comprometidas desabilitada. As RPCs que exigem sessão, propriedade ou concessão financeira continuam com validação interna e projeção restrita; a execução de funções pelos usuários aos quais se destinam é deliberada. O inventário encontrou **zero tabelas públicas sem RLS**. O schema privado usa grants e papéis específicos; não houve liberação geral. Rever a proteção de senha no Supabase Auth, o plano contratado e a decisão do responsável antes do lançamento. Repetir advisors, revisar os grants da 27 e repetir testes negativos após a aplicação autorizada.

## Checklist de liberação

| Critério | Evidência atual | Condição para GO |
| --- | --- | --- |
| Painel e responsáveis | Acesso de gestor/operador testado em QA com sessão real. Um gestor ativo no hospedado. | Gestor confirma login e página de saúde no ambiente final. |
| Atendimento | Número aprovado e quatro links validados no Next; envio depende do cliente. | Equipe confirma o destinatário no dispositivo de atendimento. |
| Schema e inventário | 26 no hospedado; 27 em QA. Inventário e relatório por tenant disponíveis. | Aplicar 27 em janela aprovada, repetir inventário, resolver ou manter bloqueados os conflitos. |
| Cadastro e trial | Testes transacionais, HTTP, concorrência, expiração e recuperação em QA. Flags hospedadas não foram ativadas. | Validar entrega de e-mail e URLs finais. Aprovar janela e ordem das duas flags. |
| Mensalidade e Pix | Emissão, calendário, baixa integral, suspensão e concorrência homologados com registros sintéticos. | Nomear conferente, canal bancário e procedimento de emissão por competência. |
| Worker e alertas | Execução, bloqueio concorrente, retry, falha parcial e detecção de heartbeat homologados em QA. | Provisionar executor/segredo, observar teste, entregar alerta ao plantão e registrar retenção. |
| Reversão e segurança | Procedimentos acima. Nenhum cliente convertido. | Responsável revisa avisos Auth, recuperação, backup e evidência do último ensaio. |

**Reversíveis:** publicação de configuração comercial, interrupção do executor e desativação das flags. **Com efeito financeiro ou sobre o acesso:** registro de acordo, emissão, confirmação de Pix, início da carência, suspensão, cancelamento e migração de cliente. Cada uma exige decisão e trilha próprias. Desconto retroativo, ajuste de título emitido, pagamento parcial ou excedente, antecipação sem competência, dias extras e reativação sem cobertura permanecem pendentes de política comercial.

## Reprodução em QA

Use stacks descartáveis com IDs e portas exclusivos. No caminho de upgrade insira a fixture `tests/postgres/manual-billing-legacy.sql` após a migration 19, aplique as demais e confira a comparação das linhas em `manual-billing.sql`. Em banco limpo execute primeiro `tests/postgres/financial-cutover.sql` e depois as suítes C2, C1, B2-B, B1 e B2-A documentadas. O ensaio da Fase E usa uma transação revertida e uma segunda sessão dblink para a disputa do lock.

Na stack de aplicação descrita na Fase D, habilite a confirmação de e-mail em Auth, use Mailpit local na porta 59124 e permita o callback do Next na origem de QA `http://127.0.0.1:59130`. Compile o Next para as chaves da própria QA e execute os ensaios HTTP `financial-cutover.mjs`, `commercial-phase-d.mjs`, `c2-dashboard-http.mjs`, `c1-finance-http.mjs` e `manual-trial-http.mjs` em sequência. `b2b-data-api.mjs` usa a stack e a porta exclusivas da B2-B. Complete com `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`. Nenhuma dessas verificações autoriza o início da operação comercial.


**Evidências da execução.** A instalação limpa passou por 12 suítes PostgreSQL. O ensaio de atualização preservou os registros Asaas e de serviços inseridos na versão 19. Foram exercitados cadastro com confirmação por e-mail local e callback PKCE, sessões de proprietário e gestor, isolamento HTTP, calendário (744 comparações), retentativas, os quatro links comerciais e a abertura do link oficial do Básico no Chrome. O script do agendador foi executado por uma conexão TCP de QA com login técnico restrito, incluindo recusa de senha inválida e da flag desligada. A entrega de e-mail e de alertas no ambiente hospedado e a identidade do destinatário do WhatsApp ainda exigem conferência operacional.
