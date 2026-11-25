# Evidências da J1

Todos os ensaios de aplicação usaram o stack Supabase descartável com as
32 migrations. O navegador e o cliente de teste acessaram apenas loopback.

| Verificação | Log |
| --- | --- |
| Build OpenNext em Linux | [Build](workers-build.log) |
| Falha inicial ao carregar Sharp no workerd | [Diagnóstico nativo](sharp-workerd.log) |
| Ensaio final em Report-Only | [HTTP Report-Only](workers-report-only.log) |
| Ensaio final em modo estrito | [HTTP estrito](workers-strict.log) |
| Build Next em Node | [Build Node](node-build.log) |
| Controle positivo Node com uploads reais | [Logo](node-logo.log), [foto](node-photo.log) |
| Testes da aplicação | [TypeScript](typecheck.log), [ESLint](lint.log), [Vitest](vitest.log) |
| Dependências | [Produção](npm-audit-production.json), [árvore completa](npm-audit.json) |
| Exposição de segredos no build | [Assets](worker-assets.log) |

O código de saída dos ensaios HTTP do Workers foi 1 em ambos os modos:
os uploads válidos receberam 503 e as asserções exigiam 200 e WebP no
Storage. Os testes conferiram zero objetos novos antes de registrar esse
resultado. Não há falha nos controles positivos em Node.
