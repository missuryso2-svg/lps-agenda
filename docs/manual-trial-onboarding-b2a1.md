# B2-A1 · Onboarding transacional de trial

A migration `20261118130000_manual_trial_onboarding.sql` segue a B1. Não há consumidor na aplicação. O controle privado nasce desligado.

## Contrato e recuperação

`public.create_barbershop_with_manual_trial(p_intent_id uuid, p_name text, p_slug text, p_phone text default null, p_timezone text default 'America/Sao_Paulo') returns uuid`

O futuro cliente deve gerar um UUID por intenção de cadastrar uma barbearia e preservá-lo antes do primeiro POST. Se a resposta se perder, repetir com a mesma sessão de usuário, chave e dados. Uma nova intenção usa outro UUID. O banco normaliza espaços, slug, telefone vazio e fuso padrão como no cadastro existente. Valida a identidade por `auth.uid()` e reaproveita `create_barbershop` para validar nome, slug e fuso e criar a barbearia e o proprietário.

Um advisory lock transacional por usuário e intenção vem antes da busca. A chave primária completa e o cadastro normalizado ficam em `private.manual_trial_intents`. Uma colisão de hash do lock só serializa duas operações. O resultado anterior só é devolvido ao mesmo usuário enquanto ele conservar o vínculo ativo de proprietário. Alterar os parâmetros com a mesma chave retorna `22023`. Outro usuário que tente o mesmo slug recebe `23505` sem identificador do titular. Replay não estende o teste, mesmo após cancelamento. A recuperação requer flag ligada. Com isolamento superior a READ COMMITTED, repetir a transação inteira com a mesma chave em caso de erro de serialização.

No primeiro cadastro, a RPC grava o ID devolvido pela criação da barbearia, o usuário e o instante do banco na intenção. Insere apenas o trial Básico, sem acordo ou preço, com fim em 168 horas. A referência UUID local obrigatória do schema é gerada pelo PostgreSQL. Não é um ID de recurso remoto. O estado de gateway é `inactive`, e os campos de recorrência e leases ficam nulos. Qualquer falha desfaz barbearia, vínculo, intenção e trial.

## Autorização

| Identidade | Capacidade |
|---|---|
| `anon` | Sem EXECUTE na RPC. |
| `authenticated`, incluindo owner, staff ou o claim legado `platform_admin` | Pode solicitar seu próprio novo cadastro com a flag ligada. Não fornece proprietário, tenant, plano, duração, preço ou status à RPC. A quarentena B1 continua valendo para escrita financeira direta. |
| `service_role` | Sem EXECUTE na RPC e sem escrita na configuração. BYPASSRLS continua sujeito ao trigger de quarentena. |
| `lps_trial_onboarding` | Papel NOLOGIN, NOINHERIT, sem BYPASSRLS, sem CREATE persistente em public, sem propriedade de tabelas. É o proprietário de uma única função. Pode ler o Básico ativo e a configuração, ler e inserir intenções e inserir oito colunas de subscriptions. Seu acesso a criar barbearia e proprietário é pela função existente. |
| Infraestrutura do banco | Controla o registro privado de ativação e as migrations. A concessão transitória para transferir a função é revogada. O criador do papel retém a autoridade administrativa inerente ao PostgreSQL. |

No contexto Supabase testado, o dono da tabela é `postgres`; a identidade de execução da RPC é o papel dedicado. `session_user` continua sendo `authenticator` e o papel de sessão selecionado continua sendo `authenticated`. O trigger usa o `current_user` efetivo e verifica relação, operação, formato do trial, plano ativo, flag, intenção com o mesmo instante/tenant/usuário e vínculo owner. As colunas graváveis e a policy de INSERT também limitam o papel. Nenhuma credencial de API tem associação que permita assumir essa identidade.

O `postgres` gerenciado pode chamar `auth.uid()`, mas não pode delegar USAGE no schema auth. O helper privado `trial_onboarding_actor()` usa corpo SQL vinculado na criação e SECURITY INVOKER. O único valor que retorna é `auth.uid()`; o helper não consulta tabelas nem eleva privilégios. A nova RPC tem `search_path` vazio. As tabelas privadas não têm grants para anon, authenticated ou service_role. O snapshot da intenção guarda o cadastro normalizado, inclusive o telefone informado, para comparação após uma perda de resposta.

## Ativação futura

Depois da homologação do isolamento do Asaas e do bloqueio de agendamentos ao término do trial, a infraestrutura autorizada poderá executar `UPDATE private.manual_trial_activation SET enabled = true WHERE singleton`. Para desabilitar, usar `false`. Conferir o valor com SELECT na mesma operação administrativa. Não há RPC de ativação. Desligar impede novas chamadas e replays; transações já autorizadas e em curso podem terminar. Nesta fase, só os testes em QA alternam a configuração.

O cron e o checkout legados ainda precisam de isolamento por origem. A B2-A1 não resolve a autorização de agenda após o vencimento. Manter o registro desligado nos ambientes que atendem usuários.

## Reprodução em QA exclusiva

Reconstruir as migrations na ordem numérica com o Supabase CLI e um projeto/portas dedicados. Para testar atualização, inserir `tests/postgres/manual-billing-legacy.sql` após as primeiras 19 migrations, depois aplicar B1 e B2-A1 com a CLI. Confirmar 21 versões no histórico.

Executar os quatro scripts com psql e `-X -v ON_ERROR_STOP=1 -d postgres`. Usar `postgres` para `manual-billing.sql` e `supabase_admin` da QA para `manual-trial-onboarding.sql` e os dois scripts de concorrência. Os testes de identidade usam o superusuário de QA apenas para montar fixtures e iniciar a sessão como authenticator. As RPCs são invocadas sob o papel de API. Os scripts de concorrência usam dblink por socket local e deixam fixtures sintéticas no banco descartável. O de onboarding reverte a ativação ao final. Se for interrompido, verificar a flag antes de reutilizar a QA.
