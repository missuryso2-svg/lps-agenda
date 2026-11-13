# LPS Agenda

Fundação técnica do **LPS Agenda**, um SaaS multi-tenant de agenda e gestão para barbearias, desenvolvido pela LPS Solutions.

A versão atual entrega a base de produto: identidade visual, site institucional, autenticação, onboarding, painel administrativo, página pública de demonstração, banco PostgreSQL versionado e políticas de isolamento por barbearia.

> **Estado:** fundação `v0.1` com as Etapas 2.1, 2.2, 2.3 e 3.1 implementadas. Serviços, profissionais, horários, jornadas, bloqueios, clientes e agendamentos estão conectados ao Supabase, com isolamento por barbearia; a validação com dados reais depende de aplicar as migrações e testar em um ambiente autorizado. Cobrança, reserva pública, convites de equipe e página pública real por tenant ainda **não** estão implementados. Nada nesta versão simula integrações externas como se estivessem funcionando.

---

## O que está pronto

- Landing page institucional em pt-BR, com identidade preto/grafite/dourado, tema claro/escuro e layout responsivo.
- Autenticação com Supabase: login, cadastro, confirmação de e-mail, recuperação e redefinição de senha.
- Onboarding transacional: criação da barbearia e do vínculo `owner` na mesma operação.
- Dashboard com troca de barbearia, navegação por papel, topbar, sidebar desktop, menu mobile e estados de carregamento/erro/vazio.
- Páginas de visão geral, agenda, clientes, serviços, equipe, horários, financeiro, plano e configurações.
- **Serviços:** CRUD real, busca por nome, ativação/desativação, preço em centavos e duração validados com Zod no formulário e no servidor.
- **Profissionais:** CRUD real, busca por nome, ativação/desativação, telefone, descrição e associação com os serviços da mesma barbearia.
- **Horários e disponibilidade:** funcionamento semanal da barbearia, jornada individual dos profissionais e bloqueios por dia inteiro ou intervalo, com validação de fuso e sobreposição.
- **Clientes:** cadastro, listagem paginada, busca por nome/telefone/e-mail, filtros por situação, edição, detalhes e arquivamento reversível, com deduplicação dentro da barbearia.
- **Agenda e agendamentos:** visão diária e semanal por profissional, cálculo de horários livres no servidor, criação, confirmação, início, conclusão, ausência, cancelamento com motivo e reagendamento, com proteção contra sobreposição no PostgreSQL.
- Página pública de demonstração `/barbearia/barbearia-aurora`, estática e claramente identificada como fictícia.
- Páginas de termos, privacidade, 404, erro global e aviso de configuração obrigatória.
- Migrações SQL versionadas para 17 tabelas, enums, funções, triggers, grants e RLS.
- Testes estáticos de schema, RLS, segredos, validações, permissões, formatação, do motor de disponibilidade e das Server Actions de catálogo, equipe, horários, clientes e agendamentos.

## O que é protótipo ou está fora desta etapa

- **Pagamentos:** não há chamada ao Asaas. As tabelas `plans`, `subscriptions`, `payments` e `webhook_events` existem, mas nenhuma cobrança é criada.
- **Reserva pública:** o painel já cria e gerencia agendamentos, mas a página pública não consulta disponibilidade nem reserva horários. Não há link de autoatendimento, WhatsApp, notificações ou pagamento.
- **Convites de equipe:** o cadastro de profissionais e os vínculos de `barber_services` já são reais; o fluxo de convite por e-mail para novos acessos ao painel ainda não existe.
- **Página pública por tenant:** a única página pública é a demonstração estática da Barbearia Aurora. Ela não consulta o banco nem reserva horários.
- **Notificações, uploads e webhooks:** as tabelas e colunas estão preparadas; não há envio, armazenamento ou processamento real.
- **Administração global:** o papel `platform_admin` eleva o acesso dentro de uma barbearia, mas não existe um painel global separado.

---

## Etapa 2.1 — Serviços e profissionais

Os módulos de Serviços e Equipe agora persistem no Supabase e operam sobre a barbearia ativa da sessão.

### Serviços

- Listagem, busca por nome, cadastro, edição, exclusão e ativação/desativação.
- Nome, descrição, preço em reais convertido para centavos, duração inteira entre 5 e 600 minutos e status.
- Validação Zod no formulário e novamente no servidor; o banco também aplica `check` de preço, duração e tamanho.
- Nomes duplicados são bloqueados por comparação normalizada (ignora caixa, acentos e espaços repetidos) dentro da mesma barbearia.
- A exclusão verifica agendamentos vinculados e orienta desativar o serviço quando o histórico impede a remoção.

### Profissionais e associações

- Listagem em cards, busca por nome, cadastro, edição, exclusão e ativação/desativação.
- Nome, telefone opcional, descrição/especialidade opcional e status.
- Seleção de serviços no formulário; todos os IDs são validados contra a barbearia ativa antes de qualquer escrita.
- A edição insere os serviços novos, preserva os já vinculados e remove os desmarcados. A PK composta `(barber_id, service_id)` e as FKs compostas com `barbershop_id` impedem duplicidade e vínculo entre tenants.
- A exclusão de profissional com agendamentos é bloqueada; os vínculos de `barber_services` são removidos em cascata pelo banco.
- **Avatar:** não há upload porque o projeto não possui bucket nem políticas de Storage configuradas. Os cards usam as iniciais do nome.

### Segurança

- O `barbershop_id` é sempre obtido de `getActiveDashboardContext()` (sessão Supabase + vínculo ativo + cookie de barbearia validado na lista de memberships), nunca do corpo enviado pelo navegador.
- `owner` e `platform_admin` podem escrever; `staff` consulta em modo somente leitura. A checagem é repetida em cada Server Action e a RLS de `barbers`, `services` e `barber_services` é a barreira final.
- Nenhuma action ou componente usa `SUPABASE_SERVICE_ROLE_KEY`; os clientes administrativos continuam `server-only`.
- Erros de banco são traduzidos para mensagens seguras, sem expor SQL, constraints ou detalhes internos.

### Principais arquivos

- `src/features/services/actions.ts` e `src/features/barbers/actions.ts`
- `src/features/services/components/` e `src/features/barbers/components/`
- `src/lib/validation/services.ts` e `src/lib/validation/barbers.ts`
- `src/lib/auth/management.ts`
- `src/components/dashboard/confirm-delete-dialog.tsx`
- `src/app/dashboard/servicos/page.tsx` e `src/app/dashboard/equipe/page.tsx`
- `tests/catalog-actions.test.ts` e `tests/helpers/fake-supabase.ts`

Nenhuma migration nova foi necessária: as tabelas, FKs, PK composta, índices, grants e políticas já cobriam esta etapa.

---

## Etapa 2.2 — Horários e disponibilidade

A rota `/dashboard/horarios` reúne três abas conectadas ao Supabase e à barbearia ativa da sessão.

### Funcionamento da barbearia

- Exibe os sete dias da semana com ativação/desativação, abertura e fechamento.
- Dias fechados são persistidos em `business_hours` com `is_active = false`, preservando os horários digitados.
- A aplicação mantém uma faixa ativa por dia, embora o schema aceite múltiplas faixas. Faixas duplicadas legadas são consolidadas ao salvar.
- O fechamento precisa ser posterior à abertura, tanto no Zod do formulário quanto no servidor e no `check` do banco.
- Ao reduzir o funcionamento, a action verifica as jornadas ativas existentes e bloqueia a alteração se algum profissional ficaria fora do novo horário.

### Jornada dos profissionais

- Seleção de um profissional da barbearia ativa e edição da semana completa.
- Dias desmarcados representam folga e são gravados com `is_active = false`.
- Cada dia ativo precisa estar integralmente coberto pelo funcionamento da barbearia naquele mesmo dia.
- A action confirma que o profissional pertence ao `barbershop_id` da sessão antes de qualquer escrita; a FK composta `(barber_id, barbershop_id)` reforça a integridade no banco.
- Assim como em `business_hours`, a aplicação consolida uma faixa por dia e remove duplicatas legadas.

### Bloqueios e indisponibilidades

- Bloqueio para um profissional ou para toda a barbearia (`barber_id = null`).
- Dia inteiro ou intervalo de horário, com motivo opcional de até 500 caracteres.
- Listagem separada entre períodos futuros/em andamento e encerrados, com edição e exclusão confirmada.
- Datas e horários locais são convertidos para `timestamptz` usando o fuso da barbearia. O dia inteiro vira `00:00` local até `00:00` do dia seguinte.
- A aplicação impede sobreposição entre bloqueios do mesmo profissional, entre bloqueio geral e qualquer profissional e entre um novo bloqueio geral e bloqueios existentes.
- Edições ignoram o próprio registro na checagem de conflito.

### Segurança

- `barbershop_id` vem exclusivamente de `getActiveDashboardContext()`; nenhum formulário envia o tenant como fonte de autorização.
- `owner` e `platform_admin` escrevem; `staff` consulta em modo somente leitura. Cada action repete a autorização no servidor e a RLS é a barreira final.
- Todas as entradas passam por Zod no servidor, inclusive datas, horários, motivo e IDs.
- Nenhuma action ou componente usa `SUPABASE_SERVICE_ROLE_KEY`.
- Bloqueios gravam `created_by` com o usuário autenticado e sempre filtram leitura/escrita/exclusão por `barbershop_id`.
- Erros de banco são traduzidos para mensagens seguras, sem expor SQL ou detalhes internos.

### Limitações desta etapa

- **Sobreposição de bloqueios validada na aplicação.** `blocked_slots` não possui constraint de exclusão no schema. Duas requisições simultâneas podem passar pela checagem antes de qualquer escrita; uma migration futura pode adicionar uma constraint com `tstzrange` e escopo por profissional/barbearia.
- **Uma faixa por dia na interface.** O schema permite múltiplas faixas em `business_hours` e `barber_working_hours`, mas a edição atual consolida uma faixa por dia.
- **Sem cálculo de disponibilidade ainda.** Os horários e bloqueios estão prontos para a próxima fase, mas o mecanismo de agendamento e a reserva pública não foram implementados.

### Principais arquivos

- `src/features/schedule/actions.ts`
- `src/features/schedule/components/`
- `src/lib/validation/schedule.ts`
- `src/app/dashboard/horarios/page.tsx`
- `src/features/dashboard/queries.ts`
- `src/lib/format.ts`
- `tests/schedule-actions.test.ts`

Nenhuma migration nova foi necessária nesta etapa: `business_hours`, `barber_working_hours` e `blocked_slots` já tinham colunas, FKs, checks, índices, grants e políticas suficientes.

---

## Etapa 2.3 — Clientes

A rota `/dashboard/clientes` agora gerencia a base de clientes da barbearia ativa, com consultas server-side e as mesmas permissões operacionais de owner e staff.

### Cadastro e edição

- Campos: nome completo, telefone obrigatório, e-mail opcional e observações opcionais. CPF, endereço e data de nascimento **não** são coletados nesta fase.
- Nome tem espaços repetidos normalizados e limite de 120 caracteres; observações aceitam até 2000 caracteres.
- Telefone aceita fixo ou celular com DDD, inclusive `+55`, e é persistido apenas com dígitos. A exibição usa `formatPhoneBR`.
- E-mail é validado, convertido para minúsculas e gravado como `null` quando vazio.
- A validação roda no formulário com Zod e novamente no servidor; o banco mantém seus próprios `check` de tamanho.
- O `barbershop_id` é sempre o da barbearia ativa da sessão e não é enviado pelo navegador.
- A edição preserva `barbershop_id`, `birth_date`, `created_at` e demais campos não editáveis.

### Listagem, busca e paginação

- Tabela em desktop e cards em dispositivos móveis, com nome, telefone, e-mail, data de cadastro e situação.
- Busca por nome, telefone e e-mail, executada no servidor e limitada à barbearia ativa.
- A busca por telefone normaliza a digitação para dígitos, então `(11) 98765-4321` encontra `11987654321`.
- Filtros por ativos, arquivados e todos, com contadores calculados no servidor.
- Paginação server-side de 20 registros por página, ordenada por data de cadastro e nome.
- Estados de carregamento, vazio, erro de consulta e atualização automática após cada mutação via `revalidatePath`.
- Página fora do intervalo é corrigida para a última página válida.

### Arquivamento e relacionamentos

- A remoção física não é usada. `customers` já possui `is_active`, então o arquivamento apenas marca o cadastro como inativo.
- Essa escolha preserva observações, dados de contato e o histórico: `appointments.customer_id` referencia `(id, barbershop_id)` com `on delete restrict`.
- O cliente arquivado sai da lista ativa, continua consultável no filtro “Arquivados” e pode ser reativado.
- A operação exige confirmação no diálogo e informa claramente que o histórico é preservado.
- Não existe action de exclusão física de clientes nesta etapa.

### Duplicidade dentro do tenant

- A checagem é feita na aplicação, sempre com o `barbershop_id` da sessão e incluindo clientes arquivados.
- Telefone é comparado por dígitos e por variações formatadas legadas (com/sem `+55` e com pontuação comum).
- E-mail é comparado sem diferenciar maiúsculas de minúsculas.
- O mesmo telefone ou e-mail pode ser cadastrado por outra barbearia; não há restrição global.
- Na edição, o próprio registro é ignorado na checagem.
- **Limitação:** não há índice único de telefone/e-mail normalizado no banco. Duas requisições simultâneas podem passar pela checagem antes da escrita; uma migration futura pode adicionar uma constraint compatível com multi-tenancy.

### Segurança

- `owner`, `staff` e `platform_admin` podem cadastrar, editar e arquivar; a RLS de `customers` permite leitura/inserção/atualização para membros e mantém exclusão física restrita a owner/admin.
- Cada Server Action chama `authorizeCustomerManagement()` antes de validar e escrever.
- Leituras e escritas filtram por `barbershop_id`; um cliente de outra barbearia não é encontrado nem alterado.
- Nenhuma action ou componente usa `SUPABASE_SERVICE_ROLE_KEY`.
- Erros de banco são traduzidos para mensagens seguras, sem expor SQL, constraints ou detalhes internos.
- A interface informa a minimização de dados e o isolamento por barbearia.

### Principais arquivos

- `src/features/customers/actions.ts`
- `src/features/customers/types.ts`
- `src/features/customers/components/`
- `src/lib/validation/customers.ts`
- `src/lib/auth/management.ts`
- `src/features/dashboard/queries.ts`
- `src/app/dashboard/clientes/page.tsx` e `src/app/dashboard/clientes/loading.tsx`
- `tests/customer-actions.test.ts` e `tests/helpers/fake-supabase.ts`

Nenhuma migration nova foi necessária: a tabela `customers`, os índices `customers_shop_idx`/`customers_phone_idx`, a FK composta com `barbershops`, os checks, os grants e as políticas RLS já cobriam esta etapa.

---

## Etapa 3.1 — Agenda e agendamentos

A rota `/dashboard/agenda` passou a operar a agenda real da barbearia ativa, em visão diária ou semanal, com criação e gerenciamento de agendamentos.

### Visão diária e semanal

- A visão diária mostra uma timeline por profissional ativo, com horários livres, agendamentos e bloqueios do dia.
- A visão semanal carrega apenas os sete dias exibidos, com os compromissos agrupados por dia e contagem total do período.
- Navegação por período anterior/próximo, botão “Hoje”, alternância dia/semana e filtro por profissional; o estado fica na URL (`date`, `view` e `barber`).
- Status são diferenciados por cor e rótulo: agendado, confirmado, em atendimento, concluído, cancelado e não compareceu.
- A página exibe indicadores do período (aguardando, em atendimento, cancelados/faltas e previsão de receita), além do fuso da barbearia.
- A visão geral do dashboard aponta para a agenda e abre o diálogo de criação diretamente pelo parâmetro `?new=1`.

### Motor de disponibilidade

- Uma única função no servidor cruza funcionamento da barbearia, jornada individual, bloqueios gerais e por profissional, agendamentos ativos e a duração real do serviço.
- O cálculo usa o fuso configurado em `barbershops.timezone` (fallback `America/Sao_Paulo`) e converte data/hora local para `timestamptz`.
- Horários são oferecidos em passos de 15 minutos e somente quando o serviço cabe inteiro na janela livre.
- Agendamentos com status `cancelled`, `completed` ou `no_show` não bloqueiam novos horários; `scheduled`, `confirmed` e `in_progress` bloqueiam.
- Horários já passados são desconsiderados no momento da consulta e novamente no momento da gravação.
- O serviço precisa estar associado ao profissional em `barber_services`, e ambos precisam estar ativos e pertencer à barbearia ativa.

### Criação e reagendamento

- O fluxo de criação tem quatro etapas: cliente, serviço/profissional habilitado, data/horário e confirmação com observações opcionais.
- Cliente, serviço e profissional são revalidados no servidor contra o `barbershop_id` da sessão; nenhum preço ou duração enviado pelo navegador é aceito.
- O preço é lido de `services.price_cents` no momento da criação e a duração vem do serviço; o horário final é calculado no servidor.
- Imediatamente antes do `insert`/`update`, a disponibilidade é recalculada para reduzir a janela de corrida.
- O reagendamento preserva cliente, serviço, profissional e status, e só é permitido para agendamentos `scheduled` ou `confirmed`; o próprio registro é excluído do cálculo.

### Status, cancelamento e histórico

- Transições permitidas: confirmar (`scheduled → confirmed`), iniciar (`scheduled/confirmed → in_progress`), concluir (`scheduled/confirmed/in_progress → completed`), registrar ausência (`scheduled/confirmed → no_show`) e cancelar (`scheduled/confirmed → cancelled`).
- O cancelamento aceita motivo opcional de até 500 caracteres, libera o horário e mantém o registro no histórico.
- Não há exclusão física de agendamentos nesta etapa.
- Cada transição usa uma atualização condicionada ao status lido, evitando sobrescrever uma mudança feita por outro usuário.

### Concorrência

- A barreira final é a constraint existente `appointments_no_overlap`: `EXCLUDE USING GIST (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)` para os status ativos.
- Se duas requisições passarem pela consulta de disponibilidade ao mesmo tempo, o PostgreSQL rejeita a segunda com o código `23P01`.
- As actions traduzem esse código para “este horário acabou de ser reservado” e orientam atualizar a agenda, sem expor detalhes do banco.
- **Nenhuma migration nova foi necessária** nesta etapa.

### Segurança

- `barbershop_id` vem exclusivamente de `getActiveDashboardContext()`; nenhum formulário envia o tenant como fonte de autorização.
- `authorizeAppointmentManagement()` permite `owner`, `staff` e `platform_admin`, repetindo a checagem em cada action; a RLS de `appointments` continua sendo a barreira final.
- Todas as entradas passam por Zod no servidor, incluindo IDs, data, horário, observações, motivo e busca de clientes.
- Leitura, criação, reagendamento e transições filtram por `barbershop_id`; um agendamento de outra barbearia não é encontrado nem alterado.
- A busca de clientes retorna somente cadastros ativos da barbearia ativa.
- Nenhuma action ou componente usa `SUPABASE_SERVICE_ROLE_KEY`.

### Limitações desta etapa

- **Sem intervalo entre atendimentos.** O schema não possui buffer; um serviço pode começar exatamente quando o anterior termina.
- **Agenda por barbearia, não por profissional logado.** A RLS atual permite que owner e staff operem todos os agendamentos da barbearia; não há restrição adicional para um staff ver apenas a própria coluna.
- **Bloqueios continuam sem constraint de exclusão.** A proteção contra sobreposição de `blocked_slots` é feita na aplicação, como documentado na Etapa 2.2.
- **Sem reserva pública, WhatsApp, notificações ou pagamentos.** Esta etapa cobre apenas a operação interna do painel.

### Principais arquivos

- `src/features/scheduling/actions.ts` e `src/features/scheduling/queries.ts`
- `src/features/scheduling/availability.ts` e `src/features/scheduling/types.ts`
- `src/features/scheduling/components/`
- `src/lib/validation/appointments.ts`
- `src/lib/auth/management.ts`
- `src/app/dashboard/agenda/page.tsx` e `src/app/dashboard/agenda/loading.tsx`
- `tests/availability.test.ts`, `tests/scheduling-actions.test.ts` e `tests/helpers/fake-supabase.ts`

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js `16.4.5` com App Router, Turbopack e Server Components |
| UI | React `19.3.0`, Tailwind CSS `4`, shadcn/ui, Radix UI, Lucide React |
| Tipos | TypeScript `5` em modo `strict` |
| Formulários | React Hook Form + `@hookform/resolvers` + Zod `4` |
| Banco e Auth | Supabase (PostgreSQL, Auth e Row Level Security) |
| Testes | Vitest `5` |
| Lint | ESLint `9` + `eslint-config-next` |

## Requisitos

- Node.js **20.9 ou superior** (validado nesta fundação com Node `26.13.0`).
- npm **10 ou superior** (validado com npm `11.20.0`).
- Docker Desktop apenas se for usar o Supabase local.
- Projeto Supabase local ou na nuvem para testar autenticação e dados reais.

Sem variáveis de ambiente, a landing, a demonstração, as páginas legais e o build continuam funcionando. Login, cadastro, onboarding e dashboard exibem uma tela de configuração obrigatória em vez de quebrar.

---

## Como rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar o arquivo de ambiente

Copie `.env.example` para `.env.local` e preencha as variáveis:

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# macOS/Linux
cp .env.example .env.local
```

O `.env.example` contém exatamente as seis variáveis necessárias, sem valores reais:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
NEXT_PUBLIC_APP_URL=
```

### 3. Subir o Supabase

#### Opção A — Supabase local (recomendado para desenvolvimento)

Requer Docker Desktop em execução.

```bash
npx supabase start
npx supabase db reset
npx supabase status
```

Use a `API URL` e a `anon key` retornadas por `supabase status`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key local>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Serviços locais:

| Serviço | Endereço |
| --- | --- |
| API Supabase | `http://127.0.0.1:54321` |
| PostgreSQL | `127.0.0.1:54322` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Inbucket (e-mails de teste) | `http://127.0.0.1:54324` |

O `config.toml` local já define:

- confirmação de e-mail obrigatória;
- senha mínima de 8 caracteres com letras e dígitos;
- `auto_expose_new_tables = false`;
- seed desabilitado;
- URLs de callback para `http://localhost:3000/auth/callback` e `http://127.0.0.1:3000/auth/callback`.

Os e-mails de confirmação e recuperação enviados localmente aparecem no Inbucket.

#### Opção B — Supabase na nuvem

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Aplique as migrações com a CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Ou execute os arquivos de `supabase/migrations/` **em ordem numérica** no SQL Editor do projeto.

3. Copie a URL do projeto e a chave `anon` em **Project Settings → API**.
4. Em **Authentication → URL Configuration**, adicione as URLs de redirecionamento:

```text
http://localhost:3000/auth/callback
https://seu-dominio.com/auth/callback
```

5. Para produção, configure um provedor de SMTP confiável antes de liberar cadastros.

### 4. Iniciar o app

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

---

## Variáveis de ambiente

| Variável | Exposição | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | URL do projeto Supabase usada no navegador e no servidor. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Chave `anon`; o acesso real é limitado pela RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Somente servidor** | Cliente administrativo, jobs e futuras rotas de webhook. Ignora RLS; nunca deve ir ao navegador. |
| `ASAAS_API_KEY` | **Somente servidor** | Reservada para a futura integração de cobrança. Não é usada nesta versão. |
| `ASAAS_WEBHOOK_TOKEN` | **Somente servidor** | Reservada para validação de webhooks futuros. Não é usada nesta versão. |
| `NEXT_PUBLIC_APP_URL` | Pública | URL base para links de confirmação e recuperação de senha. |

Regras importantes:

- Nunca crie uma variável `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` nem exponha chaves `SUPABASE_SERVICE_ROLE_KEY` ou `ASAAS_*` em Client Components.
- O cliente administrativo fica em `src/lib/supabase/admin.ts`, marcado com `server-only`. Ele ainda não é chamado por nenhuma rota.
- A chave `anon` é pública por design; a proteção dos dados depende das políticas RLS.

---

## Migrações

As migrações estão em `supabase/migrations/` e foram escritas para um banco **novo**, na ordem abaixo. Não são idempotentes: não as execute duas vezes manualmente no mesmo banco.

| Arquivo | Conteúdo |
| --- | --- |
| `20261108090000_extensions_and_enums.sql` | Extensões `pgcrypto`/`btree_gist` e enums de status, papéis, cobrança, notificações e webhooks. |
| `20261108090100_core_tables.sql` | `profiles`, `barbershops`, `barbershop_members`, `barbers`, `services`, `barber_services`, `business_hours`, `barber_working_hours` e `customers`. |
| `20261108090200_scheduling_tables.sql` | `blocked_slots`, `appointments`, índices e restrição de exclusão contra sobreposição por profissional. |
| `20261108090300_billing_and_operations.sql` | `plans`, `subscriptions`, `payments`, `webhook_events`, `notifications` e `audit_logs`. |
| `20261108090400_functions_and_triggers.sql` | Helpers de autorização, criação automática de perfil, proteção de vínculos, auditoria, onboarding transacional e `updated_at`. |
| `20261108090500_rls_policies.sql` | Habilitação de RLS e políticas por tabela. |
| `20261108090600_grants_and_hardening.sql` | Grants explícitos, revogação de acesso anônimo e privilégios padrão restritivos. |

Comandos úteis:

```bash
# Recriar o banco local e aplicar todas as migrações
npx supabase db reset

# Enviar migrações para o projeto vinculado
npx supabase db push

# Ver status dos serviços locais
npx supabase status
```

> **Validação:** não havia Docker/PostgreSQL local neste ambiente e nenhuma alteração foi aplicada ao projeto Supabase vinculado. As migrações foram revisadas e validadas por testes estáticos, mas **não foram executadas em um banco real nesta entrega**. O primeiro passo da próxima etapa é rodar `supabase db reset` em um ambiente local ou `db push` com autorização e testar as políticas com dois tenants distintos.

---

## Modelo de dados

São 17 tabelas no schema `public`:

- **Identidade:** `profiles`.
- **Tenant:** `barbershops`, `barbershop_members`.
- **Equipe e catálogo:** `barbers`, `services`, `barber_services`.
- **Horários:** `business_hours`, `barber_working_hours`, `blocked_slots`.
- **Operação:** `customers`, `appointments`.
- **Cobrança:** `plans`, `subscriptions`, `payments`, `webhook_events`.
- **Comunicação e auditoria:** `notifications`, `audit_logs`.

Decisões relevantes:

- Todas as chaves primárias são `uuid`.
- Tabelas mutáveis usam `created_at` e `updated_at` com trigger de atualização.
- Todo dado operacional referencia `barbershop_id`.
- As FKs compostas incluem `barbershop_id` para impedir que um agendamento misture cliente, profissional e serviço de barbearias diferentes.
- `appointments` usa uma restrição `exclude using gist` para bloquear sobreposição de horário do mesmo profissional nos status `scheduled`, `confirmed` e `in_progress`.
- `barbershop_members` tem índice único de proprietário ativo por barbearia e trigger que impede ficar sem owner.
- `payments.appointment_id` usa `on delete set null (appointment_id)`, recurso do PostgreSQL 15+. O projeto local está configurado com PostgreSQL 17.

---

## Segurança e RLS

Todas as tabelas do schema `public` têm Row Level Security habilitado. A regra central é: **um usuário autenticado só acessa dados de barbearias das quais é membro ativo**.

### Administrador da plataforma

O papel global é lido exclusivamente de `auth.jwt() -> 'app_metadata' ->> 'lps_role'`. O valor esperado é:

```json
{ "lps_role": "platform_admin" }
```

Nunca use `user_metadata` para isso: esse campo pode ser alterado pelo próprio usuário. Para promover uma conta já existente, execute no SQL Editor com uma conta administrativa confiável:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('lps_role', 'platform_admin')
where email = 'admin@exemplo.com';
```

Depois, saia e entre novamente (ou renove o token) para que o novo JWT inclua a claim. Para remover:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'lps_role'
where email = 'admin@exemplo.com';
```

### Matriz resumida de acesso

| Tabela | Leitura | Escrita |
| --- | --- | --- |
| `profiles` | Próprio perfil, colegas de barbearia e admin | Próprio `full_name`, `phone`, `avatar_url`; admin |
| `barbershops` | Membro ativo ou admin | Owner ou admin (colunas públicas) |
| `barbershop_members` | Membro ativo ou admin | Owner pode inserir `staff`, atualizar papel/atividade e remover; admin |
| `barbers`, `services`, `barber_services`, `business_hours`, `barber_working_hours`, `blocked_slots` | Membro ativo ou admin | Owner ou admin |
| `customers`, `appointments` | Membro ativo ou admin | Membro ativo cria/edita; exclusão apenas owner/admin |
| `plans` | Qualquer autenticado | Admin da plataforma |
| `subscriptions`, `payments` | Owner ou admin | Admin da plataforma; service role para jobs |
| `webhook_events` | Admin da plataforma | Service role |
| `notifications` | Própria notificação ou admin | Própria notificação; inserção via service role |
| `audit_logs` | Owner da barbearia ou admin | Apenas triggers internos; sem DML direto para usuários |

### Proteções adicionais

- O schema `private` concentra helpers `security definer` com `search_path = ''`; ele não é exposto pela Data API.
- O trigger de vínculos impede mover membership entre barbearias, trocar o usuário e alterar o próprio papel.
- Um trigger de constraint garante ao menos um `owner` ativo por barbearia.
- Triggers de auditoria registram alterações em memberships, agendamentos e assinaturas.
- `anon` não recebe acesso a nenhuma tabela de negócio. A demonstração pública é estática e não consulta o banco.
- Grants são explícitos; privilégios padrão para tabelas, sequences e funções futuras foram revogados de `anon` e `authenticated`.
- A política de recuperação de senha responde de forma genérica, evitando enumeração de e-mails.
- O callback de autenticação aceita `code` e `token_hash`/`verifyOtp` e valida o caminho de retorno com `safeNextPath`.
- Respostas HTTP enviam `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`; `Strict-Transport-Security` é adicionado em produção.

### Limitações de segurança conhecidas

- `profiles` é compartilhado entre membros da mesma barbearia, incluindo e-mail e telefone quando preenchidos. Isso é intencional para a página de equipe, mas deve ser revisto se esses dados passarem a ser sensíveis.
- O cliente administrativo com service role existe, mas não está conectado a nenhuma rota. Quando for usado em webhooks, valide assinatura/token, idempotência e origem antes de qualquer escrita.
- Ainda não há rate limiting de aplicação para cadastro, login ou criação de barbearias. Configure limites no Supabase e/ou em um proxy de borda antes de produção.
- Não há teste automatizado com banco real nem teste E2E de RLS. A validação atual é estática.

---

## Arquitetura

```text
src/
  app/
    (auth)/                 login, cadastro, recuperar-senha, redefinir-senha
    auth/callback/          troca de code/token_hash por sessão
    dashboard/              visão geral, agenda, clientes, serviços, equipe,
                            horários, financeiro, plano e configurações
    onboarding/             criação transacional da barbearia
    barbearia/[slug]/       demonstração pública estática
    termos/, privacidade/   páginas legais
  components/
    ui/                     componentes shadcn/ui
    dashboard/              shell, sidebar, topbar, cards, tabelas e estados
    marketing/              header, footer e layout legal
    brand/                  logo e alternador de tema
    forms/                  campos e mensagens reutilizáveis
  features/
    auth/                   actions, mensagens e formulários
    barbershop/             actions de criação, troca e edição
    onboarding/             formulário de primeiro acesso
    dashboard/              consultas do painel
    services/               actions e componentes do catálogo
    barbers/                actions e componentes da equipe de atendimento
    schedule/               actions e componentes de horários e bloqueios
    customers/              actions e componentes da base de clientes
    scheduling/             agenda, disponibilidade e agendamentos
    settings/               formulário de configurações
    marketing/              landing page
    public-barbershop/      dados fictícios da demonstração
  lib/
    auth/                   sessão, DAL e permissões
    supabase/               clients browser/server/admin/proxy
    validation/             schemas Zod
    env/                    leitura e validação de ambiente
    format.ts, slug.ts, ... helpers
  types/database.ts         tipos do schema Supabase
  proxy.ts                  renovação de sessão e checagens otimistas
supabase/
  config.toml
  migrations/               sete migrações versionadas
tests/                      Vitest (schema, RLS, segredos, validações)
```

Decisões de implementação:

- Server Components são o padrão; Client Components existem apenas para formulários, menus, tema e interações.
- `src/proxy.ts` renova a sessão e faz checagens otimistas. A autorização real acontece na DAL (`requireDashboardContext`/`requireOwnerDashboardContext`), nas Server Actions e na RLS.
- Páginas de autenticação, onboarding e dashboard usam `dynamic = "force-dynamic"` para não depender de sessão em build estático.
- A demonstração pública usa `dynamicParams = false` e apenas o slug `barbearia-aurora`, com `robots: noindex`.
- O botão de agendamento da demo e os recursos futuros usam o modal `PrototypeAction`, deixando explícito que nenhum dado é criado.

### Rotas

| Rota | Descrição |
| --- | --- |
| `/` | Landing page institucional |
| `/login` | Entrada de usuários |
| `/cadastro` | Criação de conta com confirmação de e-mail |
| `/recuperar-senha` | Solicitação de link de recuperação |
| `/redefinir-senha` | Definição de nova senha após recuperação |
| `/onboarding` | Criação da primeira barbearia |
| `/dashboard` | Visão geral da barbearia ativa |
| `/dashboard/agenda` | Agenda diária/semanal, disponibilidade e gestão de agendamentos |
| `/dashboard/clientes` | Base de clientes (busca, filtros, paginação, CRUD e arquivamento) |
| `/dashboard/servicos` | Catálogo de serviços (CRUD, busca, status) |
| `/dashboard/equipe` | Acessos, profissionais e associação de serviços |
| `/dashboard/horarios` | Funcionamento, jornada dos profissionais e bloqueios |
| `/dashboard/financeiro` | Indicadores financeiros (owner/admin) |
| `/dashboard/plano` | Plano e assinatura (owner/admin) |
| `/dashboard/configuracoes` | Dados da barbearia (owner/admin) |
| `/barbearia/barbearia-aurora` | Demonstração pública fictícia |
| `/termos`, `/privacidade` | Páginas legais |

---

## Scripts

| Comando | Função |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com Turbopack. |
| `npm run build` | Build de produção. |
| `npm run start` | Servidor de produção após o build. |
| `npm run lint` | ESLint em todo o projeto. |
| `npm run typecheck` | Verificação TypeScript sem emissão. |
| `npm test` | Testes Vitest em modo run. |
| `npm run test:watch` | Testes em modo watch. |

---

## Validação executada

Resultados da última verificação local:

```text
npm run typecheck  ✅
npm run lint       ✅
npm test           ✅ 252 testes em 9 arquivos
npm run build      ✅
```

Também foram verificadas manualmente no navegador as rotas públicas, `/login` e o redirecionamento de `/dashboard` sem sessão. Não houve erros de console nas páginas válidas. Os headers de segurança foram confirmados na resposta HTTP do servidor local.

Os testes cobrem:

- presença e ordem das migrações;
- RLS habilitado em todas as 17 tabelas;
- isolamento por `barbershop_id`;
- reconhecimento de admin apenas via `app_metadata`;
- função de onboarding transacional;
- restrição de sobreposição de agenda;
- ausência de acesso anônimo às tabelas;
- políticas de leitura para membros e escrita owner/admin em `barbers`, `services` e `barber_services`;
- `.env.example` com exatamente seis variáveis vazias;
- cliente administrativo marcado como `server-only`;
- ausência de segredos em Client Components e nas Server Actions;
- derivação de `barbershop_id` da sessão ativa, ignorando valores injetados no formulário;
- cadastro, edição, exclusão e ativação/desativação de serviços;
- cadastro, edição, exclusão e ativação/desativação de profissionais;
- associação, substituição e deduplicação de `barber_services`;
- bloqueio de associação entre barbearias e de exclusão com agendamentos;
- permissões de owner, staff e `platform_admin`, usuário não autenticado e dados inválidos;
- normalização de preço em reais e de nome para duplicidade;
- cadastro e edição dos horários semanais da barbearia, incluindo dias fechados;
- consolidação de faixas duplicadas e validação de fechamento anterior à abertura;
- cadastro e edição da jornada individual, incluindo folgas;
- rejeição de jornada fora do funcionamento ou em dia fechado da barbearia;
- criação, edição e exclusão de bloqueios de dia inteiro e por intervalo;
- conversão de horários locais para `timestamptz` no fuso da barbearia;
- detecção de sobreposição por profissional, bloqueio geral e edição do próprio registro;
- isolamento de bloqueios e profissionais de outra barbearia;
- bloqueio de escrita para `staff` nas três áreas;
- cadastro de clientes com normalização de nome, telefone e e-mail e derivação do tenant da sessão;
- edição de clientes preservando `barbershop_id` e campos não editáveis;
- prevenção de telefone e e-mail duplicados dentro da mesma barbearia, incluindo arquivados e variações de formatação;
- permissão do mesmo telefone/e-mail em barbearias diferentes;
- arquivamento e reativação via `is_active`, sem exclusão física;
- bloqueio de edição/arquivamento de clientes de outra barbearia;
- listagem paginada, busca por nome, telefone e e-mail, filtros por situação e estatísticas por tenant;
- erro de consulta sem inventar registros e página fora do intervalo corrigida;
- políticas RLS de clientes e FK restritiva com agendamentos;
- cálculo de disponibilidade por funcionamento, jornada, bloqueios, agendamentos ativos, duração, passo de 15 minutos e horário atual;
- criação de agendamento com preço/duração lidos do banco e validação de cliente, serviço e profissional no tenant;
- rejeição de sobreposição, bloqueio, dia fechado, jornada incompatível e data passada;
- tradução de `23P01` na criação e no reagendamento, simulando a corrida após a consulta;
- transições de status permitidas, cancelamento com motivo e liberação do horário;
- reagendamento preservando serviço/profissional e recusando registros encerrados ou de outro tenant;
- isolamento de agendamentos, clientes, serviços e profissionais entre barbearias;
- validações de auth, barbearia, clientes, agendamentos, permissões e formatação.

O que **não** foi testado:

- aplicação real das migrações em PostgreSQL;
- CRUD real com credenciais de teste no Supabase vinculado (não houve autorização para alterar dados remotos);
- login, cadastro e recuperação com Supabase real;
- políticas RLS com usuários de duas barbearias em banco real;
- fluxos E2E de catálogo/equipe/horários/clientes/agenda no navegador;
- concorrência real de bloqueios simultâneos no banco;
- concorrência real de cadastros duplicados de clientes no banco;
- concorrência real de dois agendamentos simultâneos no PostgreSQL (a constraint existe, mas a corrida é simulada nos testes);
- integração Asaas, webhooks, e-mails de produção e jobs;
- upload de avatar (sem Storage configurado).

---

## Limitações conhecidas

1. **Sem banco real nesta entrega.** Não havia Docker/PostgreSQL local, e o projeto Supabase vinculado não foi alterado. As migrações e os CRUDs precisam ser aplicados e validados em um ambiente de desenvolvimento com autorização.
2. **Sem pagamentos.** As tabelas e a UI financeira são uma fundação; não há cobrança, assinatura ativa, boleto, Pix ou cartão.
3. **Sem reserva pública.** A agenda interna já cria e gerencia agendamentos, mas não há autoatendimento público, link por tenant, WhatsApp, notificações ou pagamento.
4. **Sem convites.** Profissionais e vínculos de serviço já são gerenciados, mas não há fluxo de convite por e-mail, aceite ou reenvio para novos acessos ao painel.
5. **Sem página pública real por tenant.** A demo é estática, com dados fictícios, e não reserva horários.
6. **Sem uploads.** `logo_url`, `cover_url` e `avatar_url` existem no schema, mas não há bucket/políticas de Storage configurados; os profissionais usam iniciais.
7. **Sem notificações reais.** A tabela `notifications` existe; não há envio por e-mail, WhatsApp ou push.
8. **Sem painel global de plataforma.** O `platform_admin` eleva o acesso dentro de uma barbearia; não há uma área separada para administrar todos os tenants.
9. **Transferência de propriedade limitada.** Há um único owner ativo por barbearia; a troca exige intervenção administrativa/manual, e a exclusão do único owner é bloqueada pelo trigger de proteção.
10. **Dependência de PostgreSQL 15+.** O `on delete set null (appointment_id)` não funciona em versões anteriores.
11. **Associações sem transação única.** A atualização de `barber_services` valida os serviços antes de escrever e segue uma ordem segura, mas upsert e remoção são chamadas separadas. Se a segunda falhar, a interface orienta salvar novamente.
12. **Duplicidade de serviço validada na aplicação.** O schema não possui `unique` para nome normalizado; a checagem é feita no servidor e pode ser contornada apenas por escrita direta com privilégios de owner. Não há coluna gerada nem extensão `unaccent` aplicada nesta etapa.
13. **Sobreposição de bloqueios sem constraint no banco.** `blocked_slots` não tem constraint de exclusão; a validação é feita na aplicação e duas requisições concorrentes podem gravar períodos sobrepostos. Uma migration futura pode adicionar `exclude using gist` com escopo por profissional e barbearia.
14. **Uma faixa por dia na interface.** `business_hours` e `barber_working_hours` aceitam múltiplas faixas, mas a edição atual mantém uma faixa por dia e consolida duplicatas legadas ao salvar.
15. **Duplicidade de cliente validada na aplicação.** `customers` não possui índice único de telefone/e-mail normalizado. A checagem considera arquivados e variações de formatação, mas duas requisições concorrentes podem gravar duplicatas; uma migration futura pode adicionar índice funcional com escopo por `barbershop_id`.
16. **Clientes não têm exclusão física na interface.** O arquivamento preserva histórico e relacionamentos. Atender a um pedido de eliminação da LGPD exige procedimento administrativo no banco, verificando antes se não há agendamentos vinculados.

---

## Próximos passos recomendados

1. **Provisionar o Supabase** e aplicar as sete migrações em um projeto de desenvolvimento.
2. **Testar RLS com dois tenants**: criar duas barbearias, dois owners e um staff; tentar leituras e escritas cruzadas via API.
3. **Implementar convites de acesso ao painel**, incluindo aceite, reenvio e revogação; o cadastro de profissionais já está concluído.
4. **Validar a agenda com dados reais**, aplicando as migrações e testando criação, reagendamento e concorrência em PostgreSQL.
5. **Conectar o Asaas no servidor**, com webhook idempotente, validação de token e registro em `webhook_events`.
6. **Criar a página pública real por tenant**, com slug dinâmico, serviços, equipe e reserva de horários sobre o mesmo motor de disponibilidade.
7. **Adicionar testes E2E** (Playwright ou similar) e um pipeline de CI com typecheck, lint, testes e build.
8. **Configurar observabilidade e limites**: logs, alertas, rate limiting, backup e política de retenção.

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| “Supabase não configurado” | `.env.local` ausente ou incompleto | Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` e reinicie o dev server. |
| Cadastro não envia e-mail | SMTP local/cloud não configurado | Local: abra o Inbucket em `http://127.0.0.1:54324`. Cloud: configure SMTP. |
| Link de confirmação cai em erro | URL de callback fora da allow-list | Adicione `.../auth/callback` em Authentication → URL Configuration. |
| `create_barbershop` não existe | Migrações não aplicadas | Rode `npx supabase db reset` ou `db push`. |
| Admin não é reconhecido | Claim ausente no JWT ou papel em `user_metadata` | Use `raw_app_meta_data.lps_role` e faça login novamente. |
| `docker` não encontrado | Docker Desktop não instalado/aberto | Instale/abra o Docker ou use um projeto Supabase na nuvem. |
| Build falha por ambiente | Variáveis públicas inválidas | Verifique se a URL é válida e a chave `anon` está preenchida. |

---

## Licença e uso

Projeto proprietário da **LPS Solutions**. Uso interno e evolução restrita à equipe autorizada.
