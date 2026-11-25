# Fase D — contratação assistida

A LPS Solutions define a mensalidade e as condições com cada barbearia. A vitrine pública e o painel de quem ainda não tem assinatura apresentam a mesma oferta.

| Plano | Profissionais ativos |
| --- | --- |
| Básico | 1 |
| Profissional | Até 5 |
| Premium | Até 10 |

A recomendação visual do Profissional identifica a opção para equipes de até cinco pessoas. Os benefícios apresentados incluem agenda por profissional, agendamento por link, gestão de serviços, horários e clientes. Os valores de `public.plans` continuam atendendo o catálogo legado. O preço do acordo manual vem de `subscriptions.contracted_price_cents`. A comunicação do teste informa 168 horas no Básico, sujeitas à liberação pela LPS Solutions; a criação de conta não promete nem inicia o teste.

## Canal comercial

Configure `LPS_COMMERCIAL_WHATSAPP` no ambiente do processo Next.js e reinicie o servidor. Em desenvolvimento, use a configuração local ignorada pelo Git. Informe apenas dígitos, com código do país. Para o Brasil, use 55, DDD e número do telefone, sem zero de operadora, espaços, sinais ou pontuação. A aplicação verifica a numeração internacional e o formato canônico. Essa validação verifica o formato, não a titularidade nem o cadastro no WhatsApp.

Com um número válido, cada CTA abre `https://wa.me/` com uma única mensagem codificada em `text`. A pessoa pode revisar o texto antes de enviá-lo. O componente não recebe parâmetros de navegação, dados de conta ou detalhes do contrato.

| Consulta | Texto preenchido |
| --- | --- |
| Básico | Olá! Tenho interesse no plano Básico do LPS Agenda, para 1 profissional. Gostaria de conhecer os valores e as condições de contratação. |
| Profissional | Olá! Tenho interesse no plano Profissional do LPS Agenda, para até 5 profissionais. Gostaria de receber uma proposta comercial. |
| Premium | Olá! Tenho interesse no plano Premium do LPS Agenda, para até 10 profissionais. Gostaria de conhecer os valores e as condições. |
| Geral | Olá! Gostaria de conhecer o LPS Agenda e entender como ele pode ajudar na gestão da minha barbearia. |

**Canal oficial.** A LPS Solutions aprovou +55 71 99955-5390. Configure `LPS_COMMERCIAL_WHATSAPP=5571999555390` no servidor Next.js de cada ambiente. A interface informa “Canal comercial em configuração” quando o valor está ausente ou inválido. Antes do lançamento, a equipe deve confirmar o destinatário no WhatsApp. Os testes interceptam a navegação e não enviam mensagens.

## Da proposta à confirmação

1. O visitante compara os limites, consulta o plano e decide se envia a mensagem no WhatsApp. Cadastro, demonstração e login continuam independentes da proposta.
2. A LPS Solutions combina plano, mensalidade, competência, vencimento e condições com a barbearia.
3. Um operador financeiro autorizado abre **Barbearias** em `/admin/assinaturas`, seleciona o cadastro e usa **Aplicar assinatura manual**. A I3 aceita uma barbearia existente sem histórico contratual e preserva a conciliação dos legados. Uma conta Auth precisa ter uma barbearia cadastrada para constar no diretório. [Elegibilidade e homologação I3](recuperacao-i3.md)
4. O operador emite a mensalidade por competência. Depois de conferir o crédito no extrato, confirma a parcela Pix no painel. O PostgreSQL registra o evento e determina a cobertura. Agendamento, carência, suspensão e retomada seguem as regras existentes.

O clique usa um link comum. Não há webhook comercial, emissão de Pix ou automação de baixa. O canal funciona sem credenciais administrativas, flags financeiras ou worker.

## Área de assinatura

| Situação | Experiência em `/dashboard/plano` |
| --- | --- |
| Sem assinatura atual | Vitrine sem preços públicos, contato por plano e histórico Asaas anterior quando existente. A entrada pública de checkout exige uma assinatura Asaas pendente para retomar uma contratação existente. |
| Trial manual | Plano, estado e período conforme o relógio do banco, acesso da agenda e contato. Quando liberado, dura 168 horas no Básico com 1 profissional e depende das ativações de onboarding existentes. |
| Acordo manual | O proprietário ativo consulta o valor negociado, o período contratual, o primeiro vencimento e a data da parcela em aberto mais antiga, quando disponível. Período acordado e liberação de agendamentos são informações distintas. |
| Asaas existente | Consulta privada de situação, valores contratados e faturas históricas. Troca, cancelamento e retomada de pendência permanecem sujeitos às validações legadas. Preços apresentados para troca vêm do catálogo legado. |

A migration local `20261120142304_owner_manual_plan_details.sql` estende a RPC de leitura `get_owner_manual_trial`, preservando assinatura, permissões e verificação do vínculo de proprietário no tenant. Projeta somente os campos necessários. As tabelas manuais continuam protegidas. O painel operacional de gestores e operadores mantém a autorização C1/C2.

**Estado atual e ativação futura.** A leitura somente de leitura da Fase H confirmou a migration 29 (`20261120180000`) no projeto hospedado; a migration 26 e as extensões posteriores do painel já estão disponíveis nesse destino. Isso não habilita onboarding: mantenha `MANUAL_TRIAL_ONBOARDING_ENABLED=false` e `private.manual_trial_activation.enabled=false` até aprovação operacional separada. A publicação dos links, a adesão financeira e o trial são decisões independentes. Configure `NEXT_PUBLIC_APP_URL` com a origem HTTPS definitiva somente depois de o domínio e o provedor de hospedagem serem escolhidos e validados.

## Homologação

Execute `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `git diff --check`. A suíte `tests/commercial.test.ts` valida numeração, catálogo, mensagens e destino. A suíte `tests/integration/commercial-phase-d.mjs` exige um Supabase descartável com as migrations do repositório e um build para sua URL local.

O ambiente segue o helper `tests/integration/local-next-qa.mjs`: projeto temporário `b2a2-app-<timestamp>`, Supabase em `127.0.0.1:59121` e Next em `127.0.0.1:59130`. No processo de QA configure `B2A2_QA_PROJECT`, as chaves locais correspondentes, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `C2_QA_PLAYWRIGHT` (arquivo de entrada de playwright-core) e `C2_QA_CHROME` (executável do Chrome). Rode `node tests/integration/commercial-phase-d.mjs`; `PHASE_D_QA_SCREENSHOTS` define uma pasta opcional fora do repositório. O teste cria identidades e registros sintéticos, compara os contadores financeiros antes e depois dos cliques e confere a resposta privada como proprietário, membro da equipe e usuário de outra barbearia.
