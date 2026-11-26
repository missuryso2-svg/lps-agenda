# LPS Agenda — J2-B · Autenticação e onboarding

26/11/2026 · codex/redesign-j2 · base aprovada 15a2758

**GO técnico local para revisão visual. A J2-C aguarda aprovação visual. Lançamento comercial em NO-GO.**

## Interface entregue

| Tela | Decisão |
| --- | --- |
| Entrar | Dois campos com rótulos persistentes, ação principal em dourado e recuperação junto à senha. Cadastro e demonstração permanecem acessíveis. O e-mail é identificado como usuário para gerenciadores de senhas. |
| Criar conta | Formulário em fluxo único, termos rotulados e links legais separados do controle de consentimento. Os termos comerciais e a oferta de teste permanecem disponíveis em um detalhe nativo. A confirmação por e-mail tem estado persistente com foco no título. |
| Recuperar senha | Um campo, estado de envio anunciado e a mesma mensagem para conta existente e ausente. O sucesso mantém a orientação sobre expiração e um retorno ao login. |
| Redefinir senha | Nova senha e confirmação com instruções associadas aos campos. O estado de link expirado oferece nova solicitação. O e-mail da sessão aparece somente no estado autenticado, conforme a regra existente. |
| Onboarding | Conta concluída, barbearia como etapa atual e painel como destino. Nome, identificador, telefone opcional e fuso continuam no mesmo formulário. O prefixo visual acompanha /agendar/[slug]. A edição manual do identificador, a regeneração e a intenção por aba mantêm o comportamento anterior. |

O layout reutiliza os tokens, os logos e a fotografia aprovada na J2-A. O desktop apresenta um painel editorial com imagem estática de 480 ou 768 px conforme a densidade de tela. O mobile prioriza o formulário. O fundo claro e a superfície escura usam os mesmos papéis semânticos. Campos têm rótulo, ajuda ou erro associado, foco visível e tamanho adequado ao toque. Durante a confirmação de cadastro e recuperação, o título recebe foco para substituir o formulário de maneira previsível.

### Arquivos

| Área | Arquivos |
| --- | --- |
| Páginas | src/app/(auth)/layout.tsx e páginas de login, cadastro, recuperar-senha e redefinir-senha. src/app/onboarding/page.tsx. |
| Estrutura e estilos | src/features/auth/components/account-shell.tsx, account-form.tsx e account.css. src/components/forms/password-input.tsx. |
| Formulários | src/features/auth/components/login-form.tsx, signup-form.tsx, forgot-password-form.tsx e reset-password-form.tsx. src/features/onboarding/components/onboarding-form.tsx. |
| QA e documentação | tests/integration/j2b-visual.mjs, j2b-auth.mjs e local-next-qa.mjs. docs/design-system-j2.md, este relatório e docs/qa-j2-b. |

### Movimento e skills

| Antes | Depois | Por quê |
| --- | --- | --- |
| Entradas do painel em animate-rise e mudança ampla de propriedades nos controles. | Entrada imediata. Feedback de ponteiro fino em scale 0,98, 140 ms e cubic-bezier(0.23, 1, 0.32, 1). | Acesso frequente e teclado respondem imediatamente. Somente o feedback por ponteiro altera a composição. |
| Indicador de envio girava em todos os modos. | Giro CSS de transform em 850 ms e ícone estático com movimento reduzido. O rótulo e o anúncio textual comunicam o envio em ambos os modos. | Estado perceptível, inclusive com animação desativada. |
| Toggle de senha fora do Tab. | Foco visível, nome estável, aria-pressed e resposta imediata. Seletor de fuso mantém a navegação Radix e abre instantaneamente. | A sequência de teclado acompanha a ordem dos campos. |

Foram usadas emil-design-eng para consistência e hierarquia, review-animations para verificar duração, teclado e movimento reduzido, improve-animations para remover entradas desnecessárias e animation-performance para restringir efeitos a transform. [Repositório oficial de Emil Kowalski](https://github.com/emilkowalski/skills).

## Segurança e homologação

As Server Actions, os schemas Zod, o callback, a recuperação neutra, a CSP, a sessão, os cookies, o middleware, o SQL e as migrations permanecem nos caminhos originais. O formulário HTML declara POST para manter as credenciais fora da URL também quando o JavaScript está indisponível. O caminho interativo continua no handler existente. O teste de onboarding produziu uma barbearia com vínculo owner, zero assinaturas e zero pagamentos. A flag de trial permaneceu desligada.

O QA usou Supabase descartável e Mailpit em loopback, com confirmação e recuperação por mensagens reais no capturador local. A origem do aplicativo foi unificada em localhost no QA para acompanhar a origem resultante do callback e a política de cookies. A única alteração de configuração foi na lista de retornos do Supabase local. O runtime da aplicação continuou vinculado a 127.0.0.1. [Testes locais do Supabase](https://supabase.com/docs/guides/local-development/testing/overview).

## Capturas comparativas

As cinco telas foram capturadas antes e depois, em 375, 768, 1280 e 1920 px, nos temas claro e escuro. Campos do onboarding e da redefinição usaram uma sessão sintética. A prévia usa as mesmas rotas do projeto. As imagens abaixo são codificações WebP das capturas reais. Os PNG originais ficam em C:/Users/missu/source/lps-agenda-j2b-visual.

| Tela | 1280 px claro | 375 px escuro |
| --- | --- | --- |
| Entrar | [Antes](qa-j2-b/screenshots/before/login-1280-light.webp) · [Depois](qa-j2-b/screenshots/after/login-1280-light.webp) | [Antes](qa-j2-b/screenshots/before/login-375-dark.webp) · [Depois](qa-j2-b/screenshots/after/login-375-dark.webp) |
| Criar conta | [Antes](qa-j2-b/screenshots/before/cadastro-1280-light.webp) · [Depois](qa-j2-b/screenshots/after/cadastro-1280-light.webp) | [Antes](qa-j2-b/screenshots/before/cadastro-375-dark.webp) · [Depois](qa-j2-b/screenshots/after/cadastro-375-dark.webp) |
| Recuperar senha | [Antes](qa-j2-b/screenshots/before/recuperar-senha-1280-light.webp) · [Depois](qa-j2-b/screenshots/after/recuperar-senha-1280-light.webp) | [Antes](qa-j2-b/screenshots/before/recuperar-senha-375-dark.webp) · [Depois](qa-j2-b/screenshots/after/recuperar-senha-375-dark.webp) |
| Redefinir senha | [Antes](qa-j2-b/screenshots/before/redefinir-senha-1280-light.webp) · [Depois](qa-j2-b/screenshots/after/redefinir-senha-1280-light.webp) | [Antes](qa-j2-b/screenshots/before/redefinir-senha-375-dark.webp) · [Depois](qa-j2-b/screenshots/after/redefinir-senha-375-dark.webp) |
| Onboarding | [Antes](qa-j2-b/screenshots/before/onboarding-1280-light.webp) · [Depois](qa-j2-b/screenshots/after/onboarding-1280-light.webp) | [Antes](qa-j2-b/screenshots/before/onboarding-375-dark.webp) · [Depois](qa-j2-b/screenshots/after/onboarding-375-dark.webp) |

[Galeria completa com 80 capturas](qa-j2-b/README.md).

## Verificação e desempenho

| Verificação | Resultado |
| --- | --- |
| Vitest | 810 testes em 39 suítes. [Log](qa-j2-b/vitest.log) |
| Typecheck e lint | Saída 0. [Typecheck](qa-j2-b/typecheck.log), [lint](qa-j2-b/lint.log) |
| Next.js e OpenNext | Builds de produção locais concluídos. O OpenNext registrou o aviso preexistente sobre proxy Node.js experimental. [Next.js](qa-j2-b/next-build.log), [OpenNext](qa-j2-b/opennext-build.log) |
| Navegador | 40 combinações no build atual, com os cinco caminhos, quatro larguras e dois temas. CSP estrita, salto ao conteúdo, foco visível, rótulos na árvore de acessibilidade e ausência de overflow horizontal. [Antes](qa-j2-b/before-visual.log), [depois](qa-j2-b/after-visual.log) |
| Dados sintéticos | Cadastro por e-mail, ação de revelar senha por teclado, proprietário e barbearia, fuso e slug, recuperação neutra, link real de reset, validação de confirmação e login com senha alterada. Chrome preencheu nome e e-mail via CDP. Foram conferidos os atributos de preenchimento de senha, o anúncio de envio e a submissão nativa sem JavaScript. [Log](qa-j2-b/auth.log), [Chrome Autofill](https://chromedevtools.github.io/devtools-protocol/tot/Autofill/) |
| Prévia | Processo em 127.0.0.1:59330, com Supabase de QA local. A conta de avaliação abre o onboarding e a redefinição autenticada. [Log](qa-j2-b/preview-smoke.log) |
| Git | git diff --check e git diff --cached --check com saída 0. [Log](qa-j2-b/diff-check.log) |

Os 19 pares de tokens passaram os limiares testados. Os mínimos de texto foram 5,84:1 no claro e 7,40:1 no escuro. Foco e contornos tiveram mínimos de 3,89:1 e 4,61:1. A revisão de leitura usou a árvore de acessibilidade do Chromium e navegação por teclado. A leitura audível em NVDA ou Narrador e o preenchimento por gerenciadores de senhas de terceiros permanecem pendentes de verificação manual.

Para reproduzir, usar o Supabase e o Mailpit descartáveis do helper tests/integration/local-next-qa.mjs, com B2A2_QA_NEXT_HOST=localhost e o callback local autorizado, CSP_ENFORCE=true e J2B_QA_MAIL_PORT=59324. Em builds locais, node tests/integration/j2b-auth.mjs testa os fluxos reais e node tests/integration/j2b-visual.mjs after DIRETORIO gera capturas e métricas.

Duas rodadas alternaram a base e a J2-B em Chromium, com contexto novo a cada visita, CSP estrita e 80 medições por versão. A janela de observação acompanha o carregamento inicial em loopback. [Amostras e medianas](qa-j2-b/benchmark.json).

| Mediana | Antes | Depois |
| --- | ---: | ---: |
| LCP | 156 ms | 152 ms |
| FCP | 128 ms | 130 ms |
| TTFB | 22,70 ms | 21,15 ms |
| JavaScript inicial | 227.935 B | 227.898 B |
| Imagens em 375 e 768 px | 11.068 B | 11.068 B |
| Imagens em 1280 e 1920 px | 37.178 B | 32.422 B |
| CLS | 0 | 0 |

O maior CLS observado na J2-B foi 0,00155. Os resultados são locais, sem simulação de rede móvel.

## Gate da próxima fase

A prévia local permite revisão das cinco telas. A J2-C fica condicionada à aprovação visual explícita. O lançamento comercial permanece em NO-GO.

Permanecem abertas a homologação do Images Binding real, a investigação dos quatro timeouts, a integridade das transições diretas de atendimentos, a reconciliação de fotos privadas órfãs, os controles de abuso e autenticação, a confiança nos headers do proxy e a revisão das permissões da Data API. [Auditoria I4](security-audit-i4.md), [J1](cloudflare-migration-j1.md), [J1.1](cloudflare-images-j1-1.md).
