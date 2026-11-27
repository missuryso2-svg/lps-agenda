# K1-A — Revisão e integração local do redesign

27/11/2026 · **GO técnico para a integração local** · **NO-GO comercial**

A revisão conferiu os oito commits entre 1ce461f e e013b4a. A main local avançou de 1ce461f para e013b4a exclusivamente por fast-forward. A branch codex/pre-launch-k1 foi criada a partir de e013b4a no worktree permanente de desenvolvimento. A referência de acompanhamento origin/main continuou em 8d1e18b. O worktree de recuperação com arquivos não rastreados foi preservado. [Evidência do Git](qa-k1-a/git-integration.log).

## Commits integrados

| Commit | Entrega |
| --- | --- |
| 15a2758 | Fundação visual e landing |
| f6937e1 | Autenticação e onboarding |
| bfcd9d9 | Dashboard e agenda |
| 3a0691f | Clientes, serviços, equipe e horários |
| a73ab28 | Concessão automática do trial Premium |
| 41a0918 | Financeiro da barbearia, configurações, plano e QR Code |
| 86c889e | Agendamento público e confirmação da reserva |
| e013b4a | Administração financeira |

A conectividade dos objetos, a ancestralidade, a ausência de commits de merge no intervalo e o diff foram conferidos. O redesign, suas capturas, os relatórios e os logs acompanharam os oito commits originais. O commit da K1-A registra este parecer, o checklist e as novas evidências, com alterações exclusivamente em documentação. [Evidência do Git](qa-k1-a/git-integration.log).

## Revisão técnica

| Área | Resultado e limite |
| --- | --- |
| Design e funcionalidades | A árvore integrada é a aprovada em e013b4a. A revisão cruzou os relatórios da fundação, autenticação, dashboard, gestão, QR, agendamento público e administração. A criação da reserva e a revalidação da disponibilidade continuam nos caminhos existentes. A projeção pública filtra URLs assinadas e mantém iniciais para fotos privadas. [Fundação](design-system-j2.md) · [Auth](redesign-j2-b.md) · [Painel](redesign-j2-c.md) · [Agendamento](redesign-j2-d.md) · [Administração](redesign-j2-e.md) |
| Migration 33 e trial | O intervalo acrescenta somente 20261126095208. A migration tem gate próprio inicialmente fechado, exige e-mail confirmado e identidade não anônima quando habilitada e arbitra a concessão por identidade Auth no PostgreSQL. A tabela de concessões preserva a unicidade após exclusão do tenant. O prazo, o catálogo ativo e o plano Premium são decididos no banco. Validações de expiração, isolamento, concorrência, downgrade, replay e recriação passaram novamente em QA. O cenário de muitas identidades distintas permanece no checkpoint de abuso. [Migration](../supabase/migrations/20261126095208_automatic_premium_trial.sql) · [Histórico do trial](trial-premium-automatico.md) · [Teste K1-A](qa-k1-a/postgres-trial.log) |
| Contrato, mensalidade e Pix | A alteração das actions financeiras carrega o aceite de impacto para conversão antecipada. O RPC valida o ator e preserva o formato canônico do diário para replay. O acordo é pendente e a conferência continua em seu próprio fluxo. Os testes anteriores de manager, operator, usuário comum, concorrência, Pix e histórico sustentam o parecer local. As migrations 30, 31 e 32 permaneceram idênticas. [I3.1](correcao-i3-1.md) · [Financeiro em Node](qa-j2-e/integration.log) · [Limites e idempotência](qa-j2-e/postgres.log) |
| Next.js e OpenNext | Lockfile, adapter, configurações de runtime e processadores de imagem permanecem idênticos a 1ce461f. Foram conferidos os builds J2-E e repetidas sondas HTTP com CSP estrita e nonce no HTML em Node e workerd. Sharp segue no runtime Node. O binding de imagens do Workers ainda depende de validação real na infraestrutura hospedada. [Build Next](qa-j2-e/next-build.log) · [Build OpenNext](qa-j2-e/opennext-build.log) · [Node K1-A](qa-k1-a/runtime.log) · [Workers K1-A](qa-k1-a/workerd.log) · [Imagens](cloudflare-images-j1-1.md) |
| Segredos | Varredura por padrões em 774 blobs textuais únicos das nove árvores entre a base e o candidato. Os três apontamentos iniciais foram artefatos da expressão regular atravessando quebras de linha, sem correspondência após restringir o padrão à mesma linha. O Git rastreia somente o modelo de ambiente. A verificação adicional em 62 assets estáticos públicos do build Next.js buscou, em memória, a chave administrativa da QA e não encontrou ocorrência. A varredura cobre o intervalo e os padrões documentados. A pendência de contenção de credenciais de demonstração de ambientes legados veio da I1 e segue registrada. [Varredura](qa-k1-a/secrets.log) · [Bundle](qa-k1-a/runtime.log) · [I1](launch-unblock-i1.md) |

A migration 33 usa recursos do PostgreSQL 16 ou superior. A prova local usa PostgreSQL 17.11. A homologação deverá confirmar ownership, acesso do executor às operações de papéis e funções, leitura autorizada do Auth pelo definer e cache de esquema do PostgREST, com as duas chaves de trial desativadas. [Notas do PostgreSQL 16](https://www.postgresql.org/docs/16/release-16.html) · [GRANT](https://www.postgresql.org/docs/16/sql-grant.html).

## Testes e evidência

| Verificação | Execução |
| --- | --- |
| Typecheck, lint e Vitest em e013b4a | Reexecutados na K1-A. 826 testes Vitest em 41 arquivos, com saída 0. [Typecheck](qa-k1-a/typecheck.log) · [Lint](qa-k1-a/lint.log) · [Vitest](qa-k1-a/vitest.log) |
| PostgreSQL descartável | Confirmado o conjunto exato das 33 versões no catálogo. Reexecutadas as duas suítes específicas do trial com as mesmas entradas SQL de e013b4a. Os dois gates voltaram ao estado desativado. O replay integral é evidência anterior do QA. [Ensaios K1-A](qa-k1-a/postgres-trial.log) · [Replay anterior](qa-trial-premium/migrations.log) |
| Runtime e CSP | Reexecutadas sondas locais dos builds do commit aprovado. Node retornou landing, login e cadastro com o nonce da política estrita e redirecionou acesso anônimo à área financeira. Workerd retornou landing e login com a mesma relação entre política e HTML. Os ensaios de fluxo completo e os builds permanecem nos artefatos J2-D e J2-E. [Node](qa-k1-a/runtime.log) · [Workers](qa-k1-a/workerd.log) · [Reserva no Workers](qa-j2-d/workers.log) · [Administração no Workers](qa-j2-e/workers.log) |
| Git | Verificação de objetos, diff, sequência linear, estado limpo e refs antes e depois da integração. [Integração](qa-k1-a/git-integration.log) · [Diff dos artefatos](qa-k1-a/diff-check.log) |

A execução ocorreu localmente com dados sintéticos e sem alterar código de produto, configuração ou migrations. Este checkpoint reutilizou os builds e as integrações anteriores de Node e Workers. A auditoria atualizada de dependências, o replay amplo da K1 e a rodada controlada de carga pertencem aos checkpoints próprios.

## Gate da K1-B

**GO para a base local da K1.** A autorização da K1-A cobre revisão, fast-forward e documentação. A vulnerabilidade I4-07, de severidade média, permanece um bloqueio de publicação. A evidência anterior identifica transições de atendimentos no próprio tenant fora das regras da interface por escrita direta. Preço histórico e autoria têm a proteção própria da migration 32. A próxima etapa começa somente após decisão sobre a K1-A. Seu escopo é mapear o ciclo de estados e os caminhos de reagendamento e aplicar a correção local autorizada com testes de papéis, concorrência e regressão. Alterações de regras comerciais exigem aprovação própria. [Auditoria I4](security-audit-i4.md) · [Checklist classificado](pre-launch-checklist.md).
