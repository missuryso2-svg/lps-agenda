# Evidências locais da I4

Os resultados de integração da I3/I3.1 correspondem à `main` local em
`77ff36b`. Os testes HTTP usaram o build desse commit. O helper de QA recebeu
apenas parâmetros de porta no worktree para usar o stack descartável, sem
alteração de código de aplicação durante a verificação desse build.

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Integridade e integração Git | `fsck` e fast-forward passaram. `main` ficou dois commits à frente de `origin/main`. | [Git](git-verification.log) |
| Typecheck, lint, Vitest e build da main | Passaram. Vitest 791/791, 37 arquivos. | [Typecheck](i4-integration-typecheck.log), [Vitest](i4-integration-unit.log), [build](i4-integration-build.log) |
| Integração HTTP I3/I3.1 | Logo, reconciliação, comercial e painel financeiro passaram. | [Logo](integration-main-logo.log), [comercial](integration-main-commercial.log), [financeiro](integration-main-finance-dashboard.log) |
| PostgreSQL de integração | 17 suítes passaram, incluindo concorrência. C2 precisou de nova execução porque requer cadastro de operadores vazio. O ensaio C2 também passou após replay completo. | Logs `postgres-*`, [primeira tentativa C2](postgres-c2-fixture-failure.log), [replay C2](replay-c2-dashboard.log) |
| Typecheck, lint, Vitest e build da I4 | Passaram. Vitest 802/802, 38 arquivos. | [Typecheck](i4-typecheck.log), [lint](i4-lint.log), [Vitest](i4-vitest.log), [build](i4-build.log) |
| PostgreSQL e concorrência I4 | Replay das 32 migrations e 11 suítes/consultas de replay concluídos. | [Migrations](migrations-clean-replay.log), [segurança](replay-i4-security.log), [concorrência do limite](replay-i4-rate-concurrency.log), [catálogo](replay-i4-catalog.log) |
| Integração I4 | Isolamento, CSP no Chrome, CSRF, tratamento de texto, agenda, logo e financeiro. | Logs `i4-http-*` |
| Dependências | 0 alertas de produção, 4 entradas moderadas transitivas no desenvolvimento. | [Final](dependencies-final.json), [produção](dependencies-production.json) |
| Segredos | 33 snapshots Git por padrões e 59 assets da build auditados. Zero candidatos, chave administrativa de QA ausente e zero source maps expostos nessa build. | [Git](git-history-secrets.log), [bundle](browser-bundle-secrets.log) |
| Carga | 10, 25 e 50 sem erro. Em 100, 4 timeouts na rodada final. | [Prova de carga](i4-http-i4-load-local.log) |

Use somente stack descartável para os scripts de teste. As suítes SQL
podem escrever dados sintéticos e exigem `psql -X -v ON_ERROR_STOP=1`.
Execute `c2-dashboard.sql` antes das suítes que deixam dados financeiros
de teste. As suítes HTTP carregam os IDs de Server Actions do build local.
O helper valida o projeto e aceita apenas loopback. Ajuste `B2A2_QA_API_PORT`
e `B2A2_QA_NEXT_PORT` aos valores do stack. Use variáveis Auth de QA
em memória, com build e URL coerentes. As suítes com navegador requerem
`C2_QA_CHROME` e `C2_QA_PLAYWRIGHT`.

Os logs preservam falhas úteis de fixture e da carga. Uma tentativa de
retirar o gerador de UI falhou porque a aplicação importa o CSS distribuído
pelo pacote. O gerador foi mantido. A reinstalação local deixou arquivos
ausentes em dependências existentes, que foram recuperados da instalação
local com entradas de integridade idênticas no lockfile.
