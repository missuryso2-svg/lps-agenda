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

O escopo do C1 é a estrutura compartilhada, a visão geral e a agenda. C2 e C3 aguardam a aprovação visual do C1. A J2-D e o lançamento comercial permanecem fechados.

Permanecem abertas a validação manual em leitor de tela NVDA ou Narrador, a investigação dos quatro timeouts sem causa atribuída, a proteção das transições diretas de atendimentos, a reconciliação de fotos privadas órfãs, a homologação do Images Binding real, os controles de abuso e autenticação, a confiança nos headers do proxy e a revisão das permissões da Data API. [Auditoria I4](security-audit-i4.md), [Workers J1](cloudflare-migration-j1.md), [Images Binding J1.1](cloudflare-images-j1-1.md).

As alterações foram locais. Os controles de autorização, RLS, concorrência de agenda, segurança de Storage, preços históricos, contrato, pagamentos, migrations e arquivos de configuração do Workers estão nos artefatos existentes.
