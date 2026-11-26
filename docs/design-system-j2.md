# LPS Agenda — fundação visual e landing J2-A

25/11/2026 · branch local codex/redesign-j2 · base 1ce461f

**J1 e J1.1 com GO técnico local, integradas à main por fast-forward. J2-A pronta para aprovação visual na branch de redesign. Lançamento comercial em NO-GO.**

## Checkpoint J1 e J1.1

Revisão incremental de 31094d8 a a6c6919 e 1ce461f. A main era ancestral dos quatro commits adicionais. A conectividade do Git, o diff e a árvore da integração foram conferidos. A busca no conteúdo rastreado por padrões comuns de chaves privadas e credenciais não apresentou candidatos.

| Área | Resultado da revisão |
| --- | --- |
| Runtimes e falha segura | O Node/Vercel preserva Sharp. Workers usa UPLOAD_IMAGES e falha antes do Storage se o binding estiver ausente, indisponível ou retornar saída inválida. As provas HTTP locais registram imagens válidas e recusas de arquivos malformados, animados e cenários de erro do binding. |
| Tenant e referências | A autenticação do proprietário, a origem, o tenant e a versão esperada continuam sendo conferidos antes do processamento. Os testes existentes cobrem rejeição entre tenants, concorrência e compensação. A J1.1 não alterou rotas de Storage, política de buckets ou migrations. O Supabase continua recebendo o WebP processado com a chave versionada existente. |
| Configuração Cloudflare | Wrangler declara o binding de upload local e desabilita workers.dev e URLs de preview. O wrapper testa CSP com nonce no workerd. O retorno à Vercel preserva o mesmo caminho de dados via Supabase. O rollback de tráfego continua dependendo da execução autorizada do plano J1. |
| Riscos hospedados | Os artefatos provam o binding simulado em QA local. Entitlement, franquia, fidelidade do decoder e operação da conta dependem da homologação hospedada. |

Evidências existentes em [Cloudflare J1](cloudflare-migration-j1.md), [Cloudflare Images J1.1](cloudflare-images-j1-1.md) e [logs sanitizados J1.1](qa-j1-1/README.md). Os worktrees anteriores e os relatórios foram preservados.

## Fundação

Em src/app/j2-foundation.css, os tokens semânticos têm prefixo --lps-. A landing consome esses tokens. Os componentes compartilhados preservam seu estilo padrão nas demais rotas. A fundação usa Tailwind, Radix, os componentes existentes e fontes do sistema.

| Família | Decisão |
| --- | --- |
| Cor | Fundo mineral no claro e carvão quente no escuro. Dourado de ação #dcb65f, dourado de texto #715117 no claro e #e4c478 no escuro. Superfícies, bordas, foco, texto secundário e estados positivo e crítico têm papéis próprios. Logos institucionais usam os arquivos originais. |
| Tipografia | Georgia para títulos editoriais, sans do sistema para leitura e mono do sistema para horários e futuros dados tabulares. A primeira dobra usa um título principal e dois destinos. Linhas longas são limitadas em textos introdutórios. |
| Espaçamento e superfícies | Largura de leitura máxima de 74rem, margens fluidas de 1,125 a 3,5rem e respiro entre seções de 3,5 a 7,5rem. Raio de 8 px nos controles e 16 px nos painéis. A agenda concentra a elevação e os demais agrupamentos usam divisórias. |
| Controles | A ação principal usa dourado sólido, a secundária usa link ou borda. Controles principais têm pelo menos 44 px de altura e anel de foco visível de 2 px. Nas próximas telas, aplicar os mesmos papéis a campos com rótulo visível, ajuda associada, erro textual e estado desabilitado. |
| Tabelas e filtros | Para as fases seguintes, usar cabeçalhos semânticos, números tabulares e alinhados, filtros rotulados e contagem de resultados. Em telas estreitas, rolagem restrita à região da tabela quando necessária. Nos indicadores, combinar cor com texto, e manter ações na mesma ordem. |
| Navegação e diálogo | Cabeçalho sólido, salto direto para o conteúdo e menu móvel com Radix, foco contido e retorno ao gatilho. Nas próximas fases, preservar Escape, título acessível, devolução do foco e as confirmações obrigatórias dos diálogos existentes. |
| Estados e mensagens | Diretriz para as próximas fases. Skeleton com dimensões do conteúdo, estado vazio com próximo passo, erro contextual preservando dados preenchidos e carregamento com estado acessível. Toast para feedback transitório e erro junto ao elemento afetado. Esses fluxos operacionais permanecem nas telas atuais. |

## Landing

- O hero passou a mostrar uma agenda ilustrativa, com serviços do catálogo demo e horários fictícios. Os links levam à demonstração real da Barbearia Aurora e aos planos.
- As funcionalidades ocupam uma faixa com divisórias. A fotografia institucional de barbearia passou para a demonstração e tem versões estáticas de 480 e 768 px. O navegador escolhe pelo tamanho de exibição e usa o original em densidades maiores. A foto ganha espaço reservado e carregamento preguiçoso.
- Os três planos mantêm os limites confirmados de 1, 5 e 10 profissionais ativos, proposta comercial e teste de 168 horas sujeito à liberação. O contato usa o mesmo validador de WhatsApp e exibe o estado de configuração ausente quando aplicável.
- A FAQ usa elementos nativos details/summary. O rodapé mantém os links institucionais, de produto e legais. Login, cadastro, demonstração e destinos de navegação mantêm as rotas existentes.

### Movimento

| Antes | Depois | Por quê |
| --- | --- | --- |
| Ações herdavam transição geral do botão. | Ação dourada em ponteiro fino comprime a 0,98 em 140 ms com cubic-bezier(0.23, 1, 0.32, 1). Ativação por teclado e preferência por movimento reduzido têm resposta imediata. | Feedback curto com scale e foco estável. |
| Menu herdava blur, fade e deslocamento padrão. | Menu acionado por ponteiro desliza por transform em 200 ms com cubic-bezier(0.32, 0.72, 0, 1). Fechamento visual por ponteiro usa 150 ms. Teclado, Escape e prefers-reduced-motion têm resposta imediata. Overlay sólido translúcido. | Preservar orientação e evitar custo do blur, mantendo foco e regiões de pintura estáveis. |
| A FAQ usava abertura nativa. | FAQ continua instantânea, com rotação discreta do ícone entre estados sem interpolação. | Atualização direta e previsível para uma ação de leitura. |

Aplicadas as quatro skills instaladas emil-design-eng, review-animations, improve-animations e animation-performance. [Repositório oficial](https://github.com/emilkowalski/skills).

## Evidência visual

Capturas da página inteira em Chromium, escala 1, com movimento reduzido para estabilidade. As imagens WebP do repositório são cópias reencodificadas das capturas reais. Os PNG originais e os recortes da primeira dobra ficam no diretório local permanente C:/Users/missu/source/lps-agenda-j2-visual. Capturas com canal comercial desconfigurado para evitar exposição de dados.

| Largura | Antes claro | Depois claro | Antes escuro | Depois escuro |
| --- | --- | --- | --- | --- |
| 375 px | [Ver](qa-j2-a/screenshots/before/375-light.webp) | [Ver](qa-j2-a/screenshots/after/375-light.webp) | [Ver](qa-j2-a/screenshots/before/375-dark.webp) | [Ver](qa-j2-a/screenshots/after/375-dark.webp) |
| 768 px | [Ver](qa-j2-a/screenshots/before/768-light.webp) | [Ver](qa-j2-a/screenshots/after/768-light.webp) | [Ver](qa-j2-a/screenshots/before/768-dark.webp) | [Ver](qa-j2-a/screenshots/after/768-dark.webp) |
| 1280 px | [Ver](qa-j2-a/screenshots/before/1280-light.webp) | [Ver](qa-j2-a/screenshots/after/1280-light.webp) | [Ver](qa-j2-a/screenshots/before/1280-dark.webp) | [Ver](qa-j2-a/screenshots/after/1280-dark.webp) |
| 1920 px | [Ver](qa-j2-a/screenshots/before/1920-light.webp) | [Ver](qa-j2-a/screenshots/after/1920-light.webp) | [Ver](qa-j2-a/screenshots/before/1920-dark.webp) | [Ver](qa-j2-a/screenshots/after/1920-dark.webp) |

Contraste calculado para 22 pares semânticos por tema. Mínimos para pares de texto de 5,31:1 no claro e 6,55:1 no escuro. Mínimos para contorno e foco de 3,59:1 e 4,11:1, respectivamente. Foram testados salto ao conteúdo, foco visível, FAQ por Enter/Espaço, armadilha de foco, Escape e mudança de tema. As oito combinações ficaram sem overflow horizontal e com CLS inicial 0. A inspeção cobre a landing em Chromium e os pares de tokens testados.

## Desempenho

Comparação de builds de produção locais no mesmo host, com CSP estrita, contexto novo de Chromium e escala 1. Foram feitas três rodadas alternando a base 1ce461f e a J2-A, com 24 amostras por versão. FCP e LCP são os valores observados na janela de captura após o carregamento inicial. Os bytes são os corpos codificados dos recursos já vistos nessa janela, antes da rolagem. [Amostras e resumo](qa-j2-a/benchmark.json).

| Mediana | Antes | Depois |
| --- | --- | --- |
| LCP | 148 ms | 134 ms |
| FCP | 140 ms | 134 ms |
| TTFB | 18 ms | 18 ms |
| CLS inicial | 0 | 0 |
| Tarefas longas | 1 | 1 |
| JavaScript observado | 216.660 B | 216.817 B |
| Imagens observadas | 41.987 B | 30.392 B |

Na coleta de 375 px, as imagens passaram de 28.350 B para 23.594 B. Em 1920 px, de 89.146 B para 37.190 B. Os tempos variaram nas capturas iniciais, incluindo medições mais lentas após o redesign enquanto outras validações rodavam. As rodadas separadas reduzem essa interferência. Os números caracterizam o loopback local, sem rede móvel simulada ou métricas de campo. [Captura inicial antes](qa-j2-a/capture-before.json), [captura inicial depois](qa-j2-a/capture-after.json).

## Testes executados

| Validação | Resultado |
| --- | --- |
| Vitest | 810 testes em 39 suítes. [Log](qa-j2-a/vitest.log) |
| Typecheck e lint | Saída 0. [Typecheck](qa-j2-a/typecheck.log), [lint](qa-j2-a/lint.log) |
| Build Next.js | Build de produção local concluído. [Log](qa-j2-a/next-build.log) |
| Build OpenNext | Build Linux concluído com Next 16.4.5, OpenNext Cloudflare 1.20.19 e aviso existente sobre proxy Node.js experimental. [Log](qa-j2-a/opennext-build.log) |
| Workers local | Wrangler serviu a landing e os WebP responsivos. CSP estrita e nonce distinto por requisição, alinhado ao HTML. [Log](qa-j2-a/worker-smoke.log) |
| Navegador e acessibilidade | Oito combinações aprovadas no build Next.js com CSP estrita, mais interação do menu por ponteiro. [Log](qa-j2-a/visual.log) |
| Integração comercial | Supabase descartável e QA fictício em 375, 768 e 1280 px. Catálogo e contato interceptado, login, cadastro, demonstração, papéis, contratos manuais, teste e legado. Verificada a preservação dos registros financeiros, aquisição fechada e onboarding com flag desligada. [Log](qa-j2-a/browser-qa.log) |
| Diff | git diff --check na cópia de trabalho e no índice. [Log](qa-j2-a/diff-check.log) |

Com o ambiente descartável e os pré-requisitos de tests/integration/local-next-qa.mjs, usar node tests/integration/j2-visual.mjs after DIRETORIO para repetir a revisão. O argumento before aponta para um build de 1ce461f. A opção --metrics-only coleta apenas as métricas. As capturas bloqueiam destinos externos e o teste comercial intercepta o WhatsApp.

## Aprovação e pendências

A J2-A cobre a landing e a base reutilizável. J2-B, J2-C, J2-D e J2-E aguardam aprovação visual explícita. Autenticação, dashboard, agenda operacional, agendamento público e administração financeira seguem com as interfaces vigentes.

Permanecem em aberto a homologação do Images Binding real, a investigação dos quatro timeouts, a integridade das transições diretas de atendimentos, a reconciliação de fotos privadas órfãs, os controles de abuso e autenticação, a confiança nos headers do proxy e a revisão das permissões da Data API no ambiente hospedado. [Auditoria I4](security-audit-i4.md), [desempenho I4](database-performance-i4.md), [calibração dos timeouts](qa-j1-1/timeout-calibration.log).

**Parecer J2-A local. GO para revisão visual. Publicação e lançamento comercial em NO-GO.**

## Extensão J2-B — conta e primeiro acesso

- A estrutura de conta usa cabeçalho com a marca, seletor de tema, salto ao conteúdo e um painel de formulário. No desktop, uma fotografia já usada na landing acompanha as telas de autenticação. Nas telas estreitas, o formulário ocupa o espaço principal.
- Rótulos ficam acima dos controles. Campos mantêm o atributo de preenchimento automático adequado à tarefa. Ajuda e erros usam o mesmo destino de aria-describedby, com aria-invalid no campo associado e foco visível de 2 px.
- O botão de senha permanece na sequência do teclado. O nome acessível é estável e aria-pressed indica se a senha está visível. A confirmação tem seu próprio nome e controla seu próprio campo.
- O envio usa um botão dourado, bloqueio durante a ação e anúncio textual de processamento. Erros gerais aparecem em alerta local. Confirmações por e-mail recebem foco no título e permanecem disponíveis junto à ação para voltar ao login.
- O onboarding mantém os campos e o envio em uma só etapa editável. A lista acessível marca conta concluída, barbearia como etapa atual e painel como destino. O identificador mostra o prefixo real de agendamento sem mudar o formato persistido.
- Movimento fica limitado ao feedback da ação principal por ponteiro fino e ao indicador de envio via CSS. Foco, visibilidade da senha, mensagens e seletor de fuso respondem imediatamente. O movimento reduzido mantém os estados legíveis e o indicador estático.

[Relatório e evidências da J2-B](redesign-j2-b.md).
