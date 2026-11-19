# B2-A2 · Onboarding e acesso durante o trial manual

O cadastro cria uma barbearia, o vínculo de proprietário e um trial do Básico na mesma transação PostgreSQL. A migração desta fase é `20261118140000_manual_trial_access.sql`, a 22ª. As instalações existentes conservam seu histórico, datas e origem. A B2-A2 acrescenta a leitura de cobertura paga para dados compatíveis com a B1. A emissão de mensalidades, a confirmação de Pix e o painel de administração global continuam no escopo das fases seguintes.

## Contrato de cadastro

O formulário guarda um UUID em `sessionStorage` antes de enviar a Server Action. A chave inclui usuário e slug normalizado. Duas submissões na mesma aba, uma recarga e uma resposta perdida reutilizam a intenção. Outra aba pode ter um UUID diferente. A unicidade do slug no banco impede que nasçam duas barbearias com aquele identificador. O formulário depende de armazenamento de sessão habilitado e guarda o identificador da tentativa até o fechamento da aba.

A action valida a sessão com Supabase Auth e valida nome, slug, telefone e fuso. Quando o fluxo manual está habilitado no servidor, ela chama `authorize_manual_trial_intent(p_actor, p_intent_id, p_name, p_slug, p_phone, p_timezone)` com o cliente administrativo e o usuário validado. Em seguida, usa a sessão do próprio usuário para chamar `create_barbershop_with_manual_trial(p_intent_id, p_name, p_slug, p_phone, p_timezone) → uuid`.

A autorização privada vale um minuto e fica vinculada a usuário, UUID e dados canônicos. O primeiro cadastro a consome dentro da transação. O advisory lock e a chave composta da B2-A1 fazem duas chamadas equivalentes devolverem o mesmo UUID. Uma falha de gravação desfaz também o consumo. Se a resposta se perder depois do commit, o proprietário ativo recupera o UUID original. Repetir não renova o trial. Uma colisão de slug retorna erro de campo, a falta do Básico ativo retorna indisponibilidade do plano e a recusa de ativação retorna indisponibilidade do cadastro. O cookie HTTP-only `lps.active_barbershop` e o redirecionamento para `/dashboard` seguem a confirmação do UUID.

| Flag privada Next | Flag privada PostgreSQL | Cadastro via aplicação |
|---|---|---|
| Desligada | Desligada | RPC legada e comportamento anterior. |
| Ligada | Desligada | O banco recusa a autorização do cadastro manual. |
| Desligada | Ligada | O banco recusa a RPC legada. |
| Ligada | Ligada | A action autoriza e o banco cria o trial transacional. |

A função pública legada preserva sua assinatura. Ela encaminha o papel dedicado da B2-A1 para a implementação privada original. O usuário autenticado passa por um caminho que exige a flag do banco desligada e mantém um lock de leitura da configuração até o commit. A implementação privada não tem EXECUTE para papéis de API. Um constraint trigger diferido também verifica, no fim de uma transação que cria barbearia com a flag ligada, se há intenção, proprietário e trial correspondentes. Isso protege um INSERT direto pela Data API, inclusive com o cliente administrativo. A flag fica em schema privado, sem operação pública de escrita. Uma autorização já emitida é uma operação em curso até seu consumo ou expiração. Desligar a flag no banco também barra seu consumo.

## Agenda e painel

O relógio do PostgreSQL determina o acesso na consulta de disponibilidade e novamente na gravação. O intervalo do trial inclui o início e exclui o fim. A regra usa o instante da tentativa de reservar. Um horário futuro pode ser reservado durante o trial. O encerramento preserva essa reserva.

| Situação | Decisão para nova reserva ou reagendamento protegido |
|---|---|
| Manual em teste | Permite desde o início até imediatamente antes de completar 168 horas. |
| Trial vencido, cancelado, expirado ou apenas histórico | Bloqueia. A falta de assinatura corrente não reabre a agenda. |
| Manual pendente ou cobertura ambígua | Bloqueia. Histórico manual com assinatura Asaas corrente exige conciliação. |
| Manual ativo com acordo | Exige período vigente e mensalidade paga da competência correspondente, com verificação registrada. |
| Manual em inadimplência | Exige acordo e mensalidade efetivamente vencida. Permite até imediatamente antes de 72 horas da entrada em `past_due`. |
| Sem adesão manual | Preserva a política anterior, inclusive barbearias sem assinatura e a carência legada. |

A RPC do servidor e o trigger de reservas usam `private.booking_access_at`. Um registro de lock privado por barbearia sincroniza mudanças de assinatura, pagamento manual e limite de profissionais. O trigger de reserva usa um lock compartilhado e consulta a cobertura após obtê-lo. Uma alteração financeira muda a versão da linha de lock. Um escritor em REPEATABLE READ com snapshot obsoleto recebe erro de serialização e deve repetir a transação. O limite de profissionais vem do plano no banco e é aplicado também na inserção, reativação e mudança de barbearia de um profissional ativo.

A projeção `get_owner_manual_trial` exige vínculo ativo de proprietário no tenant solicitado. Retorna nome do plano, estado e datas do trial, dias restantes, acesso, motivo e próximo passo comercial. A UI informa o fuso da barbearia nas datas por meio da formatação local, a contratação com a LPS Solutions e a ausência de cobrança automática. A projeção operacional de profissionais retorna apenas plano e limite. As policies financeiras da B1 continuam vigentes.

## Entradas Asaas

| Entrada | Verificação |
|---|---|
| Checkout e criação de customer | A action deriva o tenant da sessão. O serviço recusa histórico manual e falhas na leitura da origem. O resolvedor de customer repete a checagem. |
| Criação, recuperação e alteração de recorrência | O serviço exige origem Asaas. A persistência condicional mantém a origem, o estado e o token do lease correspondente. |
| Cron de trial | Descoberta, claim, retry, recuperação de lease e atualizações de sucesso ou falha filtram Asaas. A execução verifica a linha reivindicada antes de chamar os serviços externos. |
| Troca e cancelamento | As entradas verificam histórico manual. O cancelamento legado continua usando a transação de cancelamento e compensação existente. |
| Compensação | O registro exige assinatura Asaas no tenant certo. O worker verifica provedor, tenant e histórico antes de consultar ou remover a recorrência. Um job incompatível fica em revisão. |
| Webhook | A busca por ID remoto e por referência externa exige origem Asaas. A transição financeira da BILL-FIX-01 e a quarentena manual da B1 permanecem em vigor. |

Os handlers de cron, seus agendamentos e o transporte HTTP do Asaas permanecem os do projeto. A seleção da origem ocorre onde estão disponíveis a assinatura, o tenant e o lease.

## Homologação local

| Execução | Resultado |
|---|---|
| PostgreSQL, instalação limpa | 22 migrations. B1 passou 73 verificações e 3 de concorrência. B2-A1 passou 38 e 2 de concorrência. B2-A2 passou 16 de acesso e 4 de concorrência. |
| PostgreSQL, atualização com amostra anterior à B1 | B1 passou 75, incluindo presença e integridade das três linhas legadas. As demais suítes deram os mesmos resultados. |
| Next.js, Supabase Auth e PostgREST via HTTP | 10 grupos aprovados com usuários sintéticos autenticados, processo Next de produção e Data API local. |
| Vitest | 661 testes em 30 arquivos. Inclui services, workers, três Server Actions de cobrança, falha transitória, consulta interna de horários e compensação. O transporte Asaas foi simulado. |
| TypeScript, ESLint, Next build e git diff --check | Aprovados. |

O teste HTTP submeteu a Server Action duas vezes em paralelo e repetiu após descartar o resultado, comparou cookie e redirecionamento, conferiu o único trial e a ausência de mensalidade e verificou as quatro combinações de flags. Testou ainda a RPC legada e INSERT direto, projeção de owner/staff/outro tenant, limite Básico e tentativas reais de POST/PATCH de reserva após o prazo. O painel continuou acessível antes e depois da expiração. O teste usa o protocolo HTTP de Server Actions, sem automação visual de navegador.

As duas fixtures B2-A1 passaram a provisionar a autorização de aplicação quando a função B2-A2 existe. As asserções originais permanecem e os mesmos scripts ainda funcionam sobre a 21ª migration. No desenvolvimento, a nova regra de disponibilidade expôs uma expectativa antiga que ainda mostrava horários com a assinatura bloqueada. O teste agora confirma o cancelamento, o bloqueio da consulta e o reaparecimento da vaga após recuperação da cobertura. O teste de duas conexões drena o resultado assíncrono antes de reutilizar a sessão.

### Reprodução

Em um projeto Supabase descartável com ID exclusivo, aplicar as 22 migrations em ordem. Para exercitar a atualização com histórico, inserir a fixture `tests/postgres/manual-billing-legacy.sql` entre a 19ª e a 20ª migrations. Rodar `manual-billing.sql` e `manual-trial-access.sql` com `psql -X -v ON_ERROR_STOP=1` como postgres. Para os três scripts de concorrência e `manual-trial-onboarding.sql`, usar o supabase_admin da QA. Os testes de concorrência usam duas sessões reais via dblink e preservam apenas fixtures sintéticas nessa QA.

Para a integração HTTP, usar um projeto descartável com ID `b2a2-app-<dígitos>`, Supabase Auth e PostgREST atrás de `127.0.0.1:59121`. No processo de QA, definir `B2A2_QA_PROJECT` com esse ID e passar a URL e as chaves anon e service_role dessa própria QA nas variáveis de ambiente usuais do app. Gerar `npm run build` nesse ambiente e executar `node tests/integration/manual-trial-http.mjs`. O script utiliza a porta 59130 para os servidores Next temporários, requer a flag do banco inicialmente desligada e a restaura em `finally`. Os usuários e dados sintéticos ficam restritos ao projeto descartável.

## Ordem de adoção e limites

A aplicação usa as novas RPCs também para projetar acesso e limite. A migration deve preceder uma futura publicação do aplicativo. As flags governam somente a criação de barbearias. Desativá-las conserva as regras de acesso das já cadastradas. Durante uma troca de configuração, instâncias com flags divergentes podem recusar um cadastro. A recuperação consiste em alinhar as configurações e repetir a mesma intenção. A implantação real e a reconciliação comercial de origens mistas exigem decisão própria.

O lock privado é criado sob demanda e serializa mudanças financeiras e de capacidade da mesma barbearia. A homologação mediu correção transacional com sessões concorrentes. Capacidade sob carga de produção ainda não foi medida. A homologação terminou com a flag do banco desligada em todos os projetos descartáveis e a configuração Next efetivamente desligada no workspace.

## Inventário da árvore de trabalho

Base Git durante a execução: `main`, HEAD `d0844d3d6de1c42324dede35a87a4134351c84b9`. Os caminhos abaixo são relativos à raiz do repositório.

**Criados nesta fase**

- `docs/manual-trial-access-b2a2.md`
- `supabase/migrations/20261118140000_manual_trial_access.sql`
- `tests/integration/manual-trial-http.mjs`
- `tests/manual-trial-actions.test.ts`
- `tests/postgres/manual-trial-access.sql`
- `tests/postgres/manual-trial-access-concurrency.sql`

**Modificados nesta fase**

- Configuração e contrato de dados — `.env.example`, `src/lib/env/server.ts`, `src/types/database.ts`.
- Onboarding — `src/app/onboarding/page.tsx`, `src/features/onboarding/components/onboarding-form.tsx`, `src/features/barbershop/actions.ts`.
- Plano, painel e operação — `src/app/dashboard/plano/page.tsx`, `src/app/dashboard/financeiro/page.tsx`, `src/components/dashboard/booking-access-notice.tsx`, `src/features/barbers/plan-limit.ts`, `src/features/scheduling/actions.ts`, `src/features/scheduling/booking-access.ts`.
- Cobrança — `src/features/billing/queries.ts`, `src/features/billing/service.ts`, `src/features/billing/trial.ts`, `src/features/billing/compensation.ts`, `src/features/billing/webhook.ts`.
- Testes — `tests/billing-compensation.test.ts`, `tests/helpers/fake-supabase.ts`, `tests/plan-catalog.test.ts`, `tests/scheduling-actions.test.ts`, `tests/security-and-schema.test.ts`, `tests/postgres/manual-trial-onboarding.sql`, `tests/postgres/manual-trial-onboarding-concurrency.sql`.

O Git também lista trabalho das fases anteriores. A relação expandida inclui cada arquivo não rastreado, inclusive os testes B2-A1 que já estavam nessa condição quando foram adaptados.

### Saída de `git status --short`

```text
 M .env.example
 M src/app/dashboard/financeiro/page.tsx
 M src/app/dashboard/plano/page.tsx
 M src/app/onboarding/page.tsx
 M src/components/dashboard/booking-access-notice.tsx
 M src/features/barbers/plan-limit.ts
 M src/features/barbershop/actions.ts
 M src/features/billing/compensation.ts
 M src/features/billing/queries.ts
 M src/features/billing/service.ts
 M src/features/billing/trial.ts
 M src/features/billing/webhook.ts
 M src/features/onboarding/components/onboarding-form.tsx
 M src/features/scheduling/actions.ts
 M src/features/scheduling/booking-access.ts
 M src/lib/asaas/webhook.ts
 M src/lib/env/server.ts
 M src/types/database.ts
 M tests/asaas-webhook-route.test.ts
 M tests/asaas-webhook.test.ts
 M tests/billing-compensation.test.ts
 M tests/helpers/fake-supabase.ts
 M tests/plan-catalog.test.ts
 M tests/scheduling-actions.test.ts
 M tests/security-and-schema.test.ts
?? docs/
?? scripts/
?? src/features/billing/manual-calendar.ts
?? supabase/migrations/20261117120000_asaas_payment_transition_guard.sql
?? supabase/migrations/20261118120000_manual_billing_foundation.sql
?? supabase/migrations/20261118130000_manual_trial_onboarding.sql
?? supabase/migrations/20261118140000_manual_trial_access.sql
?? tests/helpers/fake-asaas-payment-transition.ts
?? tests/integration/
?? tests/manual-calendar.test.ts
?? tests/manual-trial-actions.test.ts
?? tests/postgres/
```

### Saída expandida com `-uall`

```text
 M .env.example
 M src/app/dashboard/financeiro/page.tsx
 M src/app/dashboard/plano/page.tsx
 M src/app/onboarding/page.tsx
 M src/components/dashboard/booking-access-notice.tsx
 M src/features/barbers/plan-limit.ts
 M src/features/barbershop/actions.ts
 M src/features/billing/compensation.ts
 M src/features/billing/queries.ts
 M src/features/billing/service.ts
 M src/features/billing/trial.ts
 M src/features/billing/webhook.ts
 M src/features/onboarding/components/onboarding-form.tsx
 M src/features/scheduling/actions.ts
 M src/features/scheduling/booking-access.ts
 M src/lib/asaas/webhook.ts
 M src/lib/env/server.ts
 M src/types/database.ts
 M tests/asaas-webhook-route.test.ts
 M tests/asaas-webhook.test.ts
 M tests/billing-compensation.test.ts
 M tests/helpers/fake-supabase.ts
 M tests/plan-catalog.test.ts
 M tests/scheduling-actions.test.ts
 M tests/security-and-schema.test.ts
?? docs/asaas-checkout-trial-proof.md
?? docs/manual-billing-b1.md
?? docs/manual-trial-access-b2a2.md
?? docs/manual-trial-onboarding-b2a1.md
?? scripts/asaas-checkout-trial-proof.mjs
?? src/features/billing/manual-calendar.ts
?? supabase/migrations/20261117120000_asaas_payment_transition_guard.sql
?? supabase/migrations/20261118120000_manual_billing_foundation.sql
?? supabase/migrations/20261118130000_manual_trial_onboarding.sql
?? supabase/migrations/20261118140000_manual_trial_access.sql
?? tests/helpers/fake-asaas-payment-transition.ts
?? tests/integration/manual-trial-http.mjs
?? tests/manual-calendar.test.ts
?? tests/manual-trial-actions.test.ts
?? tests/postgres/manual-billing-concurrency.sql
?? tests/postgres/manual-billing-legacy.sql
?? tests/postgres/manual-billing.sql
?? tests/postgres/manual-trial-access-concurrency.sql
?? tests/postgres/manual-trial-access.sql
?? tests/postgres/manual-trial-onboarding-concurrency.sql
?? tests/postgres/manual-trial-onboarding.sql
```
