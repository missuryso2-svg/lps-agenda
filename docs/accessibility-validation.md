# Validação de acessibilidade K1-C

A verificação automatizada usa Chromium limpo, dados sintéticos e a árvore de acessibilidade do navegador. Mede foco visível nas primeiras cinco teclas Tab, nomes de botões e campos, marcos, overflow, reduced motion e CSP. Usa claro em 1280 px e escuro em 375 px. A árvore só registra contagens, sem nomes de dados. Os resultados são sinais de triagem e não substituem teste audível, contraste de cada combinação, teste manual de zoom ou anúncio dinâmico. [Log](qa-k1-c/accessibility.ndjson) · [Sonda](../tests/integration/k1c-accessibility-local.mjs).

As 36 combinações do Next e as oito verificações das quatro rotas corrigidas no Workers passaram na sonda final, sem eval. O diálogo de boas-vindas foi observado no Next, com foco interno, fechamento por Escape e aviso do trial disponível depois. [Baseline](qa-k1-c/accessibility-baseline.ndjson) · [Workers](qa-k1-c/accessibility-workers.ndjson).

Não houve validação audível por NVDA ou Narrador nesta sessão. O roteiro abaixo deve ser executado em ambiente de QA, com os gates comerciais fechados e a oferta habilitada somente na fixture local quando necessária.

## Preparação

1. No Windows, abrir NVDA ou Narrador e Chrome/Edge, perfil sem extensões, zoom em 100%. Usar somente teclado. Repetir com zoom de 200% e tema alternado. Ativar a preferência do sistema por movimento reduzido e verificar que o feedback continua legível e que animações de navegação são reduzidas.
2. Usar usuário novo com e-mail sintético, owner, staff, gestor e operador do financeiro. Testar como visitante antes do login. Abrir o visualizador de fala do NVDA para registrar apenas mensagens sanitizadas. Evitar gravar senhas, tokens ou notas do cliente.
3. Percorrer Tab e Shift+Tab, usar Enter/Espaço, setas e Esc. Confirmar foco visível, ordem previsível, região principal, títulos e landmarks, label e contexto dos controles. Conferir texto normal com contraste mínimo 4,5:1 e componentes/indicadores de foco com 3:1 em estados relevantes. Priorizar erro, inatividade, fundo dourado e modo escuro.

## Roteiro em português

| Fluxo | O que conferir |
| --- | --- |
| Landing | Alcançar navegação, seletor de tema, planos e CTA. Ler “Crie sua conta e ganhe 7 dias grátis.” em ordem. Ampliar sem perda de texto. |
| Login e cadastro | E-mail e senha com nomes, mostrar/ocultar senha com estado, erro e carregamento anunciados sem duplicar, manter teclado no campo inválido. Cadastro neutro e mensagem de confirmação. |
| Recuperação e redefinição | Ler retorno neutro para e-mail existente e desconhecido. Acompanhar erro de token, sucesso e retorno ao login. Usar somente link de caixa de QA. |
| Onboarding e boas-vindas | Ler ordem, erros e status do envio. Confirmar alerta dos sete dias grátis e diálogo com nome, foco inicial, contenção do foco, Escape, fechamento e retorno ao elemento de origem. Acessar novamente e verificar que modal consumido não reaparece. |
| Dashboard, agenda diária e semanal | Ler títulos, cartões e tabela/lista. Trocar data e modo com teclado. Abrir atendimento, conferir estado, reagendamento, conflito, confirmação e retorno do foco. |
| Clientes, serviços, equipe, horários | Conferir pesquisa, estados vazio/carregando, filtros, paginação, cabeçalhos, formulários CRUD e diálogos. Ler contexto de cada botão “Editar” e validar erro por campo. |
| Financeiro, plano e assinatura | Checar filtro temporal, cabeçalhos e formatos de moeda, resumo de cobrança e Pix manual. Ler impacto do acordo e avisos de perda de acesso. Fluxo com poucos dados e com tabela cheia. |
| Configurações e QR Code | Nomear anexar/remover e selecionar arquivo. Ler erros, sucesso e confirmação. QR deve ter alternativa textual copiável e destino anunciável. |
| Agendamento público | Navegar serviço, profissional, data e hora com teclado. Ouvir disponibilidade, indisponibilidade, erros, aviso de carregamento, contato e confirmação da reserva. |
| Administração | Testar gestor e operador em separado. Ler filtros global/paginado, confirmação e trilha. Verificar que usuário comum recebe negativa clara. |

Para cada falha registrar rota, papel, tema, zoom, leitor/versão, passos com teclado, fala esperada, fala real, foco e severidade. Reexecutar depois da correção. Se a falha impedir concluir um fluxo essencial, tratar como bloqueio de publicação.
