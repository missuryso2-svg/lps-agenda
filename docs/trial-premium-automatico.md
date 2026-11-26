# Trial Premium automático · checkpoint J2-C

A implementação parte de 3a0691f em codex/redesign-j2. A J2-C3 aguarda aprovação visual explícita da J2-C2. A publicação comercial continua em NO-GO até homologação e autorização.

## Concessão e cobertura

A migration [20261126095208](../supabase/migrations/20261126095208_automatic_premium_trial.sql) usa a RPC canônica de criação da barbearia. Ela verifica o e-mail em Auth, exclui identidades anônimas, cria a barbearia e seu vínculo de proprietário e registra uma assinatura manual em trialing, Premium do catálogo ativo e limite de 10 profissionais. O PostgreSQL grava início e fim na mesma transação. O período tem 604.800 segundos, incluindo mudanças de fuso ou horário de verão. A concessão gera o registro privado e o audit log de assinatura existente. Ela não gera valor contratado, mensalidade, Pix ou cobrança automática.

A chave primária da participação resolve a concorrência entre onboarding e convite. O lock por identidade serializa requisições de cadastro. A chave única da concessão e a assinatura corrente protegem os estados resultantes. Repetir o identificador original retorna a mesma barbearia enquanto ela pertencer ao proprietário. O registro sobrevive à exclusão do tenant e à remoção de vínculos. Contas com vínculo ativo, inativo ou identificado no histórico de auditoria antes da migration ficam inelegíveis. A instalação bloqueia a escrita da tabela de vínculos durante a carga histórica e instalação do trigger. As operações usam o catálogo, as primitivas e os papéis restritos existentes no Supabase. [Documentação de funções](https://supabase.com/docs/guides/database/functions) · [Locks e duração](https://www.postgresql.org/docs/current/explicit-locking.html).

A concessão automática começa desabilitada no banco. A consulta pública informa apenas a disponibilidade do benefício e exige Premium ativo com o limite previsto. A liberação automática e o fluxo assistido do Básico são mutuamente exclusivos. A flag MANUAL_TRIAL_ONBOARDING_ENABLED e o gate de banco do legado continuam operacionais. Com a oferta fechada, páginas públicas usam a comunicação condicional anterior, em dias.

A janela de reservas é inclusiva no início e exclusiva no fim. Após o fim, o PostgreSQL bloqueia novas reservas online pela regra existente. Painel, clientes, equipe, serviços, atendimentos e visão de planos ficam acessíveis conforme a autorização existente. O estado efetivo é calculado no servidor e não depende de Cron. Uma barbearia aberta depois por quem já recebeu o benefício entra na política manual sem cobertura até a contratação. Isso fecha a possibilidade de trocar de identificador e voltar ao agendamento liberado do legado, inclusive após excluir a primeira barbearia. O novo tenant entra sem fatura ou assinatura e pode receber um acordo manual.

O acordo antecipado encerra a cobertura gratuita ao registrar o contrato pendente e usa o mesmo aviso de agendamentos. A ação exige confirmação explícita também no RPC financeiro. O payload canônico do diário continua compatível com reenvios de operações já registradas. A cobertura negociada para a conversão não pode preceder o início do trial ou o minuto da operação. A verificação de capacidade continua usando o lock de cobertura e o catálogo. Um downgrade incompatível reverte o encerramento do trial junto com o contrato e preserva a equipe. A emissão e a conferência manual do Pix seguem como operações separadas. A administração só exibe conversão paga após um Pix conferido, sem contar o trial como receita.

## Interface e arquivos

- Marketing, demonstração, cadastro e onboarding usam a disponibilidade pública, a comunicação em dias e a CTA aprovada. O plano mostra o estado efetivo, o catálogo, o limite e o canal manual.
- O dashboard mostra uma faixa com dias remanescentes, encerramento e progresso. A renderização parte de uma hora observada no banco. O navegador usa um relógio monotônico apenas para atualizar a apresentação. A política de acesso consulta o servidor em cada operação.
- A RPC de boas-vindas registra a exibição uma vez e permite abrir o modal somente para o proprietário original com vínculo atual de owner. Em duas abas concorrentes, só uma recebe autorização. O diálogo nativo usa foco no botão, Escape e devolução de foco ao link. A abertura usa apenas opacidade e transformação durante 180 ms. O indicador não anima continuamente e o modo de movimento reduzido remove as animações do diálogo.
- O diretório e os detalhes financeiros mostram origem, proprietário, Premium, datas e situação sob o papel financeiro existente. RLS e ACLs preservam a separação de tenant. A inserção do trial usa um papel sem login, sem escrita em pagamentos e com acesso somente às colunas necessárias.
- Foram utilizadas as quatro skills de Emil. emil-design-eng orientou hierarquia e detalhes de interação. review-animations orientou a revisão da entrada do modal. improve-animations foi aplicada à revisão do fluxo, sem introduzir movimento em navegação ou no indicador. animation-performance orientou a escolha de propriedades e o teste com movimento reduzido. O trabalho em dados usou as skills Supabase e Supabase Postgres Best Practices.

Os arquivos de interface estão em [premium-trial](../src/features/premium-trial), [marketing](../src/features/marketing), nas páginas de cadastro, onboarding, demonstração e dashboard e nos componentes de [admin-billing](../src/features/admin-billing). As definições dos RPCs permanecem em [database.ts](../src/types/database.ts). Os testes de regressão ficam em [PostgreSQL](../tests/postgres/automatic-premium-trial.sql), [concorrência](../tests/postgres/automatic-premium-trial-concurrency.sql), [navegador](../tests/integration/automatic-premium-trial.mjs) e [contagem e progresso](../tests/premium-trial-display.test.ts).

## Evidências

| Verificação | Resultado |
| --- | --- |
| Vitest | 817 testes em 40 arquivos. [Log](qa-trial-premium/vitest.log) |
| Typecheck e lint | Saídas 0. [Typecheck](qa-trial-premium/typecheck.log) · [Lint](qa-trial-premium/lint.log) |
| Builds | Next.js e OpenNext com saída 0. O aviso de middleware Node.js experimental no OpenNext permanece. [Next.js](qa-trial-premium/next-build.log) · [OpenNext](qa-trial-premium/opennext-build.log) |
| PostgreSQL | 33 migrations aplicadas em reset da base descartável. A suíte do recurso verificou 33 casos, incluindo as fronteiras com diferença de um microssegundo, Pix, downgrade, ACL, exclusão e recriação. [Migrations](qa-trial-premium/migrations.log) · [Casos](qa-trial-premium/postgres.log) |
| Concorrência | Cinco asserções com sessões independentes e espera observada no banco. [Log](qa-trial-premium/concurrency.log) |
| Regressões PostgreSQL | Trial assistido, cobertura, faturamento manual, cutover e limite de profissionais com corrida. [Log](qa-trial-premium/postgres-regressions.log) |
| Regressão F1 | Storage local, permissão de owner e staff, isolamento, substituição concorrente, remoção e navegador em 375 e 1280 px. [Log](qa-trial-premium/product-f1-regression.log) |
| Navegador | Chromium, cadastro real, confirmação por Mailpit, onboarding, boas-vindas, recarga e novo login, plano, operador, owner, staff, outro tenant e acesso público antes e após o fim. CSP estrita com nonce, teclado, foco, ausência de overflow e movimento reduzido verificados. [Log](qa-trial-premium/integration.log) |
| Diff | Arquivos staged conferidos por git diff --cached --check. [Log](qa-trial-premium/diff-check.log) |

A suíte comercial complementar reproduziu overflow horizontal em /dashboard/plano, no cenário legado em 375 px, tanto no commit-base 3a0691f como no candidato. O cenário automático passou no navegador. O overflow legado fica registrado para a etapa de redesign da página de plano, após o checkpoint visual. [Commit-base](qa-trial-premium/commercial-baseline.log) · [Candidato](qa-trial-premium/commercial-regression.log).

As 16 capturas são do Chromium real, com dados sintéticos e CSP estrita.

| Largura | Modal claro | Modal escuro | Aviso claro | Aviso escuro |
| ---: | --- | --- | --- | --- |
| 375 | [Modal](qa-trial-premium/screenshots/modal-375-light.png) | [Modal](qa-trial-premium/screenshots/modal-375-dark.png) | [Aviso](qa-trial-premium/screenshots/aviso-375-light.png) | [Aviso](qa-trial-premium/screenshots/aviso-375-dark.png) |
| 768 | [Modal](qa-trial-premium/screenshots/modal-768-light.png) | [Modal](qa-trial-premium/screenshots/modal-768-dark.png) | [Aviso](qa-trial-premium/screenshots/aviso-768-light.png) | [Aviso](qa-trial-premium/screenshots/aviso-768-dark.png) |
| 1280 | [Modal](qa-trial-premium/screenshots/modal-1280-light.png) | [Modal](qa-trial-premium/screenshots/modal-1280-dark.png) | [Aviso](qa-trial-premium/screenshots/aviso-1280-light.png) | [Aviso](qa-trial-premium/screenshots/aviso-1280-dark.png) |
| 1920 | [Modal](qa-trial-premium/screenshots/modal-1920-light.png) | [Modal](qa-trial-premium/screenshots/modal-1920-dark.png) | [Aviso](qa-trial-premium/screenshots/aviso-1920-light.png) | [Aviso](qa-trial-premium/screenshots/aviso-1920-dark.png) |

### Desempenho local

Doze respostas HTTP por rota e configuração, após três aquecimentos. A latência engloba o corpo completo. O corpo é medido descompactado. A amostra sequencial em loopback não mede LCP, carga concorrente ou latência hospedada. [Baseline](qa-trial-premium/benchmark-before.log) · [Depois](qa-trial-premium/integration.log) · [Script](../tests/integration/automatic-premium-benchmark.mjs).

| Rota | 3a0691f mediana / p95 | Trial ativo mediana / p95 | Gate fechado mediana / p95 | Delta de HTML com trial ativo |
| --- | ---: | ---: | ---: | ---: |
| Landing | 21,5 / 25,8 ms | 22,4 / 25,0 ms | 21,9 / 32,9 ms | +2.296 B |
| Cadastro | 16,9 / 18,2 ms | 17,3 / 20,3 ms | 14,5 / 19,1 ms | +464 B |
| Demonstração | 25,1 / 32,0 ms | 23,1 / 28,5 ms | 23,2 / 34,9 ms | +1.793 B |

A maior alta observada na mediana com a oferta ativa foi 0,9 ms. O p95 variou entre as amostras. Na homologação, medir a consulta de disponibilidade da oferta e a carga autenticada do dashboard com o banco e o aplicativo nas regiões previstas.

### Reprodução e prévia

As suítes SQL rodam exclusivamente na base descartável de QA, como supabase_admin, com ON_ERROR_STOP. Os testes de concorrência usam dblink para abrir outra sessão. A suíte de navegador exige o build Next.js compilado para o Supabase local, confirmação por Mailpit, CSP estrita e as variáveis de QA descritas em local-next-qa.mjs. Ela retorna o gate a false ao encerrar. O script de benchmark aceita somente endereços de loopback em portas de QA.

A prévia da avaliação usa a versão compilada do candidato, as duas chaves de onboarding desligadas e uma concessão já registrada para a conta do trial. Os acessos sintéticos foram renovados após o reset da base descartável e ficam fora do Git. A prévia valida apenas o ambiente local. [Entrada](http://localhost:59330/login) · [Log](qa-trial-premium/preview.log).

## Homologação e riscos residuais

- A base da validação usou PostgreSQL 17.11 local. A migration exige PostgreSQL 16 ou superior pelo uso de pg_input_is_valid e grants de roles com INHERIT e SET configurados. Na homologação, conferir a propriedade dos objetos, a capacidade do papel executor de delegar os papéis de migração, o acesso do definer a auth.users e o cache de esquema do PostgREST. O ambiente hospedado continua fechado.
- A regra é por identidade Auth. Uma pessoa pode tentar cadastrar contas distintas com e-mails confirmados. Confirmação de e-mail e os controles de autenticação atuais já se aplicam. Antes da liberação, validar os limites de cadastro e envio de e-mail, revisar abuso por IP e por taxa no onboarding e definir monitoramento para picos de concessão. Registros que já haviam sido apagados junto com todo o histórico antes da migration não são recuperáveis no backfill.
- Se a resposta da confirmação de boas-vindas se perder depois da gravação, o modal pode não aparecer. A faixa continua disponível e a janela gratuita permanece intacta.
- Na homologação, aplicar a migration com o gate fechado e ensaiar Auth, Data API, agendamentos, acordos e Pix com contas e dados de teste. Após autorização separada, liberar a chave de banco por operação administrativa revisada, com o gate assistido desligado. Para interromper novas concessões, voltar essa chave a false. As concessões existentes e sua cobertura seguem as datas já registradas.
- Continuam em aberto as pendências anteriores de homologação Cloudflare, segurança, desempenho e acessibilidade, incluindo leitor de tela nativo, binding real de imagens, quatro timeouts sem atribuição, Data API, transições diretas de atendimentos, reconciliação de fotos privadas e confiança em headers. Vercel continua como fallback. A J2-D fica fora deste checkpoint.

## Parecer

**GO técnico local para o trial Premium automático.** A autorização de produção continua em **NO-GO comercial** até homologação hospedada e liberação explícita. A fase J2-C3 ainda depende da aprovação visual da J2-C2.
