# B2-B · Acordos e mensalidades por Pix

A migration 23, `20261119120000_manual_billing_operations.sql`, acrescenta três operações internas ao schema privado. Assinaturas e mensalidades continuam em `public.subscriptions` e `public.payments`. A migration instala definições e permissões. O processamento depende de uma invocação explícita em uma sessão de banco autorizada.

## Contratos internos

| Operação | Entrada e resultado |
|---|---|
| `private.register_manual_agreement(op uuid, shop uuid, agreement private.manual_agreement_terms) → uuid` | Registra uma assinatura pendente. Retorna seu ID e grava o recibo da operação e o evento de acordo na mesma transação. Pode encerrar o registro de um trial já vencido. |
| `private.issue_manual_invoice(op uuid, shop uuid, contract uuid, bill_month date) → uuid` | Recebe o primeiro dia civil da competência. Emite uma parcela Pix pendente por assinatura e competência e retorna seu ID. A auditoria de emissão é o trigger B1. |
| `private.process_manual_overdue(batch_size integer) → table(processed integer, failed integer)` | Processa um lote de 1 a 100 candidatas. O resultado conta itens tratados e falhas isoladas naquela invocação. A próxima execução examina novamente a fila elegível. |

O tipo do acordo exige plano ativo, centavos positivos, BRL, termos comerciais, instante inicial, primeira competência, primeiro vencimento, dias de renovação e vencimento, deslocamento mensal do vencimento, hora civil e fuso IANA aceito pelo PostgreSQL. O registro guarda o instante do acordo no banco. O snapshot comercial fica imutável. Renovação do período, cancelamento e baixa são eventos distintos. Para rever preço, plano ou calendário, a operação futura deverá preservar o contrato anterior.

A barbearia precisa ter histórico de adesão manual. A operação recusa sobreposição com trial ou contrato existente e exige conciliação de uma assinatura legada corrente. Um contrato pode ter cobertura inicial futura. A emissão espera o início da cobertura da competência. O período operacional atual representa o período de acesso. O acordo mensal segue vigente enquanto estiver em estado elegível, até cancelamento, expiração ou o fim de um cancelamento programado. Uma nova emissão é recusada após esses marcos. O replay de uma emissão existente continua devolvendo seu ID. Emissão retroativa de uma competência omitida exige que ela pertença ao acordo ainda vigente.

### Calendário e valores

A primeira competência e o primeiro instante de vencimento são explícitos. O segundo vencimento precisa suceder o primeiro. Para as competências seguintes, o banco parte do mês solicitado, aplica o deslocamento negociado e limita o dia-âncora ao último dia daquele mês. Converte data e hora civil em instante com o fuso contratual. A âncora de renovação é independente e usa a hora local do início da cobertura. O trigger de calendário da B1 verifica a mensalidade antes da inserção.

Uma âncora no dia 31 dá 28/02/2023, 29/02/2024 e 31/03 nos respectivos meses de março. Uma primeira parcela com vencimento especial conserva o instante contratado. Nenhuma data depende de quando uma parcela anterior foi paga. Para horas inexistentes ou ambíguas na mudança de horário de verão, vale a conversão nativa do PostgreSQL. Na QA de Nova York, 02h30 da lacuna de março de 2023 resultou em 07h30 UTC, e 01h30 da repetição em novembro resultou em 06h30 UTC.

A emissão copia o preço individual do acordo em centavos para os valores original e final, com escopo `platform_subscription`. A operação não recebe parâmetros de desconto ou acréscimo. Ajustes futuros exigem autorização, justificativa e preservação do histórico. Uma parcela histórica com saldo zero fica fora da fila de inadimplência.

### Idempotência e concorrência

`private.manual_operation_receipts` relaciona um UUID global à operação, seus argumentos tipados e o resultado. Um advisory lock por chave serializa a comparação e o registro. Repetir o payload recupera o resultado, inclusive após cancelamento. Uma chave usada com outro tenant, valor, competência ou espécie de operação gera `22023`. Chaves diferentes para a mesma competência convergem para a mesma parcela sob lock da assinatura e índice único da B1. Um erro desfaz a gravação financeira, o recibo e a auditoria da transação.

O worker compara os vencimentos com um único instante do banco por lote. Seleciona saldo positivo pendente e exigível, com contrato manual aplicável no mesmo tenant. Pode aplicar a transição contratual de um item já vencido caso a assinatura tenha sido legitimamente ativada depois. `FOR UPDATE OF s,p SKIP LOCKED` impede que dois workers tratem a mesma assinatura/parcela ao mesmo tempo. O índice parcial usa vencimento e ID para ordenar a seleção. A escrita continua sujeita aos locks de agenda da B2-A2.

Cada item tem uma subtransação. Se a auditoria ou a mudança de estado falhar, ambas as alterações são revertidas. A tabela privada `manual_overdue_retry` guarda ID da parcela, número de tentativas, SQLSTATE e o próximo instante de tentativa, com intervalo de um minuto. O worker limita esperas por locks a 500 ms. O chamador futuro deve usar uma transação curta por lote e um timeout total. Uma falha da conexão ou da transação externa desfaz o lote e permite nova tentativa.

## Matriz de transições

| Estado de origem | Evento | Estado resultante e efeito na agenda |
|---|---|---|
| Trial Básico vigente | Cadastro ou replay | Mesmas 168 horas. Acesso de trial, sem mensalidade. |
| Trial encerrado, sem acordo | Passagem do prazo | Novos horários bloqueados. Histórico e consultas preservados. |
| Trial encerrado | Acordo registrado | Assinatura pendente. O cadastro do acordo preserva o bloqueio. |
| Acordo vigente | Emissão de competência iniciada | Parcela pendente, valor e vencimento históricos fixados. |
| Contrato pendente | Primeira mensalidade vence | Parcela vencida. Contrato segue pendente e a agenda continua bloqueada. |
| Contrato previamente ativo | Mensalidade exigível vence | Parcela vencida e assinatura em atraso na mesma transação. Começam as 72 horas. |
| Assinatura em atraso, carência vigente | Outra competência vence ou worker repete | Preserva início e fim da carência. Acesso segue a decisão SQL da B2-A2. |
| Carência encerrada | Tentativa de reserva ou reagendamento protegido | Bloqueio a partir do instante exato do limite. Reservas anteriores são preservadas. |
| Competência antiga em aberto | Baixa futura autorizada apenas daquela competência | Outras competências vencidas permanecem em aberto. A B2-B não promove a assinatura para ativa. |
| Competência paga anteriormente | Retry de emissão ou passagem do worker | Preserva a parcela e as âncoras. |
| Contrato cancelado ou expirado | Nova competência ou replay conhecido | Recusa nova emissão e preserva a consulta idempotente ao histórico. |

A carência nasce na transição legítima para `past_due` pelo relógio do PostgreSQL. O evento de auditoria guarda o início e o fim originais. Um worker atrasado **posterga o início da carência**. Antes de agendar o worker, a operação deve monitorar idade do vencimento elegível mais antigo, última execução bem-sucedida, volume e idade das retentativas, falhas persistentes e duração dos lotes.

## Autorização e dependências da Fase C

Registro e emissão são funções privadas `SECURITY INVOKER` sem EXECUTE para os papéis de API. Nesta fase, somente a infraestrutura privilegiada consegue exercitá-las em QA. O papel do worker é NOLOGIN e recebe apenas uso do schema e EXECUTE no procedimento limitado de atraso. A rotina usa `SECURITY DEFINER`, SQL fixo e `search_path` vazio, permitindo executar essa transação sem dar ao papel escrita nas tabelas nem alterar as policies restritivas da B1. O papel não recebe credencial nem é atribuído a um papel da aplicação. O usuário legado `platform_admin`, o onboarding, a Data API e o cliente service_role não ganham permissões financeiras.

A confirmação de crédito, a ativação paga, os ajustes autorizados e a identidade e autorização do operador financeiro continuam dependendo da Fase C. Não há Server Action, rota HTTP de cron ou entrada no agendador para as novas operações. A implantação deverá dimensionar o índice, medir contenção no volume real e definir retenção dos recibos e operação da fila de erros. O teste de duas sessões verifica correção concorrente, sem medir capacidade de produção.

## Homologação e reprodução

| Verificação executada | Resultado |
|---|---|
| Instalação limpa com 23 migrations | 186 verificações PostgreSQL. B2-B passou 43 de comportamento e permissões e 7 com sessões independentes. As fases anteriores passaram 136. |
| Atualização com fixtures Asaas e de serviços anteriores à B1 | 188 verificações PostgreSQL, incluindo as duas asserções adicionais de presença e integridade dos registros históricos. |
| PostgREST e Supabase Auth | 18 recusas esperadas de acesso às operações internas, com verificação dos códigos PostgREST. |
| Calendário | 744 comparações entre TypeScript e PostgreSQL, cobrindo os 31 dias-âncora e os 24 meses de 2023 e 2024. |
| Next.js e Supabase via HTTP | 10 grupos da B2-A2 aprovados, incluindo as flags de onboarding, isolamento do checkout e bloqueio de reservas. |
| Aplicação | Typecheck, ESLint, 661 testes Vitest e build Next.js aprovados. |

Dois emissores com UUIDs distintos disputaram a mesma competência. O segundo esperou o commit e recuperou o ID da primeira emissão. A QA verificou uma única parcela e uma única auditoria de emissão. Em outra disputa, o segundo worker processou outro tenant enquanto a primeira transação estava aberta. Uma falha de auditoria injetada reverteu as alterações do item e a tentativa posterior concluiu o processamento. Em isolamento superior a READ COMMITTED, o executor deve repetir a transação completa depois de um conflito de serialização, preservando a chave da operação.

- No caminho limpo, criar um projeto Supabase descartável com as 23 migrations na ordem do repositório. Para testar atualização, partir das 19 migrations até BILL-FIX-01, executar `tests/postgres/manual-billing-legacy.sql` na QA e aplicar as quatro seguintes. Os snapshots dessa fixture incluem a assinatura Asaas, seu pagamento e um recebimento de serviço.
- Em cada banco exclusivo, executar primeiro `b2b-operations.sql` e depois `b2b-concurrency.sql` com `psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f <arquivo>`. Manter `b2b-fixtures.sql` na mesma pasta. A primeira suíte reverte a transação ao final. A segunda precisa de fixtures confirmadas e usa conexões independentes por dblink. Executar as suítes B1, B2-A1 e B2-A2 em seguida. Essa ordem evita misturar vencimentos sintéticos de testes diferentes na mesma fila.
- Para as verificações HTTP adicionais, usar Auth e PostgREST locais em um projeto exclusivo `b2b-clean-<dígitos>`, porta 59521. Fornecer ao processo `B2B_QA_PROJECT`, a URL de loopback e as chaves da própria QA. Executar `node tests/integration/b2b-data-api.mjs` com Node com suporte a TypeScript. O script verifica três perfis pela Data API e compara o helper TypeScript já existente com o calendário SQL. Não consulta serviços de pagamento.
