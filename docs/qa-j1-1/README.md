# Evidências da J1.1

Todas as operações de aplicação usaram exclusivamente o QA descartável.
Os registros abaixo foram sanitizados antes do commit.

| Verificação | Evidência |
| --- | --- |
| Node com Sharp e Storage real de QA | [HTTP Node](images-node.log), [build Next](node-build.log) |
| workerd com Images Binding offline e Storage real de QA | [HTTP Workers](images-workers.log), [build OpenNext](workers-build.log), [binding local](binding.log) |
| Binding indisponível, franquia simulada, Storage e validação | [Vitest](vitest.log) |
| TypeScript, tipos Wrangler e ESLint | [Typecheck](typecheck.log), [tipo Wrangler](types.log), [ESLint](lint.log) |
| CPU e memória de processos, latência e tamanho de bundle | [Processos locais](metrics.log), [bundle](bundle.log), latências nos logs HTTP |
| Verificação da chave administrativa em assets estáticos | [Assets](assets.log) |
| Calibração do probe dos timeouts, uma requisição | [Calibração](timeout-calibration.log) |
