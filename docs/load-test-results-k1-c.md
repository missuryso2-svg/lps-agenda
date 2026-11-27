# Carga instrumentada K1-C

27/11/2026 · aplicação de 13c7361 · Node 26.13.0 · Next em build de produção · Supabase CLI 3.1.0 e PostgreSQL 17.11 no Docker Desktop/WSL2. Host com 12 processadores lógicos e 16 GiB de RAM. Docker com 12 processadores e 7,57 GiB. O gateway de QA publicou exclusivamente 127.0.0.1 e o Next também aceitou apenas loopback. Havia outras stacks locais em execução. Elas não foram usadas pelo gerador e seus custos de infraestrutura podem afetar a reprodutibilidade.

## Método e interrupção

O teste I4 fez GET de /login, /agendar/slug e /dashboard/agenda, alternados, com cookie pré-autenticado de um único owner sintético para a agenda. Consumiu o corpo inteiro. Não mediu POST de login nem escrita. O teste novo mantém essas rotas, o arranjo 34/33/33 no estágio de 100 e o prazo de **20.000 ms**. Executa primeiro uma calibração de três rotas, depois estágios de 10, 25, 50 e 100. A rajada despacha uma requisição por VU. Na carga sustentada, cada VU tem ao máximo uma requisição em voo, gira pelas três rotas por 8 s e termina as que já estão em voo.

Critérios definidos para o ensaio local: 100% de HTTP 200 nas leituras, nenhuma expiração do prazo, nenhum efeito sobre atendimentos da fixture e sem escalada após falha. Em sustentação, o primeiro erro HTTP/transporte cancela a rodada. A amostragem interrompe se a contagem ultrapassar 90% de max_connections ou alcançar 20 sessões esperando lock. Antes de uma carga longa, adicionar corte de recursos com base no orçamento do ambiente e ensaiar a reação. O teste atual usa janelas curtas, sem SLO de produção. A instrumentação registra código HTTP, tempo até headers e corpo, ID aleatório, aceitação no servidor, duração no Next, chamadas Auth/REST/RPC, atraso do event loop, CPU e RSS. PostgreSQL e Docker são amostrados durante cada estágio. As execuções SQL são deltas agregados por família e não subspans de cada requisição. A diferença cliente–servidor mede atraso até o handler, incluindo conexão, filas e escalonamento local. Nenhum URL completo, corpo, credencial, registro pessoal ou texto de SQL bruto é registrado. [Gerador](../tests/integration/k1c-load-local.mjs) · [Instrumentação](../tests/integration/k1c-load-trace.cjs).

## Resultado

| Forma | VUs | Sucesso | p50 ms | p95 ms | p99 ms | Respostas/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rajada | 10 | 10/10 | 203 | 205 | 205 | 48,7 |
| Rajada | 25 | 25/25 | 484 | 485 | 486 | 51,4 |
| Rajada | 50 | 50/50 | 939 | 945 | 946 | 52,8 |
| Rajada | 100 | 100/100 | 1.618 | 1.895 | 1.898 | 52,6 |
| Sustentada | 10 | 550/550 | 136 | 251 | 353 | 68,4 |
| Sustentada | 25 | 600/600 | 324 | 552 | 680 | 74,3 |
| Sustentada | 50 | 571/571 | 710 | 973 | 1.055 | 69,8 |
| Sustentada | 100 | 497/497 | 1.728 | 2.679 | 2.784 | 58,3 |

Zero erros HTTP e zero timeouts nos oito estágios. As duas calibrações passaram, com p95 de 364 e 254 ms. As leituras preservaram a contagem de atendimentos da fixture. Na sustentação a 100, o Next chegou a 100 em voo, 173% de um núcleo somando as threads e 504 MiB de RSS. A amostragem de banco a 100 registrou no máximo 22 conexões de 100, uma ativa e zero esperando lock. Esses picos são amostras, não teto. Todas as requisições a 100 foram aceitas e terminaram no Next. [Rajadas](qa-k1-c/burst.ndjson) · [Sustentação](qa-k1-c/sustained.ndjson).

## Quatro timeouts da I4

**Causa histórica indeterminada.** A rodada original a 100 teve 96 respostas e quatro timeouts. Outra rodada I4 já tinha completado 100/100. O log antigo não identifica rota das quatro perdas, chegada ingressada, cabeçalhos versus corpo, duração Auth/API, espera de pool/event loop, CPU ou sessões durante a falha. Assumir CPU ou lock como causa seria inferência sem evidência. O ensaio atual também mudou a revisão e o ambiente de execução local. [Evidência I4](load-test-results-i4.md).

O gargalo **observado agora** é amplificação no caminho de leitura e acúmulo no runtime em alta concorrência. Sustentação de 25 para 100 elevou p95 de 552 para 2.679 ms e baixou vazão de 74,3 para 58,3/s. A página de login, sem Supabase, chegou a p95 de 2.089 ms. A agenda teve p95 de 2.767 ms, com duas chamadas Auth, 12 REST e três RPCs por resposta em média. A página pública usou cinco REST e uma RPC por resposta. A 100 em rajada, o p95 do despacho até o handler chegou a 625 ms e o p95 do loop Next em uma janela a 214 ms. Sob sustentação, chamadas Auth chegaram a p95 de 216 ms e as RPCs da agenda a 522 ms por HTTP, enquanto 665 RPCs somaram 1.609,87 ms de execução SQL (média de 2,42 ms por chamada). A diferença sugere custo de fila, agendamento e camadas HTTP em conjunto, sem atribuir tempo ao pool especificamente. Não houve evidência de esgotamento de conexões ou locks persistentes para estes GETs. A instrumentação não mede invocações isoladas do edge.

O plano da agenda já usa leitura em lote. Avaliar deduplicação das duas validações Auth por requisição somente se preservar a verificação no servidor e RLS; depois comparar projeções, composição REST e RPC por rota. Medir resposta em bytes e manter dados autenticados fora de caches compartilhados. Cache público só para conteúdo anonimizado sem token, cobertura sensível, datas ou disponibilidade. Confirmar ganho em uma segunda comparação com cardinalidade realista antes de trocar índices ou introduzir cache. A contagem exata e a substring de clientes continuam candidatas para medição. A soma operacional de receita tem o limite conhecido da Data API e só deve mudar em tarefa financeira autorizada. Não houve otimização de produto, aumento de timeout, novo índice, alteração de pool ou alteração de schema nesta fase. O EXPLAIN ANALYZE da fixture de 20 tenants foi reexecutado em transação revertida. Agenda de dia usou appointments_shop_range_idx (1,260 ms). Primeira página de clientes usou customers_shop_idx (0,567 ms). Contagem por substring filtrou 1.001 candidatos do tenant (13,029 ms). [Planos K1-C](qa-k1-c/explain.log) · [Planos e gargalos I4](database-performance-i4.md).

A rodada de VUs mede leituras. A escrita, as transições concorrentes e as operações financeiras têm matrizes funcionais próprias, com dados/horários independentes e disputa explícita pela mesma vaga. Conflito esperado de vaga não é indisponibilidade. Antes do lançamento, repetir em homologação com teste em minutos, sessões diferentes, rotas de escrita representativas, alerta de saturação e comparação de taxa de sucesso por operação. Os resultados de localhost não dimensionam quantidade de barbearias nem custos de CPU do Workers. [Reserva em QA](qa-k1-b/booking-node.log) · [Concorrência na Data API](qa-k1-b/appointments-http.log) · [Financeiro em QA](qa-k1-b/finance-browser.log).
