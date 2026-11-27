# Inventário de migrations da K1-C

A lista abaixo está em ordem lexicográfica de aplicação. A última leitura hospedada registrada no projeto apontava 29 migrations. Esse é um dado histórico. Antes de qualquer aplicação, repetir consulta autorizada de versões, versão PostgreSQL, extensões, ownership, grants efetivos e Storage. Comparar a lista inteira e interromper se surgir lacuna, versão inesperada ou divergência de hash em cópia da migration. A K1-C executou o preflight somente em bases locais.

| Nº | Migration |
| ---: | --- |
| 1 | [20261108090000_extensions_and_enums.sql](../supabase/migrations/20261108090000_extensions_and_enums.sql) |
| 2 | [20261108090100_core_tables.sql](../supabase/migrations/20261108090100_core_tables.sql) |
| 3 | [20261108090200_scheduling_tables.sql](../supabase/migrations/20261108090200_scheduling_tables.sql) |
| 4 | [20261108090300_billing_and_operations.sql](../supabase/migrations/20261108090300_billing_and_operations.sql) |
| 5 | [20261108090400_functions_and_triggers.sql](../supabase/migrations/20261108090400_functions_and_triggers.sql) |
| 6 | [20261108090500_rls_policies.sql](../supabase/migrations/20261108090500_rls_policies.sql) |
| 7 | [20261108090600_grants_and_hardening.sql](../supabase/migrations/20261108090600_grants_and_hardening.sql) |
| 8 | [20261113120000_public_booking.sql](../supabase/migrations/20261113120000_public_booking.sql) |
| 9 | [20261114100000_billing_asaas_enums.sql](../supabase/migrations/20261114100000_billing_asaas_enums.sql) |
| 10 | [20261114100100_billing_asaas.sql](../supabase/migrations/20261114100100_billing_asaas.sql) |
| 11 | [20261114100200_plan_catalog.sql](../supabase/migrations/20261114100200_plan_catalog.sql) |
| 12 | [20261114100300_barber_plan_limit.sql](../supabase/migrations/20261114100300_barber_plan_limit.sql) |
| 13 | [20261114100400_trial_operation.sql](../supabase/migrations/20261114100400_trial_operation.sql) |
| 14 | [20261115120000_subscription_cancel_reason.sql](../supabase/migrations/20261115120000_subscription_cancel_reason.sql) |
| 15 | [20261115130000_subscription_checkout_concurrency.sql](../supabase/migrations/20261115130000_subscription_checkout_concurrency.sql) |
| 16 | [20261115140000_billing_checkout_fencing_and_cleanup.sql](../supabase/migrations/20261115140000_billing_checkout_fencing_and_cleanup.sql) |
| 17 | [20261116100000_billing_concurrency_hardening.sql](../supabase/migrations/20261116100000_billing_concurrency_hardening.sql) |
| 18 | [20261116120000_subscription_booking_grace_period.sql](../supabase/migrations/20261116120000_subscription_booking_grace_period.sql) |
| 19 | [20261117120000_asaas_payment_transition_guard.sql](../supabase/migrations/20261117120000_asaas_payment_transition_guard.sql) |
| 20 | [20261118120000_manual_billing_foundation.sql](../supabase/migrations/20261118120000_manual_billing_foundation.sql) |
| 21 | [20261118130000_manual_trial_onboarding.sql](../supabase/migrations/20261118130000_manual_trial_onboarding.sql) |
| 22 | [20261118140000_manual_trial_access.sql](../supabase/migrations/20261118140000_manual_trial_access.sql) |
| 23 | [20261119120000_manual_billing_operations.sql](../supabase/migrations/20261119120000_manual_billing_operations.sql) |
| 24 | [20261119160000_financial_operators.sql](../supabase/migrations/20261119160000_financial_operators.sql) |
| 25 | [20261119200000_financial_dashboard.sql](../supabase/migrations/20261119200000_financial_dashboard.sql) |
| 26 | [20261120142304_owner_manual_plan_details.sql](../supabase/migrations/20261120142304_owner_manual_plan_details.sql) |
| 27 | [20261120160000_financial_cutover_health.sql](../supabase/migrations/20261120160000_financial_cutover_health.sql) |
| 28 | [20261120170000_private_barber_photos.sql](../supabase/migrations/20261120170000_private_barber_photos.sql) |
| 29 | [20261120180000_scheduling_operations.sql](../supabase/migrations/20261120180000_scheduling_operations.sql) |
| 30 | [20261123120000_phase_i3_manual_agreements_and_logos.sql](../supabase/migrations/20261123120000_phase_i3_manual_agreements_and_logos.sql) |
| 31 | [20261125005128_phase_i31_contract_capacity_logo_reconciliation.sql](../supabase/migrations/20261125005128_phase_i31_contract_capacity_logo_reconciliation.sql) |
| 32 | [20261125085435_phase_i4_appointment_price_integrity.sql](../supabase/migrations/20261125085435_phase_i4_appointment_price_integrity.sql) |
| 33 | [20261126095208_automatic_premium_trial.sql](../supabase/migrations/20261126095208_automatic_premium_trial.sql) |
| 34 | [20261127093958_k1b_appointment_lifecycle.sql](../supabase/migrations/20261127093958_k1b_appointment_lifecycle.sql) |
| 35 | [20261127094648_k1b_private_photo_reconciliation.sql](../supabase/migrations/20261127094648_k1b_private_photo_reconciliation.sql) |
| 36 | [20261127094922_k1b_financial_trial_directory.sql](../supabase/migrations/20261127094922_k1b_financial_trial_directory.sql) |

## Intervalo a homologar após a migration 29

| Nº | Mudança e pré-requisitos | Privilégios e risco operacional |
| ---: | --- | --- |
| 30 | Acordo manual separado do pagamento. Adiciona estado contratual e colunas de logo, cria política/bucket e APIs CAS de troca, mantém histórico. Depende de financeiro, catálogo, Storage e guardas de tenant existentes. | Executor com DDL em public/private, criação e associação do papel sem login de logo, grants, DML de bucket/configuração e DDL de políticas Storage. Alterações de tabela/constraint podem bloquear concorrentes. Preflight de acordos, campos e chaves antigas. |
| 31 | Validação de capacidade do plano no novo acordo sob trava de tenant já utilizada em equipe. Log de reconciliação passa a sobreviver à exclusão. Depende da migration 30 e do lock de revisão. | Executor dono de funções/triggers e tabelas relevantes, acesso Storage somente nos caminhos existentes. Remoção de FK exige lock forte breve. A rotina administrativa use a API Storage. |
| 32 | Protege preço de catálogo e autoria em INSERT/UPDATE, com guardas existentes de RLS. | Ownership de tabela e função, acesso ao catálogo/autor efetivo. Instala trigger, não recalcula dados históricos. Janela curta sem escritores e testes owner/staff/Data API. |
| 33 | Trial automático com ledger único por identidade, gates inicialmente fechados, catálogo Premium e ligação com assinatura/cobertura. | PostgreSQL 16+ para semântica de associação de roles usada, replay em 17.11. Conferir role NOLOGIN restrita, funções SECURITY DEFINER, grants explícitos e leitura controlada de Auth. Triggers, políticas e constraints podem bloquear sessões durante DDL. Verificar histórico de trials antes do rollout. |
| 34 | Emenda ciclo de vida de atendimento e proteção contra escrita direta, mantém preço/autoria e completion RPC. | Função invoker, EXECUTE direto revogado, sem novos privilégios de app. DDL para trigger na tabela ativa. Não reabre ou retifica estados históricos. |
| 35 | Cria controle de conciliação de fotos privadas, reserva/cleanup manual e fence por tenant. Protege referência concorrente. | Tabelas e funções privadas e trigger com SECURITY DEFINER de escopo restrito. Executor administrativo precisa ler Storage e confirmar chave exata pela API para remover objetos. Sem modificação de bucket ou abertura de acesso. |
| 36 | Diretório de trial filtra conjunto autorizado antes do cursor. Usa o guard de ator financeiro e a projeção existente. | Mesmo papel financeiro limitado e search_path fixado. Nenhum grant geral de tabela. Conferir atualização de schema cache PostgREST e retorno manager/operator. |

Executar a sequência 30–36 por ferramenta oficial em homologação autorizada, confirmando ownership e opcionais por versão. Preparar janela, observar locks, cancelar DDL se filas crescerem e validar constraints/gates/grants antes de reabrir tráfego. Preferir nova migration incremental para corrigir falha depois de um commit. Backup e restauração seguem o procedimento próprio e uma troca de versão do app exige matriz de compatibilidade do schema. [Recuperação](backup-and-restore.md).

## Consulta de preflight

[SQL em transação somente leitura](../tests/postgres/k1c-preflight-readonly.sql). Usar conexão explícita e papel de diagnóstico autorizado. A sonda identifica seleção de versão, catálogos, contratos acima de capacidade, estados históricos para revisão, trials, referências inválidas e órfãos candidatos. Saída em contagens, sem nomes/chaves. O SQL usa timeout de 15 s e lock timeout de 2 s. Em volume maior, usar réplica aprovada ou executar por subconjunto e registrar plano. Contagem de metadados não prova presença de binários. Confirmar inventário pela API, não tocar nas chaves durante auditoria. Itens antigos sem autor, agendamentos vencidos e imagens legadas precisam de triagem humana antes de qualquer ação.

A sonda passou contra a fixture local com 29 versões e contra a stack evoluída. O replay limpo das 36 foi preservado como evidência separada. [Preflight 29](qa-k1-c/preflight-baseline.log) · [Preflight evoluído](qa-k1-c/preflight.log) · [Replay 36](qa-k1-b/migrations-replay.log).
