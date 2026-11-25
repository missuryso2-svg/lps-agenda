# Desempenho do PostgreSQL — I4

25/11/2026 · Supabase CLI 3.1.0, PostgreSQL 17.11 e dados sintéticos descartáveis.

**Manter o acesso da aplicação pelo Supabase SDK.** Next usa `supabase-js` e
`@supabase/ssr` para Auth, Storage, REST e RPCs por HTTP(S). A Data API gerencia
suas próprias conexões ao PostgreSQL. Os clientes de servidor com sessão são
criados por requisição e o cliente privilegiado é restrito ao servidor, sem
persistência de sessão. `cache` do React deduplica leituras dentro da
renderização. Não foi identificado driver de PostgreSQL no runtime da aplicação.
[Conectividade do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

| Consumidor | Caminho | Observações |
| --- | --- | --- |
| Next, navegador, ações de reserva e jobs HTTP | SDK para Auth, Storage e Data API | RPC de negócio mantém sua transação no PostgreSQL. Usar timeouts HTTP e backpressure conforme o fluxo. |
| Migrations, diagnósticos e reconciliação autorizada | CLI ou `psql` por operação | São acessos administrativos diretos. Fechar sessão após a operação. Rodar exclusão de objeto pela API de Storage. |
| Testes de concorrência | `psql` e `dblink` locais | Conexões pertencem às suítes descartáveis. As suítes confirmam espera real em PostgreSQL e fecham os pares testados. |

PgBouncer, Prisma Accelerate e Hyperdrive ficam fora da arquitetura atual.
Se houver no futuro um job serverless com necessidade comprovada de SQL direto,
avaliar Supavisor em modo transacional, limites do plano e compatibilidade com
prepared statements. Capacidade e plano hospedados não foram medidos.

## Planos de execução locais

`tests/postgres/i4-performance.sql` carrega 20 tenants, 20.000 atendimentos e
20.020 clientes sintéticos, roda `ANALYZE` e mede com `EXPLAIN (ANALYZE, BUFFERS)`
como usuário autenticado com RLS. A transação reverte os dados ao final.
Resultados da execução após recriar o banco em
[replay-i4-performance.log](qa-i4/replay-i4-performance.log).

| Consulta | Plano observado | Tempo local |
| --- | --- | ---: |
| Agenda de um dia em um tenant | Bitmap em `appointments_shop_range_idx`, 48 linhas | 0,966 ms |
| Primeira página com 20 clientes ativos ordenados | Index Scan em `customers_shop_idx` | 0,343 ms |
| Contagem com busca por substring no tenant | Bitmap pelo tenant, 1.000 linhas removidas pelo filtro | 8,745 ms |

Os índices atuais suportaram a faixa de agenda e a primeira página de
clientes. Busca por substring e contagem exata fazem trabalho proporcional ao
conjunto do tenant. O volume sintético e a ordem de leitura desta execução
favorecem cache local. Não criar índice novo só com esses tempos.

## Gargalos e ações mensuráveis

| Área | Evidência | Próximo experimento |
| --- | --- | --- |
| Paginação e busca | Clientes têm páginas de 20 com contagem exata. Offset alto e busca por substring podem ler muitas linhas. | Repetir EXPLAIN com cardinalidades reais e texto representativo. Comparar paginação por cursor e `pg_trgm` apenas se p95 justificar custo de índice. |
| Agenda e projeções | Agenda usa intervalo e hidrata clientes, equipe e serviços em três consultas em lote. Não há uma consulta por atendimento nesse caminho. `select("*")` e conjuntos longos de IDs ainda aumentam resposta e tráfego. | Medir agenda semanal e mensal com múltiplos profissionais. Comparar projeções menores, relação embutida sob a mesma RLS e limite explícito com aviso ou paginação. |
| Receita operacional | `src/features/dashboard/queries.ts` busca pagamentos válidos e soma valores na aplicação. O stack limita respostas da Data API a 1.000 linhas. A consulta mensal sem paginação pode subcontar acima do limite. | Aprovar separadamente uma agregação no banco que preserve papel autorizado e escopo. Regressão com mais de 1.000 pagamentos e comparação com soma exata, com e sem vínculo de assinatura. |
| Notificações | Advisor local apontou `booking_recipient_access` executando função Auth por linha. | Validar plano com função sem dependência da linha em subselect, manter a mesma semântica RLS e repetir testes de destinatário e isolamento antes de propor migration. |
| Locks | Equipe e contrato usam lock por tenant. Agenda usa lock por loja e exclusão GiST contra sobreposição. Rate limit faz upsert e limpeza de janelas expiradas em toda chamada. | Medir espera de lock em rajadas com tenants distintos e um tenant quente. Avaliar limpeza em lotes e índices com evidência de contenção. |
| Cache, retries e timeouts | CSP com nonce torna HTML dinâmico, inclusive marketing e páginas legais. Bundles estáticos continuam cacheáveis. O SDK não tem orçamento uniforme de timeout para cada fluxo. | Medir custo de SSR no ingresso real. Usar prazos finitos por tipo de operação, retries com espera aleatória em leituras e reenvio de escrita financeira apenas com chave idempotente e payload compatível. |

Na execução local, `max_connections=100` e os valores globais de
`statement_timeout` e `idle_in_transaction_session_timeout` eram 0. Configuração
por papel ou sessão pode sobrescrever esses valores. Coletar na homologação
tempo de espera do pool da Data API, backends ativos, latência de Auth,
`pg_stat_statements`, leituras de disco, CPU, memória e duração de locks.
Separar erro HTTP, saturação da aplicação e espera no PostgreSQL antes de
alterar tamanho de pool. A prova HTTP está documentada no
[relatório de carga](load-test-results-i4.md).
