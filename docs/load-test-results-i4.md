# Rajadas HTTP locais — I4

25/11/2026 · Next.js em build de produção e Supabase descartável na mesma máquina.

`tests/integration/i4-load-local.mjs` usa o helper de QA que verifica o projeto
descartável e aceita somente as portas loopback configuradas. Cada estágio
lança uma requisição por cliente e alterna entre página de login, página pública
de agendamento e agenda autenticada. O cliente consome a resposta inteira.
Prazo por requisição de 20 s e interrupção após o primeiro estágio com erro.

| Concorrência | Respostas | Erros | p50 | p95 | p99 | Respostas/s na rajada | Backends / esperando lock após o estágio |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 10 | 0 | 226 ms | 228 ms | 228 ms | 43,7 | 16 / 0 |
| 25 | 25 | 0 | 484 ms | 488 ms | 488 ms | 51,0 | 17 / 0 |
| 50 | 50 | 0 | 1.121 ms | 1.130 ms | 1.131 ms | 44,1 | 17 / 0 |
| 100 | 96 | 4 | 2.978 ms | 3.009 ms | 3.014 ms | 4,8 | 17 / 0 |

No estágio 100, quatro requisições ficaram sem resposta até o prazo de 20 s.
Os percentis incluem somente as respostas concluídas. A vazão inclui o tempo
até o último timeout. A rodada inicial atingiu 100/100 sem erro e p95 de
2.645 ms. A divergência entre rodadas impede tratar 100 simultâneos como
patamar comprovado. A amostra de backends foi tomada depois da rajada e
não mede pico nem exclui espera durante o estágio.
[Log da rodada final](qa-i4/i4-http-i4-load-local.log).

O login real, a disponibilização de horários, a concorrência por vaga,
as consultas financeiras e os uploads foram exercitados nas suítes
funcionais e de concorrência. A rajada medida fez leituras de páginas,
com uma única sessão sintética na agenda. A prova de upload também
executou 31 chamadas concorrentes ao limitador, com 30 permissões e 429
na rota real. A prova de Pix simulou perda de resposta e replay idempotente.

Uma medição sustentada com distribuição realista de sessões, volume de
dados, cenário de escrita, CPU, memória e lock durante a carga ainda é
necessária na homologação. Instrumentar latências de Next, Auth, Data API
e PostgreSQL por rota, além do tempo de conexão, para localizar a origem
dos timeouts. Esses números não estimam capacidade de produção.
