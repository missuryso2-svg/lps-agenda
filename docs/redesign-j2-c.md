# LPS Agenda — J2-C · Checkpoint C1

26/11/2026 · codex/redesign-j2 · base aprovada f6937e1

**GO técnico local para aprovação visual do J2-C1. Lançamento comercial em NO-GO.**

## Estrutura compartilhada

O painel usa a paleta, tipografia e controles do design aprovado na J2-A e desenvolvidos para formulários na J2-B. A navegação lateral escura agrupa operação e gestão. O indicador ativo combina contorno, peso e aria-current. No mobile, o cabeçalho mostra a barbearia ativa, sua marca e papel, com atalhos para Visão geral e Agenda. O menu lateral mantém todos os destinos permitidos. A conta reúne tema, notificações, configurações quando autorizadas, página pública e saída.

O seletor mostra apenas os vínculos retornados pelo servidor. A seleção usa itens de rádio e o mesmo Server Action. A imagem usa a referência de logo já validada no servidor, com iniciais de fallback. As consultas, a política de Storage e a gravação de imagens seguem nos pontos existentes.

## Resumo e agenda

- A visão geral prioriza o compromisso do dia e a criação de agendamento. Uma faixa concentra as contagens existentes. As duas listas distinguem a agenda de hoje e os próximos compromissos pelo horário, data, serviço, profissional e situação. O painel mostra recebimentos da barbearia no mês somente quando a autorização anterior permite. Para staff, a faixa exibe a equipe. As mensalidades da plataforma permanecem no fluxo de plano.
- A agenda separa modo Dia ou Semana, período e profissional. A semana permite abrir o dia correspondente. No dia, cada profissional tem faixas livres, compromissos e bloqueios. Horários usam números tabulares e situação tem texto em português. O acesso a expediente e bloqueios aponta para a página existente.
- Os diálogos de criação presencial, detalhes, reagendamento, cancelamento e notificações usam o mesmo fluxo de dados. Os controles e o seletor de horários ganharam foco e área de toque. Fechar um diálogo volta ao controle de origem ou à navegação de período. Cancelamento continua exigindo confirmação.
- Painel e agenda têm skeleton estático e estados vazios, de erro e de carregamento orientados à próxima ação.

## Movimento e skills

| Antes | Depois | Por quê |
| --- | --- | --- |
| Drawer genérico com desfoque e animação em qualquer modo de acionamento. | Abertura por ponteiro em 200 ms, curva cubic-bezier(0.32, 0.72, 0, 1), saída em 150 ms. Teclado e movimento reduzido têm resposta imediata. | O deslocamento acompanha a origem do menu. A sobreposição sólida evita desfoque animado. |
| Menus, filtros, slots e diálogos herdavam transições e entradas do componente base. | Foco, filtros, slots e diálogos operacionais aparecem imediatamente. A ação dourada responde somente ao ponteiro fino com scale 0,98 em 140 ms. | A leitura e a navegação repetida da agenda permanecem rápidas. |
| Skeletons e indicadores de envio usavam animação contínua. | Skeleton estático. O indicador operacional de envio preserva texto e respeita movimento reduzido. | O estado de carregamento permanece perceptível sem movimento obrigatório. |

Aplicadas emil-design-eng, review-animations, improve-animations e animation-performance. [Repositório de Emil Kowalski](https://github.com/emilkowalski/skills).

## Arquivos

| Área | Arquivos |
| --- | --- |
| Estrutura | src/components/dashboard/dashboard-shell.tsx e dashboard-j2.css |
| Visão geral | src/app/dashboard/page.tsx, src/components/dashboard/operation-page.tsx, appointment-list.tsx e status-badge.tsx |
| Agenda | src/app/dashboard/agenda/page.tsx, src/features/scheduling/components/agenda-board.tsx e slot-picker.tsx |
| Diálogos | src/components/ui/dialog.tsx e os diálogos de atendimento, novos horários, cancelamento e notificações em src/features/scheduling/components |
| Estados | src/app/dashboard/loading.tsx, agenda/loading.tsx, error.tsx e src/components/dashboard/operation-loading.tsx |
| QA | tests/integration/j2c-fixture.mjs, j2c-visual.mjs e j2c-dashboard.mjs, além das evidências em docs/qa-j2-c1 |

## Capturas

Capturas do painel, agenda diária e agenda semanal em 375, 768, 1280 e 1920 px, com tema claro e escuro. Os dados vieram de um Supabase descartável. A avaliação visual usa a mesma aplicação apontada para localhost. Os PNG originais estão em C:/Users/missu/source/lps-agenda-j2c1-visual.

| Tela | Desktop claro · 1280 px | Mobile escuro · 375 px |
| --- | --- | --- |
| Painel | [Antes](qa-j2-c1/screenshots/before/painel-1280-light.webp) · [Depois](qa-j2-c1/screenshots/after/painel-1280-light.webp) | [Antes](qa-j2-c1/screenshots/before/painel-375-dark.webp) · [Depois](qa-j2-c1/screenshots/after/painel-375-dark.webp) |
| Agenda diária | [Antes](qa-j2-c1/screenshots/before/agenda-1280-light.webp) · [Depois](qa-j2-c1/screenshots/after/agenda-1280-light.webp) | [Antes](qa-j2-c1/screenshots/before/agenda-375-dark.webp) · [Depois](qa-j2-c1/screenshots/after/agenda-375-dark.webp) |
| Agenda semanal | [Antes](qa-j2-c1/screenshots/before/semana-1280-light.webp) · [Depois](qa-j2-c1/screenshots/after/semana-1280-light.webp) | [Antes](qa-j2-c1/screenshots/before/semana-375-dark.webp) · [Depois](qa-j2-c1/screenshots/after/semana-375-dark.webp) |

[Galeria completa com 48 capturas](qa-j2-c1/README.md).

## Testes

| Verificação | Resultado |
| --- | --- |
| Vitest | 810 testes em 39 suítes. [Log](qa-j2-c1/vitest.log) |
| Typecheck, lint e diff | Saídas 0. [Typecheck](qa-j2-c1/typecheck.log), [lint](qa-j2-c1/lint.log), [Git](qa-j2-c1/diff-check.log) |
| Builds | Next.js e OpenNext concluídos. O aviso preexistente de middleware Node.js experimental permanece no OpenNext. [Next.js](qa-j2-c1/next-build.log), [OpenNext](qa-j2-c1/opennext-build.log) |
| Matriz visual | 24 combinações por versão. CSP estrita, foco visível, navegação por teclado, árvore de acessibilidade, movimento reduzido e ausência de overflow na versão atual. [Antes](qa-j2-c1/before.log), [depois](qa-j2-c1/after.log) |
| Dashboard e agenda | Logo lida do Storage, troca entre vínculos permitidos, conta, receita de owner, restrição financeira de staff, isolamento de outro tenant, filtro, semana, retorno de foco, reagendamento e cancelamento confirmado preservando o preço. [Log](qa-j2-c1/dashboard.log) |
| Integração F3 | Criação presencial real, concorrência, pausas, avaliações, confirmação, notificações e cobertura. O teste usa PostgreSQL, Data API, Next.js e navegador locais. [Log](qa-j2-c1/operations.log) |
| Prévia | Owner em desktop e staff no viewport mobile em sessões reais. Processo Next.js escutando em 127.0.0.1:59330. [Log](qa-j2-c1/preview.log) |

Os 19 pares semânticos testados tiveram mínimos de 5,84:1 para texto e 3,89:1 para controles no claro, e 7,40:1 e 4,61:1 no escuro. A checagem automatizada da árvore de acessibilidade foi executada em Chromium. A verificação audível com NVDA ou Narrador permanece pendente.

A prévia usa [localhost na porta 59330](http://localhost:59330/login) e o Supabase de QA. As contas sintéticas de avaliação ficam fora do repositório. Para reproduzir com o ambiente descartável, executar node tests/integration/j2c-dashboard.mjs para o fluxo funcional e node tests/integration/j2c-visual.mjs after DIRETORIO para a matriz. Usar B2A2_QA_NEXT_HOST=localhost, CSP_ENFORCE=true e os valores locais verificados por tests/integration/local-next-qa.mjs.

## Desempenho

Duas rodadas alternaram os builds f6937e1 e C1 no mesmo host, com contexto novo no Chromium em cada visita, CSP estrita e 48 medições por versão. [Amostras e medianas](qa-j2-c1/benchmark.json).

| Mediana local | Antes | Depois |
| --- | ---: | ---: |
| LCP geral | 444 ms | 440 ms |
| LCP do painel | 442 ms | 440 ms |
| LCP da agenda diária | 452 ms | 440 ms |
| LCP da agenda semanal | 438 ms | 446 ms |
| FCP geral | 98 ms | 96 ms |
| TTFB | 19,50 ms | 21,65 ms |
| JavaScript observado | 263.325 B | 260.348 B |
| CLS | 0 | 0 |

O FCP do painel passou de 94 para 114 ms e o maior CLS do C1 foi 0,00396. As diferenças variam por tela e descrevem o loopback local.

## Pendências e próximos checkpoints

O escopo do C1 é a estrutura compartilhada, a visão geral e a agenda. O C1 recebeu aprovação visual e serviu de base para o C2. A J2-D e o lançamento comercial permanecem fechados.

Permanecem abertas a validação manual em leitor de tela NVDA ou Narrador, a investigação dos quatro timeouts sem causa atribuída, a proteção das transições diretas de atendimentos, a reconciliação de fotos privadas órfãs, a homologação do Images Binding real, os controles de abuso e autenticação, a confiança nos headers do proxy e a revisão das permissões da Data API. [Auditoria I4](security-audit-i4.md), [Workers J1](cloudflare-migration-j1.md), [Images Binding J1.1](cloudflare-images-j1-1.md).

As alterações foram locais. Os controles de autorização, RLS, concorrência de agenda, segurança de Storage, preços históricos, contrato, pagamentos, migrations e arquivos de configuração do Workers estão nos artefatos existentes.

## J2-C2 — Clientes, Serviços, Equipe e Horários

**GO técnico local para aprovação visual do J2-C2. Lançamento comercial em NO-GO.**

### Decisões de interface

| Área | Entrega |
| --- | --- |
| Clientes | Indicadores em uma faixa, filtros por situação com seleção acessível, busca e tabela no desktop, linhas empilhadas no mobile. Contato, WhatsApp quando disponível, observações e histórico do cadastro aparecem no diálogo. Arquivamento mantém confirmação e reativação pela mesma ação. O histórico exibido é de criação e atualização, conforme os dados já consultados. |
| Serviços | Catálogo com nome e descrição, duração, preço e situação. Os estados de busca vazia, leitura e validação seguem no fluxo original. Valores permanecem em centavos e a edição atualiza apenas o catálogo. |
| Equipe | Perfis com foto maior e iniciais de fallback, serviço associado e situação. O indicador usa o RPC de plano vigente e o catálogo autenticado do banco. Básico 1, Profissional 5 e Premium 10. A tela distingue ausência de plano, limite indefinido e falha na consulta. O upload mantém o mesmo endpoint, versão esperada e validação de servidor. |
| Horários | A rota existente /dashboard/horarios mantém as abas de barbearia, profissionais e bloqueios, e a pausa recorrente onde autorizada. Dias fechados ou de folga ficam identificados por texto e superfície. Horários ficam em pares com rótulos visíveis. Erros de intervalo apontam para os campos relacionados. |

### Arquivos modificados

- Páginas de clientes, serviços, equipe e horários em src/app/dashboard, mais o skeleton de clientes.
- Estrutura, estilo e diálogos em src/components/dashboard/management-page.tsx, management-j2.css, management-dialog.tsx, confirm-delete-dialog.tsx e operation-loading.tsx.
- Componentes visuais em src/features/customers/components, src/features/services/components, src/features/barbers/components e src/features/schedule/components.
- Testes em tests/integration/j2c2-visual.mjs, j2c2-management.mjs e o ajuste de interação de product-f1.mjs. Evidências em docs/qa-j2-c2.

### Skills e movimento

Emil-design-eng orientou a hierarquia, o foco e os controles. Review-animations e improve-animations orientaram a remoção das transições genéricas de diálogos, abas e filtros de uso frequente. Animation-performance orientou a ausência de animações de layout e a manutenção de estados estáticos com movimento reduzido.

| Antes | Depois | Por quê |
| --- | --- | --- |
| Diálogos herdavam zoom, fade e desfoque. | Aparição imediata, sobreposição sólida e devolução do foco ao controle anterior ou à busca. | Ações recorrentes respondem sem atraso e preservam o contexto. |
| Filtros, switches e abas herdavam transições amplas. | O estado troca imediatamente, acompanhado de texto ou semântica de seleção. | A operação funciona com ponteiro, teclado e preferência por movimento reduzido. |
| Envio de foto tinha apenas desabilitação temporária. | Envio e remoção exibem texto de progresso. Descartar a seleção restaura a imagem anterior. | O estado fica claro sem depender do giro de um ícone. |

### Evidências comparativas

| Tela | 1280 px claro | 375 px escuro |
| --- | --- | --- |
| Clientes | [Antes](qa-j2-c2/screenshots/before/clientes-1280-light.webp) · [Depois](qa-j2-c2/screenshots/after/clientes-1280-light.webp) | [Antes](qa-j2-c2/screenshots/before/clientes-375-dark.webp) · [Depois](qa-j2-c2/screenshots/after/clientes-375-dark.webp) |
| Serviços | [Antes](qa-j2-c2/screenshots/before/servicos-1280-light.webp) · [Depois](qa-j2-c2/screenshots/after/servicos-1280-light.webp) | [Antes](qa-j2-c2/screenshots/before/servicos-375-dark.webp) · [Depois](qa-j2-c2/screenshots/after/servicos-375-dark.webp) |
| Equipe | [Antes](qa-j2-c2/screenshots/before/equipe-1280-light.webp) · [Depois](qa-j2-c2/screenshots/after/equipe-1280-light.webp) | [Antes](qa-j2-c2/screenshots/before/equipe-375-dark.webp) · [Depois](qa-j2-c2/screenshots/after/equipe-375-dark.webp) |
| Horários | [Antes](qa-j2-c2/screenshots/before/horarios-1280-light.webp) · [Depois](qa-j2-c2/screenshots/after/horarios-1280-light.webp) | [Antes](qa-j2-c2/screenshots/before/horarios-375-dark.webp) · [Depois](qa-j2-c2/screenshots/after/horarios-375-dark.webp) |

A [galeria completa](qa-j2-c2/README.md) reúne 64 capturas das quatro telas em 375, 768, 1280 e 1920 px, nos temas claro e escuro. Os PNG originais ficam em C:/Users/missu/source/lps-agenda-j2c2-visual.

### Testes e desempenho

| Verificação | Resultado |
| --- | --- |
| Vitest | 810 testes em 39 suítes. [Log](qa-j2-c2/vitest.log) |
| Typecheck, lint e diff | Saídas 0. [Typecheck](qa-j2-c2/typecheck.log), [lint](qa-j2-c2/lint.log), [Git](qa-j2-c2/diff-check.log) |
| Builds | Next.js e OpenNext aprovados. O aviso preexistente de middleware Node.js experimental permanece. [Next.js](qa-j2-c2/next-build.log), [OpenNext](qa-j2-c2/opennext-build.log) |
| Navegador | 32 combinações antes e 32 depois. CSP estrita, árvore de acessibilidade, foco visível, ausência de overflow, teclado e movimento reduzido. [Antes](qa-j2-c2/before.log), [depois](qa-j2-c2/after.log) |
| Integração de gestão | Criação, edição, arquivamento e reativação de clientes. Criação, edição, ativação e desativação de serviços e profissionais, vínculos de serviço, preço histórico de R$ 65,00 preservado após passar o serviço a R$ 82,90, limite concorrente do Básico, permissão de staff, dados isolados por tenant e intervalos válidos e inválidos. [Log](qa-j2-c2/management.log) |
| Imagens no Node | Storage real de QA, proprietário, equipe, outro tenant, substituição por versão e remoção. Na suíte F1, a asserção dos termos de teste abre o detalhe nativo do cadastro aprovado no J2-B. [Log](qa-j2-c2/product-f1.log) |
| Imagens no Workers | Binding local simulado, JPG, PNG e WebP, saída, mídia inválida, isolamento, CSRF, substituição concorrente e limpeza. [Log](qa-j2-c2/worker-images.log) |
| Disponibilidade | Pausas, agendamentos concorrentes, confirmações, notificações e cobertura preservadas no QA local da F3. [Log](qa-j2-c2/operations-f3.log) |
| Prévia | Login real owner/staff, quatro rotas em loopback e envio visível de foto em QA. [Log](qa-j2-c2/preview.log) |

Mínimos dos pares semânticos no claro foram 5,84:1 para texto e 3,89:1 para controles. No escuro, 7,40:1 e 4,61:1. A primeira execução paralela apresentou timeout no WSL, e as execuções isoladas passaram sem aumento dos limites de espera. Esse incidente local é independente dos quatro timeouts anteriores ainda sem atribuição.

A prévia usa [localhost na porta 59330](http://localhost:59330/login) e Supabase descartável. As credenciais sintéticas de avaliação ficam fora do repositório.

A matriz controlada teve 32 visitas por versão em Chromium local, com contexto novo por visita e CSP estrita. [Amostras completas](qa-j2-c2/benchmark.json).

| Mediana local | Antes | Depois |
| --- | ---: | ---: |
| LCP geral | 440 ms | 462 ms |
| FCP geral | 90 ms | 134 ms |
| TTFB geral | 21,90 ms | 28,20 ms |
| JavaScript transferido | 302.626 B | 302.982 B |
| CLS | 0 | 0 |
| LCP de Clientes | 446 ms | 466 ms |
| LCP de Serviços na matriz | 308 ms | 450 ms |
| LCP de Equipe | 446 ms | 466 ms |
| LCP de Horários | 438 ms | 484 ms |

A repetição isolada de Serviços em ordem invertida registrou 434 ms antes e 414 ms depois. Com as 16 amostras de cada versão combinadas, a mediana ficou em 428 ms antes e 430 ms depois. O maior CLS foi 0,00006 na versão nova. Os tempos variaram por rota e por ordem, e a matriz geral registrou aumento de latência. O teste caracteriza o loopback local e preserva as amostras para a homologação.

### Pendências

O C3 aguarda aprovação visual explícita. Permanecem abertas as pendências registradas no C1, incluindo NVDA ou Narrador, transições diretas de atendimentos, quatro timeouts ainda sem causa atribuída, reconciliação de fotos privadas órfãs, homologação do binding real, confiança em headers e revisão de abuso e Data API. O lançamento comercial permanece em NO-GO.

### Checkpoint do trial Premium automático

A implementação do trial foi isolada em um commit do redesign e validada em QA local. O [relatório do trial](trial-premium-automatico.md) reúne o parecer, a migration incremental, as capturas nos dois temas e as evidências de cobertura e conversão manual. A J2-C3 aguarda a confirmação visual explícita da J2-C2. O lançamento comercial segue em NO-GO.

## J2-C3 — Financeiro, Configurações, Plano e QR Code

A J2-C3 parte de a73ab28 em codex/redesign-j2, após a aprovação visual da J2-C2. A identidade do painel usa as mesmas fontes, superfícies e cores semânticas já aprovadas.

### Implementação

| Tela | Mudança | Arquivos principais |
| --- | --- | --- |
| Financeiro | Filtros do mês atual e anterior, com limites no fuso da barbearia. Recebimentos de serviços são separados de mensalidades e de atendimentos concluídos. O gráfico só aparece com pagamentos confirmados em mais de uma faixa de dias, pela data de lançamento. A agenda usa o preço histórico gravado no atendimento. | [Página](../src/app/dashboard/financeiro/page.tsx) · [Consultas](../src/features/dashboard/queries.ts) |
| Configurações | Identificação, contato e localização ficam no formulário com erros associados aos campos. Logo, página pública e conta ficam em painéis próprios. O formulário remonta ao trocar o tenant. Autorização, CAS de versão, Storage, Sharp e Cloudflare Images Binding foram preservados. | [Página](../src/app/dashboard/configuracoes/page.tsx) · [Formulário](../src/features/settings/components/barbershop-settings-form.tsx) · [Logo](../src/features/settings/components/barbershop-logo-card.tsx) |
| Plano e assinatura | Mostra cobertura, prazo do trial e dados de pagamento existentes. A comparação lê valores de referência, limites e recursos do catálogo. O valor negociado fica no acordo. Planos com capacidade inferior à equipe ativa exibem a orientação para abrir Equipe. A contratação continua manual, com confirmação do impacto sobre a cobertura gratuita e conferência de Pix. | [Página](../src/app/dashboard/plano/page.tsx) · [Projeção do trial](../src/features/premium-trial/queries.ts) |
| QR Code | Apresenta marca, endereço verificado, visualização ampliada, cópia e compartilhamento nativo com fallback. Preserva o PNG, a geração do cartaz A4 e os limites para origem local. | [Página](../src/app/dashboard/qr/page.tsx) · [QR e compartilhamento](../src/features/public-booking/qr/booking-qr.tsx) |
| Componentes compartilhados | CSS limitado às quatro telas, com grid responsivo, foco, tokens de contraste e movimento reduzido. Configuração explícita do interpretador Zod no navegador para evitar a consulta de suporte a eval sob CSP estrita. | [CSS](../src/components/dashboard/account-j2.css) · [Zod](../src/lib/validation/browser-safe-zod.ts) |

O overflow do plano vinha da largura mínima implícita do grid, determinada pelo conteúdo dos cartões e da tabela Asaas. A 375 px, o commit-base excedeu a viewport em 115 px nos dois temas. A coluna principal com minmax(0, 1fr) permite reduzir os itens e preserva a rolagem horizontal dentro da tabela de mensalidades. O financeiro tinha excesso de 81 px nessa largura e a listagem responsiva eliminou a expansão da página. A matriz posterior exige scrollWidth igual ou inferior à viewport. [Antes](qa-j2-c3/before.log) · [Depois](qa-j2-c3/after.log).

As quatro skills de Emil foram usadas. emil-design-eng orientou hierarquia e estados. review-animations e improve-animations revisaram os pontos de maior frequência, com ações de teclado imediatas e diálogo QR nativo. animation-performance orientou a ausência de animações de layout e o spinner condicionado à preferência de movimento. As leituras SSR reaproveitam o SDK e as autorizações existentes do Supabase. A revisão React usou paralelismo nas consultas independentes e cache restrito à requisição para a projeção do trial. [Referência do SDK](https://supabase.com/docs/reference/javascript/select) · [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Evidências, testes e desempenho

A [galeria](qa-j2-c3/README.md) reúne 64 capturas reais em 375, 768, 1280 e 1920 px, nos temas claro e escuro. Os estados de plano têm capturas complementares de [trial ativo](qa-j2-c3/states/trial-ativo.png), [trial expirado](qa-j2-c3/states/trial-expirado.png) e [assinatura paga](qa-j2-c3/states/assinatura-paga.png).

| Verificação | Resultado |
| --- | --- |
| Vitest, typecheck e lint | 817 testes em 40 suítes. [Vitest](qa-j2-c3/vitest.log) · [Typecheck](qa-j2-c3/typecheck.log) · [Lint](qa-j2-c3/lint.log) |
| Builds | Next.js e OpenNext aprovados. Continua o aviso do adaptador sobre middleware Node.js experimental. [Next.js](qa-j2-c3/next-build.log) · [OpenNext](qa-j2-c3/opennext-build.log) |
| Navegador com CSP estrita | 32 visitas por versão com dados sintéticos. A matriz final verifica nonce, política sem violações, viewport, contraste de tokens, movimento reduzido e ausência de comunicação em horas. O baseline capturou 24 sondagens bloqueadas do Zod. [Amostras](qa-j2-c3/metrics-after.json) |
| Operações redesenhadas | Filtro, estado vazio, preço histórico, validação e gravação das configurações, papéis, isolamento, trial ativo, último dia, expiração, plano incompatível, conversão explícita e Pix conferido. [Integração](qa-j2-c3/management.log) |
| Marca e QR | Upload e substituição com Sharp e com o binding local, QR decodificado, cartaz A4, teclado, foco, cópia, compartilhamento e reserva real de QA. [Node](qa-j2-c3/logo-node.log) · [Workers](qa-j2-c3/workers.log) · [QR](qa-j2-c3/qr.log) |
| Regressões | Fluxo comercial, autorização, Pix, trial e limite de profissionais. A base descartável permanece com 33 migrations. [Comercial](qa-j2-c3/commercial.log) · [PostgreSQL](qa-j2-c3/postgres.log) · [Diff](qa-j2-c3/diff-check.log) |

Na amostra local, a mediana geral do LCP foi de 464 para 436 ms, o TTFB de 26,05 para 23,00 ms e o JavaScript de 273,7 para 258,2 kB. O CLS mediano foi zero nas duas versões. O menor contraste medido nos pares de cor selecionados foi 5,54:1. [Medições](qa-j2-c3/performance.log).

| Rota | LCP anterior → atual | FCP anterior → atual | JS anterior → atual |
| --- | ---: | ---: | ---: |
| Financeiro | 450 → 430 ms | 124 → 132 ms | 233,8 → 232,1 kB |
| Configurações | 452 → 424 ms | 92 → 108 ms | 283,6 → 283,6 kB |
| Plano | 480 → 436 ms | 122 → 126 ms | 281,6 → 281,7 kB |
| QR Code | 464 → 464 ms | 146 → 126 ms | 265,8 → 234,8 kB |

Houve aumento de FCP mediano em Financeiro, Configurações e Plano, de até 16 ms. A primeira forma de configurar o Zod aumentou os bytes em Configurações e Plano. A configuração isolada e a remoção da dependência desnecessária de Zod do componente cliente do QR foram adotadas na medição final.

### Pendências e parecer

A homologação hospedada continua pendente, incluindo NVDA ou Narrador, binding real de imagens, confiança em headers, acesso direto e análise de abuso e da Data API. Permanecem abertos os quatro timeouts ainda sem atribuição, a restrição das transições diretas de atendimentos e a reconciliação de fotos privadas órfãs. O teste de desempenho caracteriza a máquina e o loopback usados na validação.

**GO técnico local para avaliação visual da J2-C3.** O lançamento comercial continua em **NO-GO**. A J2-D aguarda aprovação visual explícita da J2-C3.

A [prévia local](http://localhost:59330/login) usa o Next.js em modo de desenvolvimento, com dados sintéticos e bind somente no loopback. O PNG aponta para a própria prévia. O PDF fica condicionado à origem pública, conforme a regra atual, e foi validado com uma origem sintética em QA nos dois runtimes. [Verificação da prévia](qa-j2-c3/preview.log).
