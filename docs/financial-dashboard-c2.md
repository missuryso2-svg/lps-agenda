# C2 · Administração financeira da LPS Solutions

A entrada do painel é `/admin/assinaturas`. O operador pode abrir essa URL antes do login. Ao entrar, volta à rota interna solicitada. A conta precisa de uma concessão financeira ativa da C1. O procedimento para cadastrar o primeiro gestor está em [Operadores financeiros](financial-operators-c1.md).

| Área | Uso |
|---|---|
| Visão geral | Selecionar a competência dos valores e das mensalidades. Os indicadores de contratos retratam a carteira atual. O PostgreSQL calcula os totais sobre todas as linhas elegíveis. |
| Barbearias | Filtrar pelo início do nome ou pela origem. Abrir o detalhe para consultar contato, calendário, cobertura, suspensão, parcelas e registros de auditoria. |
| Mensalidades | Selecionar competência e situação, abrir a barbearia ou conferir um Pix elegível. A lista apresenta os valores original, ajustado e final da parcela. |
| Histórico | Consultar decisões humanas ou eventos financeiros por barbearia, operador, ação ou intervalo de datas. A ordenação usa instante e identificador. Os campos projetados permitem identificar o responsável e o resultado. |
| Operadores | O gestor informa o UUID de uma conta Auth existente, o nível e a justificativa. Pode revogar uma concessão de terceiro. A página identifica as concessões ativas e preserva as revogadas. |

## Operação

O registro do acordo exige uma adesão manual elegível e preço negociado explícito. No detalhe da barbearia, o operador seleciona o plano, registra as condições, as âncoras e o fuso contratual e revisa os dados. O contrato fica pendente. Para emitir, abre o contrato, escolhe a competência e confirma. A emissão preserva o valor contratado e o vencimento.

Para conferir um Pix, o operador abre a parcela, confere barbearia, plano, contrato, competência, vencimento e valor integral. Em seguida, informa o valor efetivamente recebido e o instante do crédito, marca a declaração de conferência do extrato e revisa os dados antes do envio. A referência de conciliação é opcional. O PostgreSQL verifica a sessão e a elegibilidade da baixa, registra o recibo e determina se há cobertura. Uma competência antiga, uma dívida vencida e uma suspensão independente seguem as regras da C1.

O UUID de cada tentativa financeira fica na aba do navegador. Em caso de perda da resposta, consultar a situação e o histórico. Se necessário, repetir com os mesmos dados. A aplicação só exibe sucesso após receber o resultado persistido. Suspensão, retomada e cancelamento também exigem justificativa e confirmação. A gestão de concessões usa a operação da C1 e o histórico de concessões para verificar um resultado incerto.

Os instantes de cobertura, primeiro vencimento e crédito são preenchidos em UTC, como indicam os campos. O horário recorrente de vencimento usa o fuso IANA do acordo. As datas exibidas têm a indicação de Brasília. Os filtros de período do histórico usam dias UTC, inclusive a data final. Os valores em reais aceitam vírgula decimal e são convertidos para centavos inteiros.

## Projeções e segurança

A migration 25, `20261119200000_financial_dashboard.sql`, mantém as assinaturas públicas da C1. A seleção da última conferência exige a mesma barbearia, origem manual Pix, escopo da assinatura da plataforma e situação paga. A seleção do contrato prioriza um registro corrente e usa origem, data e UUID para desempate. Um legado corrente com histórico manual requer conciliação. A data do trial provém exclusivamente de um trial manual escolhido em ordem determinística. A interface identifica o término efetivo do trial pelo instante de expiração. Um cadastro sem contrato tem categoria própria.

As consultas adicionais projetam a capacidade da própria sessão, o diretório filtrado, os totais da carteira, a auditoria filtrada e as concessões visíveis ao gestor. A página mostra 20 itens e solicita um item adicional para verificar se existe outra página. A busca por nome é por prefixo no servidor. A ordem do diretório usa UUID. O histórico usa cursor composto e ordem cronológica decrescente.

O módulo de autorização é exclusivo do servidor. Verifica o usuário no Supabase Auth e o nível ativo no PostgreSQL, inclusive na Server Action. As páginas são dinâmicas e usam `noindex`. A migration reaplica os privilégios das RPCs com autoridade do proprietário para remover a execução por `PUBLIC` encontrada nas ACLs anteriores. A proteção interna da C1 continua obrigatória mesmo para quem tem privilégio de execução. A projeção privada respeita RLS através de `security_invoker`.

## Homologação

| Validação | Resultado |
|---|---|
| PostgreSQL real, instalação limpa com 25 migrations | 248 verificações aprovadas. |
| Atualização de um banco na migration 19 com fixtures legadas | 250 verificações aprovadas, incluindo preservação de assinatura e pagamentos legados. |
| Projeções C2 | 16 verificações por cenário, incluindo grants, propriedade, origem, segregação de recebimentos, compatibilidade da RPC anterior e paginação de 105 barbearias. |
| HTTP C2 | 7 grupos com Next.js, Auth e PostgREST locais, incluindo POST direto, autorização após revogação, baixa integral e histórico. |
| Navegador | Chrome a 1280 e 375 pixels de largura. Revisão com foco de teclado e declaração inicialmente desmarcada. Uma resposta HTTP foi interrompida depois do commit do Pix e a repetição no navegador recuperou o recibo original. |
| Regressões de integração | 10 grupos HTTP B2-A2, 2 grupos C1, 18 verificações HTTP B2-B e 744 comparações do calendário. |
| Aplicação | Typecheck, lint, 680 testes Vitest e build de produção aprovados. |

Para reproduzir, usar exclusivamente bancos descartáveis. Executar `tests/postgres/c2-dashboard.sql` antes das suítes da C1 e das fases anteriores, seguindo a ordem documentada na C1. Para o caminho de atualização, inserir a fixture legada entre as migrations 19 e 20. O ensaio HTTP usa o mesmo ambiente descartável e de loopback do teste B2-A2. Compilar o Next com a URL e as chaves públicas dessa QA e executar `node tests/integration/c2-dashboard-http.mjs`. Para incluir o navegador, fornecer `C2_QA_PLAYWRIGHT` com o caminho do módulo Playwright Core e `C2_QA_CHROME` com o executável Chrome. Sem essas variáveis, o script executa somente os grupos HTTP.

Em uma futura implantação, a aplicação depende da migration 25 e do provisionamento explícito de um gestor. Os volumes reais ainda precisam de medição para o diretório e os agregados por competência. Os indicadores de atraso refletem o estado persistido pelo processamento financeiro. O worker de inadimplência continua sem agendamento e o onboarding manual permanece desligado por padrão. Ajustes retroativos, baixa parcial, excedentes, antecipações sem competência e dias extras aguardam política comercial.
