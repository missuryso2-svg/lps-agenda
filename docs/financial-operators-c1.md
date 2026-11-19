# C1 · Operação financeira global e conferência de Pix

A migration 24 instala a API financeira no PostgreSQL. A aplicação a consome pelo cliente Supabase da sessão, com os contratos em `src/types/database.ts`. A autoridade financeira começa vazia. A instalação não provisiona pessoas, nem agenda jobs ou habilita onboarding.

## Autoridade

| Identidade | Capacidade |
|---|---|
| Anônimo | Sem execução das RPCs financeiras. |
| Usuário autenticado comum, owner, staff ou claim legado platform_admin | O banco exige concessão financeira ativa inclusive nas leituras. O vínculo com uma barbearia e os metadados do JWT não concedem essa autoridade. |
| Operador financeiro | Consulta global, registro de acordo, emissão, conferência de Pix, suspensão, retomada e cancelamento de contrato manual. |
| Gestor financeiro | Capacidades do operador, mais concessão e revogação para terceiros. Mudança de nível requer revogar e criar nova concessão. |
| Infraestrutura confiável | Bootstrap único, por conexão direta ao PostgreSQL com a identidade administrativa apropriada. |
| Service role, worker e papel de onboarding | Conservam suas finalidades anteriores. Não são operadores humanos. |

Cada operação pública lê a identidade derivada de `auth.uid()` e bloqueia a concessão ativa para leitura até o término da transação. A revogação concluída nega a operação seguinte, inclusive replay com o mesmo JWT. Uma operação já autorizada pode concluir antes do commit da revogação. A gestão de concessões é serializada. Um gestor não pode conceder, revogar ou elevar o próprio vínculo. O histórico privado conserva uma linha por concessão, com nível, identidade Auth, datas, responsáveis e motivos.

As RPCs humanas têm proprietário dedicado NOLOGIN e NOINHERIT, sem BYPASSRLS ou propriedade de tabelas. Os grants de escrita são por coluna e as policies limitam a origem manual. O papel recebe os privilégios de lock necessários ao reaproveitamento da B2-B. Os demais papéis continuam sujeitos à quarentena B1. O schema privado fica fora da Data API. Os helpers são privados, as RPCs usam SQL fixo, os nomes de objetos são qualificados e o search_path está vazio. A trilha de decisões humanas fica em tabela privada, sem UPDATE ou DELETE para o executor. Uma barreira de escrita adicional protege a origem de novos eventos manuais na tabela de auditoria B1, inclusive de INSERT direto com credencial de serviço.

### Primeiro gestor

A infraestrutura deve conferir a identidade da pessoa no cadastro da organização e no Supabase Auth, verificar o UUID do projeto e o UUID do usuário no ambiente correto e registrar quem autorizou a concessão. Em conexão direta identificada, abrir transação, conferir que `private.financial_operators` está vazia e executar a chamada parametrizada abaixo. Conferir a linha retornada e seu titular antes de confirmar a transação.

```sql
select private.bootstrap_financial_manager($1::uuid, $2::text);
```

O primeiro parâmetro é o UUID Auth verificado. O segundo é o motivo e a referência interna da autorização, sem informação bancária ou credencial. O banco registra a identidade da conexão de infraestrutura. Uma segunda tentativa após o primeiro cadastro falha. Para os demais operadores, um gestor já autenticado usa `finance_operator`. A recuperação de perda do último gestor exige um procedimento separado de infraestrutura com aprovação e auditoria.

## Operações e idempotência

- `finance_agreement` recebe barbearia, UUID da operação, termos da B2-B em JSON, referência administrativa e motivo. Os termos exigem preço explícito, plano, calendário e fuso. Enviar os timestamps com offset. A RPC retorna o contrato pendente.
- `finance_invoice` recebe barbearia, contrato, competência e UUID. A emissão retorna o ID da parcela. O índice por contrato e competência inclui parcelas fechadas.
- `finance_confirm_pix` recebe UUID da operação, barbearia, contrato, parcela, valor integral em centavos, instante do crédito, declaração explícita de conferência e referência opcional. A conferência usa o relógio do banco e registra o operador autenticado. O sistema registra a declaração da pessoa após ela conferir o extrato da LPS. Não consulta banco, comprovante ou mensagem.
- `finance_contract_action` aceita somente suspensão, retomada ou cancelamento, com motivo. A suspensão é independente da situação financeira. A retomada exige cobertura paga atual e ausência de dívida exigível. O cancelamento retém parcelas e pagamentos.
- O registro humano relaciona chave, ator, ação, tenant, argumentos financeiros e resultado. Uma chave repetida devolve o resultado original somente após nova autorização e comparação dos dados. Outra chave não reabre uma parcela paga. O índice de referência de Pix é único entre parcelas manuais quitadas, após normalização de espaços externos e caixa. Antes de uma futura implantação, verificar duplicidades históricas normalizadas e resolver por conciliação explícita.

O contrato é trancado antes da parcela. Baixa, reavaliação de cobertura, auditoria da parcela e registro da decisão humana pertencem à mesma transação. Valor menor ou maior que o exigível falha integralmente. Créditos parciais, excedentes ou adiantamentos sem parcela definida aguardam política comercial. Não se cria saldo transferível entre competências.

## Estados e acesso

| Estado e evento | Resultado |
|---|---|
| Trial vigente ou vencido, sem acordo | Preserva as 168 horas e as proteções da agenda. Não existe parcela a quitar. |
| Registro de acordo ou emissão | Contrato pendente ou estado anterior preservado. A emissão não confere crédito. |
| Primeiro crédito integral da competência vigente | Ativa somente o intervalo de cobertura contratual vigente, se não houver suspensão ou outra parcela exigível vencida. |
| Crédito de competência antiga | Registra o recebimento. Só há cobertura se a competência vigente também estiver paga e as demais condições forem satisfeitas. |
| Outra parcela vencida | A conferência não estende o período nem reinicia a carência. Um contrato anteriormente bloqueado não ganha acesso incidental pela mudança de status da parcela. |
| Assinatura em atraso | A carência B2-B continua sendo de 72 horas desde a transição para past_due. A baixa pode recuperar a cobertura quando a situação completa do contrato o permite. |
| Suspensão independente | A consulta de disponibilidade e os triggers usam a mesma decisão de bloqueio. O crédito pode ser registrado durante a suspensão. A retomada exige ato separado e verificação financeira. |
| Contrato cancelado ou expirado | Um crédito tardio elegível pode constar do histórico. O estado terminal e o bloqueio permanecem. |

A competência vigente é calculada no fuso do acordo a partir de início de cobertura, primeira competência e âncora de renovação. A decisão considera inclusive parcelas pendentes cujo vencimento já passou, independentemente do atraso do worker. O prazo de cobertura termina no próximo marco contratual. Datas do Pix não alteram a âncora. Reservas existentes não sofrem mutação por essas operações.

**Ajustes e dias extras permanecem bloqueados.** A B1 torna imutável o valor de uma parcela emitida. Uma correção precisa de um lançamento compensatório com regras de aprovação, limites, quitação e relatório. Para dias extras faltam o limite comercial, a regra de acumulação e a precedência frente à dívida e à suspensão. A C1 recusa esses comandos, ainda que acompanhados de justificativa. Registros históricos de ajuste continuam consultáveis.

## Consultas para a C2

`finance_shops` retorna barbearias, contato para atendimento, proprietário, plano, origem, estado, trial, preço, âncora de vencimento, suspensão e última conferência. `finance_invoices` exige tenant ou competência e permite filtrar situação. A projeção inclui valor original, ajustes, justificativa, saldo exigível da parcela e datas. `finance_totals` agrega recebido e em aberto de uma única competência, com filtro opcional por tenant. `finance_history` pagina decisões humanas de um tenant. `finance_events` projeta campos permitidos dos eventos financeiros manuais anteriores e atuais, sem devolver o JSON de origem na íntegra. As listas usam cursor UUID exclusivo e páginas entre 1 e 100 itens. A paginação por UUID tem ordem de chave. O instante de cada evento acompanha o resultado.

A C2 pode chamar essas operações com a sessão do usuário. Não há Server Action de administração ou credencial service_role intermediária. A tela de baixa deverá pedir conferência do extrato, manter o UUID da tentativa entre retries e exibir o valor exigível, o tenant e a competência antes do envio. A camada de autorização permanece no banco, inclusive para clientes que chamem diretamente a Data API. O ensaio concorrente verifica consistência transacional; o dimensionamento dos índices, a latência de listagens e a contenção em volume de produção ainda exigem medição.

## Homologação

Executar as suítes `c1-finance.sql` e `c1-concurrency.sql` nessa ordem em PostgreSQL Supabase exclusivo de QA com as 24 migrations. A primeira usa transação revertida. A segunda utiliza fixtures confirmadas e conexões independentes. Ambas incluem os builders B2-B por caminho relativo; executar com psql -X e ON_ERROR_STOP. Executar em seguida as suítes da B2-B, B1, B2-A1 e B2-A2. No cenário de atualização, inserir `manual-billing-legacy.sql` entre as versões 19 e 20.

Para a Data API usar a configuração descartável do teste HTTP da B2-A2 e executar `node tests/integration/c1-finance-http.mjs` com as chaves da própria QA. Os usuários são sintéticos. O teste confere a exposição das RPCs, valida consultas autorizadas e recusa acesso com a mesma sessão após revogação. O teste HTTP da B2-A2 exercita separadamente as Server Actions existentes do Next.js.

| Validação local com a migration 24 | Resultado |
|---|---|
| Instalação limpa | 232 verificações PostgreSQL aprovadas. |
| Atualização a partir da migration 19 com dados legados | 234 verificações PostgreSQL aprovadas, incluindo preservação dos registros Asaas e de serviço. |
| C1 em cada banco | 34 verificações de operação, autorização e rollback, mais 12 de concorrência. Sessões independentes disputaram emissão, baixa duplicada, cancelamento versus baixa e worker versus baixa. |
| Integração HTTP da C1 | 2 grupos aprovados com Auth e PostgREST reais, inclusive revogação com o mesmo JWT. |
| Regressão B2-B | 18 verificações HTTP de isolamento e 744 comparações do calendário entre TypeScript e PostgreSQL aprovadas. |
| Fluxos HTTP da B2-A2 | 10 grupos aprovados, incluindo Server Actions existentes, criação de trial, agenda e isolamento do checkout. |
| Aplicação | Typecheck, ESLint, 661 testes Vitest e build de produção aprovados. |
