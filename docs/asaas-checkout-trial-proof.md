# Prova técnica: Checkout recorrente e trial de sete dias

**Status:** preparada para revisão; não executada. Este teste é isolado do fluxo de contratação do LPS Agenda. Não cria assinatura no banco local, não aplica migration e não chama `POST /subscriptions`.

## Limites e segurança

- O modo padrão do script é offline: não consulta Supabase nem Asaas.
- No modo offline, os callbacks usam deliberadamente `http://localhost:3000/dashboard/plano?...` como demonstração; esse valor não serve para executar um Checkout real no Sandbox.
- Somente `--execute-sandbox` autoriza uma leitura do plano no Supabase e um único `POST https://api-sandbox.asaas.com/v3/checkouts`.
- Como a documentação diverge sobre `nextDueDate`, a execução também exige `--confirm-date-semantics` e uma escolha explícita de formato.
- A URL Sandbox é constante no script; não há opção para substituir o host. `getAsaasEnv()` valida a configuração server-side existente e falha se o ambiente não for Sandbox.
- A execução também falha se `VERCEL_ENV=production`; use um terminal local ou ambiente de teste aprovado.
- No modo Sandbox, os callbacks usam somente a origem de `NEXT_PUBLIC_APP_URL` e os caminhos fixos de sucesso/cancelamento/expiração; não há opção de callback na CLI. A validação rejeita HTTP, IP literal (incluindo loopback e redes privadas), localhost/sufixos locais ou reservados, hostname inválido, credenciais e porta não padrão. Ela não faz DNS lookup: confirme manualmente que a origem é um domínio público de teste/staging aprovado e não aponta a um endereço privado.
- Em execução local, confirme também que `NEXT_PUBLIC_APP_URL` não é o domínio de produção. O script bloqueia `VERCEL_ENV=production`, mas não consegue inferir se uma URL HTTPS configurada localmente pertence à produção.
- O script não carrega `.env.local` nem usa `dotenv`. Injete as variáveis por um gerenciador de segredos ou ambiente de execução aprovado; não as inclua no comando ou no histórico do terminal.
- O customer ID é lido de `ASAAS_CHECKOUT_PROOF_CUSTOMER_ID`; o valor não é impresso. Ele precisa apontar para um customer de teste já existente na mesma conta Sandbox.
- O `service_role` é usado somente para um `SELECT` de plano no modo explícito. Não há escrita no Supabase.
- O script não aceita nem envia `creditCard`, número, CVV ou token de cartão. O pagador insere os dados apenas na página hospedada pelo Asaas.
- O link retornado pode permitir acesso à sessão: só é mostrado com `--show-checkout-link`; não o grave em logs compartilhados.
- Não há retry automático. Cada execução cria uma `externalReference` nova. Se a chamada terminar em timeout ou resultado incerto, reconcilie a referência nos logs/recursos Sandbox antes de executar novamente; não há garantia documentada de busca de Checkout por referência.

## Pré-requisitos para execução manual

O processo precisa receber, por configuração segura:

- `ASAAS_ENV`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, validados por `getAsaasEnv()`;
- `ASAAS_CHECKOUT_PROOF_CUSTOMER_ID`, com um customer de teste existente no Sandbox;
- `NEXT_PUBLIC_APP_URL`, com o domínio público HTTPS do projeto;
- as variáveis Supabase já usadas pelo projeto, pois a execução explícita consulta o catálogo.

Use Node com suporte a `--experimental-strip-types` e ao condition `react-server` (o ambiente atual usa Node 26). O condition permite importar a configuração server-only existente sem carregar módulos do lado cliente.

### Simulação offline (padrão)

```powershell
node --conditions=react-server --experimental-strip-types scripts/asaas-checkout-trial-proof.mjs --plan-code basico
```

Outros códigos atuais: `profissional` e `premium`. A simulação mostra as datas/callbacks e os campos planejados, mas não inventa nem consulta o preço. O preço real é lido do plano ativo do catálogo somente com `--execute-sandbox`.

### Criar um Checkout no Sandbox

```powershell
node --conditions=react-server --experimental-strip-types scripts/asaas-checkout-trial-proof.mjs --plan-code basico --execute-sandbox --confirm-date-semantics --next-due-date-format date --show-checkout-link
```

O início padrão é o instante da execução. `--trial-start` aceita apenas um ISO-8601 com `Z` ou offset explícito. No modo de execução o script bloqueia trials futuros, trials já vencidos e datas de vencimento que caiam hoje ou no passado em São Paulo; isso evita criar um Checkout cuja primeira cobrança possa ser processada imediatamente.

O script só aceita plano ativo em BRL, mensal e com `trial_days = 7`; usa `price_cents` do banco e mapeia `month` para `MONTHLY`. A criação envia `billingTypes: ["CREDIT_CARD"]`, `chargeTypes: ["RECURRENT"]`, `subscription.nextDueDate`, `minutesToExpire: 60`, customer ID existente, callbacks do projeto e uma `externalReference` UUID nova.

### Comparação controlada dos dois formatos documentados

O formato padrão `date` envia `YYYY-MM-DD`, conforme a referência OpenAPI. O guia recorrente mostra também um exemplo `YYYY-MM-DD HH:mm:ss`, sem offset; o script disponibiliza esse candidato como `guide-datetime`. Para testá-lo, depois de encerrar/limpar a primeira tentativa e revisar o resultado:

```powershell
node --conditions=react-server --experimental-strip-types scripts/asaas-checkout-trial-proof.mjs --plan-code basico --execute-sandbox --confirm-date-semantics --next-due-date-format guide-datetime --show-checkout-link
```

Não execute os dois comandos em sequência sem concluir e limpar cada prova. `guide-datetime` é um formato a verificar, não uma afirmação de que o endpoint o aceite ou interprete como horário de São Paulo.

O `POST /checkouts` cria a sessão; não confirma pagamento nem, por si só, cobra o cartão. Depois da criação, o pagador ainda precisa concluir a sessão no link do Sandbox. O script não cancela automaticamente os recursos criados.

## Precisão de `nextDueDate`

O script calcula `trialEndAt = trialStartAt + 7 × 24 horas`, seguindo a duração absoluta do código atual. `src/features/billing/service.ts` guarda esse instante em `trial_ends_at` e inicialmente deriva `next_due_date` com `dateOnlyInSaoPaulo`. Porém, `src/features/billing/trial.ts#claimPayload` volta a definir `next_due_date` com a data da execução que reivindica o trial. Como o cron está diário em `vercel.json`, a finalização e a data local podem ocorrer depois de `trial_ends_at`. Esta prova isolada calcula a data prevista diretamente do início de referência e não altera o cron.

O modo `date` reproduz a redução à data civil em `America/Sao_Paulo`; o modo `guide-datetime` envia a hora de parede local, sem offset, para comparação controlada.

**A semântica exata não pode ser confirmada somente pela documentação pública consultada.** A referência OpenAPI de `POST /v3/checkouts` define `subscription.nextDueDate` como string `format: date`; a referência de criação de assinatura também usa `format: date`. Já o guia de Checkout recorrente mostra um exemplo `2027-01-31 15:02:38`, sem timezone. A documentação não diz se o endpoint aceita o componente de hora, se o preserva ou descarta, nem qual fuso aplica.

O evento de exemplo de Checkout serializa `nextDueDate` como `2024-10-31T03:00:00+0000`. Esse horário é compatível com meia-noite em UTC−03 naquela data, mas é somente um exemplo de payload; não define a regra de processamento nem o instante em que a tentativa de cartão acontece. Não há timezone explicitamente definido para a entrada `date-only` na documentação consultada.

Consequentemente, o cálculo atual pode antecipar ou atrasar a tentativa em relação ao timestamp de `trial_ends_at`: `date-only` perde a hora e só fixa o dia civil; o processamento pode acontecer em algum momento desse dia. Se o Asaas interpretar a data como início do dia local, pode haver cobrança antes do horário final do trial; se o processamento ocorrer depois, pode haver atraso. A documentação não permite quantificar ou excluir esses casos. Não se deve afirmar precisão de 168 horas.

O FAQ de assinaturas também informa que as cobranças podem ser geradas antes do vencimento (40 dias por padrão, com configurações de 14 ou 7 dias). Portanto, `PAYMENT_CREATED` pode aparecer durante o trial para uma cobrança com vencimento futuro; isso não significa captura. Para o critério “sem cobrança antecipada”, valide ausência de `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` antes do vencimento e compare `dueDate`/timestamps. O FAQ diz que a tentativa de cartão ocorre na data de vencimento e que vencimento no dia atual pode ser processado imediatamente, mas não especifica a hora exata.

### Como comprovar no Sandbox

1. Use início conhecido com hora não nula; anote `trialStartAt`, `trialEndAt` UTC e o horário local de São Paulo.
2. Crie e conclua um Checkout com `date`; observe `nextDueDate` recebido em `CHECKOUT_*`, `SUBSCRIPTION_CREATED`/consulta da assinatura e `PAYMENT_CREATED.dueDate`.
3. Após limpar os recursos, crie uma segunda sessão com `guide-datetime`. Verifique se o POST aceita o formato, como o Asaas normaliza o valor e se o instante aparece preservado nos eventos/assinatura.
4. Acompanhe a cobrança até o vencimento. `PAYMENT_CREATED` não é confirmação; verifique `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` e seus timestamps. A prova do instante financeiro requer aguardar a data programada; não altere o vencimento para acelerar o teste.
5. Compare os valores efetivos e offsets com `trial_ends_at`. Se qualquer tentativa financeira ocorrer antes desse timestamp, o requisito de sete dias exatos falha. Se só houver vencimento por data, a decisão comercial precisa aceitar uma regra de data civil ou o fluxo não pode ser considerado comprovado para precisão horária.

## Observação dos eventos e correlação

Não se deve presumir ordem global entre eventos de Checkout, assinatura e cobrança. A documentação descreve cada recurso e uma sequência conceitual, mas a prova deve registrar o que efetivamente chegou, incluindo `event.id` e `dateCreated`.

| Evento | O que observar | Correlação esperada |
|---|---|---|
| `CHECKOUT_CREATED` | `checkout.id`, `checkout.status` e referência, quando presente | `checkout.id` deve ser o ID retornado pelo `POST`; conferir a `externalReference` UUID gerada. |
| `CHECKOUT_PAID` | `checkout.id` e status `PAID` | Conclusão da jornada Checkout; não assumir que, com primeira data futura, significa que uma cobrança recorrente já foi liquidada. |
| `SUBSCRIPTION_CREATED` | `subscription.id`, `externalReference`, `status` e `checkoutSession`, se enviado | `checkoutSession` deve apontar para `checkout.id`. Verificar se a referência do Checkout também é propagada para a assinatura; não presumir essa cópia. |
| `PAYMENT_CREATED` | `payment.id`, `payment.subscription`, `dueDate`, `billingType` e status | `payment.subscription` deve ser o `subscription.id`; `dueDate` deve coincidir com o vencimento programado. O Asaas documenta geração antecipada de cobranças (40 dias por padrão, configurável para 14/7); uma cobrança criada/pendente não significa captura nem pagamento confirmado. |
| `PAYMENT_CONFIRMED` | IDs, status, `dueDate` e datas de confirmação | Confirmação financeira da cobrança correspondente. Não deve ocorrer antes do vencimento programado. |
| `PAYMENT_RECEIVED` | IDs, status e datas financeiras | Recebimento/compensação da cobrança; observar a diferença temporal em relação a `PAYMENT_CONFIRMED`. |
| `PAYMENT_OVERDUE` | `payment.id`, status e vencimento | A cobrança venceu sem pagamento; não confundir com cancelamento do Checkout. |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_AUTHORIZED` | Estado da tentativa e `payment.id` | Recusa, análise de risco ou autorização não devem ser tratadas automaticamente como pagamento liquidado. |
| Reembolso/chargeback (`PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_*`, entre outros) | Status financeiro e vínculo com a cobrança | Registrar como ciclo da cobrança; não como evento de Checkout ou criação de assinatura. |

Documentado: o Checkout tem `CHECKOUT_CREATED/PAID/CANCELED/EXPIRED`; a assinatura tem eventos próprios; cada cobrança recorrente tem seu ciclo `PAYMENT_*`; a cobrança possui o campo `subscription`. O schema de assinatura do Asaas também expõe `checkoutSession` na referência da API.

Precisa ser comprovado no Sandbox: se `CHECKOUT_PAID` chega quando a sessão é concluída com a primeira cobrança futura; se há `PAYMENT_CREATED` imediatamente ou apenas perto do vencimento; a ordem entre `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED` e `PAYMENT_*`; e quais campos de referência/`checkoutSession` aparecem nos payloads efetivamente enviados.

Registre somente IDs de evento, Checkout, assinatura e cobrança, `externalReference`, statuses, datas, preço e ciclo. Não copie payload bruto com objeto de cartão, token, dados pessoais ou credenciais. Prefira os logs de webhook do Sandbox ou um receptor de teste isolado e controlado. A rota atual `src/app/api/webhooks/asaas/route.ts` aceita o JSON, mas `processAsaasEvent` trata `CHECKOUT_*` como desconhecido e o marca `ignored`; isso comprova entrega, não integração nem correlação funcional.

## Limpeza manual e explícita do Sandbox

Guarde os IDs exatos mostrados pelo teste. Não remova o customer: ele pode ser compartilhado por outros testes. Antes de executar qualquer limpeza, confirme que a conta e os IDs são do Sandbox e consulte o estado exato dos recursos.

No PowerShell, usando a variável de ambiente já injetada (sem escrever a chave no comando):

```powershell
$baseUrl = "https://api-sandbox.asaas.com/v3"
$headers = @{ access_token = $env:ASAAS_API_KEY }
$checkoutId = "<ID_EXATO_DO_CHECKOUT>"
$subscriptionId = "<ID_EXATO_DA_ASSINATURA>"

# Somente se esse Checkout específico ainda estiver ACTIVE:
Invoke-RestMethod -Method Post -Uri "$baseUrl/checkouts/$checkoutId/cancel" -Headers $headers

# Somente se essa assinatura específica foi criada pelo teste:
Invoke-RestMethod -Method Delete -Uri "$baseUrl/subscriptions/$subscriptionId" -Headers $headers
```

O cancelamento da assinatura impede recorrências futuras, mas não é reembolso de um pagamento já confirmado. Não solicite reembolso automaticamente. Depois, confira os eventos de cancelamento/remoção e confirme que não há recorrência de teste ativa. Se o Checkout estiver `PAID`, use o `subscription.id` relacionado pelo `checkoutSession`; não selecione assinaturas apenas pelo customer.

## Impactos no fluxo de trial atual (ainda não implementados)

- `finalizeExpiredTrials` reivindica trials vencidos e `finalizeCandidate` chama `ensureRemoteSubscription`. Se o Checkout terminar durante o trial, o webhook futuro deve associar a assinatura remota ao mesmo registro local antes do cron. Com `gateway_subscription_id` preenchido, `ensureRemoteSubscription` consulta e persiste a assinatura existente, em vez de criar outra.
- O cron do trial permanece como está e é agendado diariamente em `vercel.json`; um Checkout ainda pendente ou um webhook atrasado pode coincidir com a execução. A integração futura precisa fencing/reconciliação para que o finalizador aguarde a sessão ou adote a assinatura criada por ela.
- A proteção não pode depender apenas disso: `applySubscriptionEvent` hoje procura pelo ID da assinatura e depois por `externalReference`; não usa `checkoutSession`. Se a referência do Checkout não for propagada, o evento pode não encontrar o trial local. Sem vínculo, o cron pode chamar `POST /subscriptions` e criar uma segunda assinatura. O futuro finalizador precisa reconciliar o Checkout/assinatura antes de permitir a criação direta.
- `processAsaasEvent` não processa `CHECKOUT_*`. `applyPaymentEvent` e `applySubscriptionEvent` retornam `ignored` quando ainda não encontram o registro local; eventos `ignored` não são reivindicados para nova tentativa por uma repetição com o mesmo ID. A correlação precisa estar persistida antes dos eventos ou exigir reconciliação/retry explícito.
- Se o pagador concluir o Checkout durante o trial, o estado local deve continuar `trialing`; `SUBSCRIPTION_CREATED` apenas vincula a recorrência. A ativação ocorre somente com confirmação financeira da primeira cobrança, não pela URL de retorno.
- Checkout abandonado/expirado/cancelado precisa atualizar uma sessão local e não deve levar o cron a criar silenciosamente uma recorrência duplicada ou mudar de método. A política no vencimento deve ser definida: novo Checkout/ação do proprietário ou fallback comercial explicitamente aprovado.
- Se o trial local for cancelado enquanto existir Checkout ativo, a rotina atual de cancelamento local não conhece a sessão e não a invalida. A integração futura precisa cancelar Checkout e assinatura por IDs exatos, com fencing/outbox para falhas e eventos tardios.
- Uma recusa na primeira cobrança após o trial deve manter a assinatura local não ativa, registrar falha, iniciar `past_due`/carência pela regra existente e liberar o acesso somente quando chegar confirmação financeira. Atualizar cartão sem uma cobrança confirmada não deve reativar.

## Critérios para aprovar a prova

1. O Checkout aceito no Sandbox tem somente `CREDIT_CARD` e `RECURRENT`, usa o preço ativo do catálogo e devolve ID/link do host Sandbox.
2. A conclusão antes do vencimento cria uma assinatura remota ligada ao Checkout; `checkoutSession`, `externalReference` e os IDs são correlacionáveis sem depender apenas do customer.
3. O formato e timezone aceitos para `nextDueDate` estão comprovados; a primeira cobrança tem `dueDate` igual ao valor programado; `PAYMENT_CREATED` pendente não é confundido com liquidação; não ocorre `PAYMENT_CONFIRMED/RECEIVED` antes de `trial_ends_at`.
4. A primeira cobrança após a data programada confirma o ciclo; o vencimento seguinte respeita `MONTHLY`.
5. Todos os eventos são observados com IDs e timestamps reais, sem pressupor ordem. A distinção entre conclusão do Checkout, criação de assinatura e confirmação financeira fica comprovada.
6. O produto aprova explicitamente a precisão comprovada. Um `nextDueDate` date-only não pode ser descrito como instante exato de 168 horas.
7. Checkout e assinatura de teste são cancelados pelos IDs exatos; não sobra recorrência futura, e nenhum recurso de outro customer é tocado.

## Referências oficiais

- [Checkout recorrente](https://docs.asaas.com/docs/checkout-with-subscription-recurring)
- [Referência de criação de Checkout](https://docs.asaas.com/reference/create-new-checkout)
- [FAQ de assinaturas: primeira cobrança em `nextDueDate`](https://docs.asaas.com/docs/subscriptions-faq)
- [Eventos de Checkout](https://docs.asaas.com/docs/checkout-events)
- [Eventos de assinatura](https://docs.asaas.com/docs/subscription-events)
- [Eventos de pagamento](https://docs.asaas.com/docs/payment-events)
- [Cancelar Checkout](https://docs.asaas.com/reference/cancel-a-checkout)
- [Assinaturas por cartão](https://docs.asaas.com/docs/subscriptions-via-credit-card)
