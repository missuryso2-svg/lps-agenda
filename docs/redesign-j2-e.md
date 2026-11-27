# J2-E — Administração financeira

J2-E parte do commit 86c889e em codex/redesign-j2. O escopo é o painel financeiro interno do LPS Agenda.

## Inventário anterior às alterações

| Rota | Funcionalidades e fonte existentes |
| --- | --- |
| /admin/assinaturas | Carteira manual e totais por competência via finance_overview e finance_totals |
| /admin/assinaturas/barbearias | Diretório com prefixo do nome, origem e cursor UUID via finance_directory |
| /admin/assinaturas/barbearias/[id] | Identificação autorizada do proprietário, cadastro comercial, trial, contrato, ações de acordo e contrato, mensalidades e amostra de histórico |
| /admin/assinaturas/mensalidades | Competência, situação e cursor via finance_invoices. Conferência manual do crédito |
| /admin/assinaturas/historico | Diário e eventos financeiros com filtros por tenant, ator, ação, período e cursor composto via finance_activity |
| /admin/assinaturas/operadores | Lista, concessão e revogação via finance_operator_list e finance_operator, reservadas a manager |
| /admin/assinaturas/saude | Situação operacional, conciliação e flags existentes via finance_health |
| /admin/acesso-negado | Destino existente de contas autenticadas sem a permissão requerida |

O painel mantém a fronteira existente. O layout e as consultas usam requireFinancialAdmin, as mutações validam a sessão e o papel e as RPCs financeiras revalidam o ator no PostgreSQL. A leitura continua pelo SDK com a sessão do usuário. As actions, validações de negócio, consultas, migrations, policies e grants permanecem na implementação existente. O painel de operadores requer manager mesmo em navegação direta. [RLS na documentação do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Arquivos e decisões de interface

- As sete páginas em [admin/assinaturas](../src/app/admin/assinaturas) e os estados de carregamento, erro e registro ausente usam a estrutura da área administrativa. O resumo de saúde conserva os campos retornados pelo diagnóstico existente.
- O [layout](../src/app/admin/assinaturas/layout.tsx), o [CSS](../src/app/admin/assinaturas/finance.css) e o [cabeçalho de página](../src/features/admin-billing/presentation.tsx) usam os tokens J2. A identidade da LPS Solutions fica no menu escuro. O conteúdo alterna entre as superfícies quente clara e escura.
- [Listas e fatos](../src/features/admin-billing/lists.tsx) mostram estado por texto e cor, datas de cobertura, nome autorizado do proprietário e o próximo passo. O contato permanece no detalhe. A listagem conserva tabela semântica, contagem da página, pesquisa pelo prefixo e paginação por cursor. Em telas estreitas, a rolagem horizontal se restringe à região da tabela e funciona por teclado.
- O detalhe destaca o benefício automático em sua própria seção. Início, fim, plano e dias restantes vêm da projeção já existente. A distinção entre trial vigente, expirado, encerrado após um acordo pendente e convertido com Pix conferido acompanha as regras existentes. A concessão permanece sob controle do PostgreSQL.
- [Formulários](../src/features/admin-billing/forms.tsx) e [revisão](../src/features/admin-billing/operation-form.tsx) mantêm os campos, a confirmação explícita e a chave idempotente. O aviso de bloqueio imediato acompanha a revisão, inclusive quando a cobertura começa no futuro. O fluxo repete o aviso de encerramento do trial quando aplicável. O formulário usa o interpretador Zod já existente sob CSP estrita, apresenta foco e descrição dos erros e mantém o controle nativo do diálogo. A resposta oficial do servidor orienta falha de capacidade, parcela encerrada e outras condições.
- O histórico expõe data, operação, responsável, barbearia, resultado e justificativa autorizados pela projeção. A ação sobre a barbearia leva ao detalhe. Identificadores administrativos secundários ficam em uma seção expansível. A interface de histórico é de leitura.
- A [navegação](../src/features/admin-billing/navigation.tsx) importa a [constante de rota](../src/features/admin-billing/routes.ts) sem carregar o módulo de validação no navegador. A base carregava Zod para esse único valor e disparava uma tentativa bloqueada de compilação dinâmica em todas as telas do painel. Os formulários usam o interpretador do Zod.
- Os [testes de navegador e fixture](../tests/integration) exercitam dados sintéticos exclusivamente nos serviços locais. A [lista de pré-lançamento](pre-launch-checklist.md) concentra os itens que dependem de evidência e aprovação posteriores.

### Indicadores e filtros disponíveis

Recebido é o total que finance_totals retorna para mensalidades manuais com situação paga na competência. Em aberto agrega pendentes e vencidas. O painel apresenta esses valores com rótulos separados e atalhos para cada situação. Contratos manuais ativos, pendentes e em atraso são as contagens devolvidas pelo RPC. O número de contratos manuais ativos e o total de barbearias têm escopos diferentes. A projeção atual do benefício é associada à barbearia e informa a quantidade de dias restantes calculada no PostgreSQL.

Os totais globais de cobertura paga vigente, trials ativos e expirados, vencimentos em um ou três dias, contratos suspensos e cancelados e capacidade da equipe exigem extensão das projeções autorizadas. O filtro atual por origem igual a trial consulta contratos dessa origem. Um filtro global por prazo precisa aplicar estado e janela ao conjunto autorizado no banco antes do cursor, inclusive para diferenciar conversões de expirações. A contagem de equipe deve ser vinculada à barbearia e à regra de capacidade vigente. Uma futura mudança requer revisão do custo, paginação, regressões de autorização e aprovação do próprio escopo financeiro.

## Skills e movimento

Foram usadas emil-design-eng para densidade, hierarquia e feedback, improve-animations para revisar o movimento no conjunto de telas, review-animations para inspecionar os controles e animation-performance para limitar o custo do feedback visual. A revisão de React preservou as consultas no servidor e o número de chamadas. Supabase orientou a auditoria da projeção e da fronteira de autorização.

| Antes | Depois | Por quê |
| --- | --- | --- |
| Controles herdavam efeitos visuais heterogêneos | A ação primária usa scale 0,985 em 140 ms, em ponteiro fino e com movimento permitido | Feedback de pressão com a propriedade transform |
| Revisão e detalhes já eram nativos | Abertura imediata, chevron troca de posição e Escape restaura o foco ao botão de revisão | Interações repetidas e decisões sensíveis ganham resposta direta |
| Havia apenas texto no carregamento | Skeleton estático e anúncio textual de estado | Ajuda a prever o espaço sem ocupar o orçamento de animação |

## Evidência

[Capturas comparativas e logs](qa-j2-e/README.md). A base é 86c889e. As capturas são do Chromium em loopback com a mesma carteira sintética. Os tempos caracterizam a máquina local.

### Validações executadas

| Validação | Resultado | Evidência |
| --- | --- | --- |
| Vitest, typecheck e lint | 826 testes em 41 arquivos. Typecheck e lint aprovados | [Vitest](qa-j2-e/vitest.log) · [Typecheck](qa-j2-e/typecheck.log) · [Lint](qa-j2-e/lint.log) |
| Next.js e OpenNext | Builds de produção locais aprovados. O OpenNext mantém o aviso existente sobre proxy Node.js experimental | [Next.js](qa-j2-e/next-build.log) · [OpenNext](qa-j2-e/opennext-build.log) |
| PostgreSQL | 33 migrations no Supabase descartável, PostgreSQL 17.11. Cinco suítes aprovadas, `c1-finance`, `c1-concurrency`, `i31-capacity-cleanup`, `automatic-premium-trial` e `automatic-premium-trial-concurrency` | [Log](qa-j2-e/postgres.log) |
| Integração em Node | Login real, autorização das funções, isolamento, paginação, valores do razão financeiro, conversão com aviso, capacidade, emissão, Pix, reativação, suspensão, cancelamento e histórico aprovados | [Log](qa-j2-e/integration.log) |
| Workers local | SSR com sessões sintéticas. Manager autorizado em Operadores, operator autorizado na visão financeira e ambos os acessos indevidos recusados. CSP estrita no workerd | [Log](qa-j2-e/workers.log) |
| Matriz em Chromium | 56 carregamentos por versão, quatro larguras, dois temas e sete telas. O candidato ficou sem overflow horizontal de página e sem violações de CSP nas telas financeiras | [Antes](qa-j2-e/before.log) · [Depois](qa-j2-e/after.log) |
| Git | Diff da árvore de trabalho e do índice aprovados | [Log](qa-j2-e/diff-check.log) |

Os testes abriram e fecharam o diálogo por teclado, verificaram retorno de foco e dados retidos, checagem do alerta do trial e a ordem de autorização. A disputa de acordos gravou apenas um contrato. O plano incompatível falhou sem encerrar o trial nem registrar cobrança. A emissão não alterou o recebido. A conferência do Pix alterou o recebido em R$ 68,79, uma única vez. O pagamento e o preço persistido foram preservados após a suspensão, a retomada e o cancelamento. A consulta direta de parcelas de outro tenant por owner comum foi negada.

A tentativa de `eval` do Zod no login foi bloqueada pela CSP tanto em 86c889e quanto no candidato. O login completou em ambas as versões. A rota de login já aprovada continua fora do escopo do redesign financeiro. [Diagnóstico](qa-j2-e/login-csp.log).

A [prévia administrativa](http://localhost:59334/admin/assinaturas) foi verificada com manager e operator sintéticos. O app e o endpoint da API de QA escutam apenas em loopback. As contas são fornecidas em arquivo local fora do Git. O banco e o coletor de e-mail permanecem na rede privada do Docker. [Log da prévia](qa-j2-e/preview.log).

### Desempenho

As duas versões foram medidas com a mesma carteira sintética e a mesma sequência de sete rotas. A página inicial abre cada contexto. As seis navegações seguintes reutilizam esse contexto. Os bytes correspondem aos recursos JavaScript observados durante a coleta. [Amostras antes](qa-j2-e/metrics-before.json) · [Amostras depois](qa-j2-e/metrics-after.json) · [Resumo](qa-j2-e/performance.log).

| Grupo e mediana | Antes | Depois |
| --- | ---: | ---: |
| Todas as telas · TTFB | 16,50 ms | 15,20 ms |
| Todas as telas · FCP | 72 ms | 72 ms |
| Todas as telas · LCP | 100 ms | 100 ms |
| Todas as telas · CLS | 0 | 0 |
| Todas as telas · JavaScript | 224.281 B | 216.212 B |
| 375 px · FCP | 76 ms | 72 ms |
| 375 px · LCP | 98 ms | 104 ms |
| Visão financeira · FCP e LCP | 104 ms | 118 ms |
| Visão financeira · JavaScript | 222.198 B | 180.957 B |

A visão financeira transferiu cerca de 41 kB a menos de JavaScript na janela medida, com aumento local de 14 ms no FCP e no LCP. A matriz registrou o menor contraste de 5,84:1 nos oito pares testados e nenhum overflow de página. A rolagem da tabela fica restrita à sua região. O relatório inclui 80 capturas comparativas e duas capturas dos diálogos de revisão. Os tempos de loopback precisam de confirmação na infraestrutura hospedada.

## Parecer

**GO técnico local para avaliação visual e técnica.** A revisão inclui as sete telas financeiras e o fluxo da carteira sintética. As regras comerciais e as permissões críticas foram exercitadas sem mudanças de banco ou de acesso no código entregue.

A leitura manual com NVDA ou Narrador e a homologação hospedada permanecem em aberto. O lançamento comercial permanece em **NO-GO**. A Fase K depende de aprovação visual e técnica explícita.
