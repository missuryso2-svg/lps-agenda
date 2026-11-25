# I3.1 · Revisão corretiva de assinaturas e logos

**GO técnico para integração da I3 com a I3.1. NO-GO comercial até homologação hospedada.** Base de revisão: `48a1f9f`, branch `codex/recuperacao-i3`. A migration 30 foi preservada byte a byte. A [migration 31](../supabase/migrations/20261125005128_phase_i31_contract_capacity_logo_reconciliation.sql) é incremental.

## Causas e correções

| Achado | Causa | Correção e evidência |
| --- | --- | --- |
| Contratação acima do limite | O trigger da equipe verificava inserção e reativação de profissionais. A criação de uma assinatura para uma equipe existente não tocava nessas linhas. | Antes do INSERT de acordo manual, o banco lê `plans.max_barbers` do plano contratado e conta os profissionais ativos do tenant. Igualdade é permitida, limite nulo é ilimitado. Excesso gera SQLSTATE `LP031` e a Server Action explica a recusa. A transação inteira reverte, inclusive eventual expiração de trial. A equipe não é editada. |
| Interrupção da agenda | A primeira contratação transfere a barbearia da regra anterior para a regra de contrato manual pendente. Isso pode interromper as reservas já na contratação. | O formulário exige marcar ciência do bloqueio imediato, inclusive com início futuro. O diálogo de revisão repete a declaração e a ação valida o aceite como booleano verdadeiro antes da RPC. Em QA a agenda passou de permitida a bloqueada no instante do acordo pendente futuro. As rotinas de emissão, baixa Pix e cobertura continuam as existentes. |
| Logos órfãs | A fila desaparecia em cascata ao excluir o tenant e sua drenagem dependia de uma operação do proprietário. | A fila privada sobrevive à exclusão. O DBA pode localizar objetos pelo bucket, reservar cada chave e confirmar a remoção pela API de Storage. O procedimento abaixo também recupera objetos que nunca entraram na fila. A trilha privada registra tenant, chave, identidade SQL, solicitação e conclusão. |
| Conflito de logo com releitura indisponível | O endpoint codificava falha de leitura como referência nula. | O HTTP 409 inclui apenas a mensagem de indisponibilidade e a orientação de atualizar a página. Sem versão confirmada, o card mantém imagem e seleção. O teste verifica a ausência de ambos os campos e de exclusões de Storage. |

## Concorrência e atomicidade

O trigger preexistente `subscriptions_lock_tenant` adquire a linha de revisão de `private.lock_booking_access(tenant,true)` antes do INSERT. É o mesmo lock transacional usado na ativação de profissionais. Os triggers PostgreSQL do mesmo evento disparam em ordem alfabética. `validate_agreement_capacity` roda **depois de adquirir o lock e antes de gravar a assinatura**. A leitura usa função volátil e o papel proprietário para contar toda a equipe apesar da RLS do operador. A função é exclusiva do trigger. Qualquer manutenção que altere a ordem dos triggers deve repetir a suíte concorrente.

A suíte abre conexões PostgreSQL independentes e observa o bloqueio real via `pg_blocking_pids` nos dois sentidos. Com a ativação confirmada primeiro, o acordo vê a equipe acima do limite e reverte. Com o acordo confirmado primeiro, a ativação vê o novo limite e reverte. A rejeição deixa intactos os profissionais que já estavam ativos. Os mecanismos de replay e de contrato único continuam cobertos pelas suítes C1/C2.

## Procedimento administrativo de reconciliação

Executar manualmente em ambiente aprovado, com sessão DBA identificável e conexão de Storage administrativa **do mesmo projeto**. Usar nomes exatos. O bucket é público para leitura. Seu conteúdo só deve ser removido pela API de Storage. O SQL opera sobre a fila e a trilha de auditoria. As funções privadas usam privilégios do invocador. As roles da Data API não têm EXECUTE nessas funções.

1. Inventariar em leitura. A consulta abaixo funciona mesmo para um tenant excluído. Também revisar operações com `removed_at is null` em `private.logo_reconciliation_log`. Chaves de formato desconhecido exigem investigação manual.
2. Selecionar o tenant e uma chave canônica. Em psql, usar variáveis `tenant` e `object_key` e executar `select private.claim_retired_logo(:'tenant'::uuid, :'object_key');` em autocommit. **Prosseguir somente após retorno verdadeiro e commit confirmado.** Se houver dúvida, repetir a reserva. Um objeto recente fica protegido por 15 minutos. Uma referência atual bloqueia a reserva. A RPC serializa com a troca de logo e a chave reservada fica impedida de ser reassociada pelo fluxo normal.
3. Com o cliente administrativo do mesmo projeto, remover somente a chave confirmada: `storage.from("barbershop-logos").remove([objectKey])`. Conferir o erro retornado. Executar fora da transação SQL. Usar o valor integral retornado pelo inventário, sem curingas, prefixos de exclusão ou nome de arquivo enviado pelo navegador.
4. Executar `select private.finish_retired_logo(:'tenant'::uuid, :'object_key');`. A confirmação exige uma reserva administrativa anterior e ausência do objeto no catálogo de Storage. A confirmação repetida preserva o primeiro instante de conclusão. Se a API falhar ou a resposta se perder, consultar a operação aberta, tentar a confirmação e, se continuar pendente, repetir desde a reserva. Um falso na reserva nunca autoriza uma exclusão.
5. Conferir a trilha por tenant e chave. Durante restauração de backup ou importação administrativa que reintroduza chaves históricas, suspender o procedimento e revalidar as referências após a restauração. A operação não agenda Cron nem Worker.

```sql
select split_part(o.name, '/', 1) as tenant, o.name as object_key, o.created_at
from storage.objects o
where o.bucket_id = 'barbershop-logos'
  and o.created_at < statement_timestamp() - interval '15 minutes'
  and not exists (
    select from public.barbershops b
    where b.logo_url = o.name
       or split_part(split_part(b.logo_url, '?', 1), '#', 1)
          like '%/barbershop-logos/' || o.name
  )
order by o.created_at, o.name;
```

O inventário foi exercitado somente em dados sintéticos. A [leitura final da QA](qa-i31/catalogo-local.txt) encontrou um candidato antigo produzido pela suíte SQL e uma reconciliação administrativa concluída pelo teste de Storage. O teste HTTP protegeu a logo enquanto referenciada, excluiu o tenant sintético, retomou a solicitação pendente, removeu o WebP pela API e confirmou duas vezes com um único registro de auditoria. O catálogo hospedado não foi consultado.

## Arquivos e verificações

- Banco: migration 31 e `tests/postgres/i31-capacity-cleanup.sql`.
- Financeiro: `src/features/admin-billing/actions.ts`, `forms.tsx` e `validation.ts`.
- Logo: `src/app/api/barbershop/logo/route.ts` e `src/features/settings/components/barbershop-logo-card.tsx`.
- Testes da aplicação: `tests/barbershop-logo.test.ts`, `tests/security-and-schema.test.ts` e integrações `c2-dashboard-http.mjs`, `commercial-phase-d.mjs` e `i3-logo.mjs`.

A QA usou uma nova stack Supabase com PostgreSQL 17.11 e a cadeia de migrations 1–30 seguida da 31. Next.js foi compilado em cópia isolada, sem arquivo privado de ambiente, com as credenciais efêmeras da própria QA. Os logs guardam comando, status e resultados identificados, sem cookies, conteúdo de requisição, chaves, DSNs ou UUIDs de sessão.

| Ensaio | Resultado |
| --- | --- |
| Typecheck, lint, build de produção | Saída 0; 8/8 páginas estáticas no build. |
| Vitest | 791 testes em 37 arquivos. |
| PostgreSQL | 150 verificações nas seis suítes: 12 I3.1, 21 Storage I3, 24 C2, 34 C1, 16 C1 concorrente e 43 B2-B. |
| HTTP e Chrome | C2 com operador e bloqueio de plano, aceite obrigatório, jornada de logo com Storage real e jornada comercial D. |
| Git | Diff verificado, incluindo os novos arquivos preparados para o commit. |

Os [logs sanitizados](qa-i31/) permitem conferir cada suíte separadamente. Para reproduzir, usar a QA descartável de loopback descrita no [checkpoint I3](recuperacao-i3.md), aplicar a migration incremental, executar os SQLs na ordem da tabela com `psql -Xq -v ON_ERROR_STOP=1` e executar as integrações uma por vez contra o build para essa QA. A suíte concorrente precisa de `dblink` e de um banco exclusivo para suas fixtures.

## Antes da homologação hospedada

- Confirmar versão e catálogo por leitura autorizada. A opção de membership `WITH INHERIT FALSE, SET TRUE` da migration 30 exige PostgreSQL 16 ou superior. Conferir versões já aplicadas, role e bucket sem colisões, nomes de triggers, constraint da fila e ownership das tabelas e funções.
- Verificar se a identidade de migration tem privilégios para criar roles e transferir funções, criar políticas em `storage.objects`, criar o bucket e alterar os objetos privados da aplicação. O proprietário da função de capacidade precisa ler todas as linhas de equipe e obter lock de leitura do plano. A credencial de Storage usada pelo procedimento deve permanecer no servidor.
- Inventariar contratos preexistentes acima do limite e resolver cada caso comercialmente. A migration valida novos acordos e preserva contratos e equipes existentes.
- Validar backup restaurável, a origem exata do app e os fluxos de primeiro contrato, agenda e logo no ambiente autorizado. Aplicar banco antes da aplicação em janela aprovada. Para falha operacional, interromper a operação afetada, consultar o diário e preservar a fila. Qualquer correção de schema deve ser incremental.

Esta entrega prepara a integração local. Publicação, migration hospedada e início da I4 dependem de autorizações separadas.
