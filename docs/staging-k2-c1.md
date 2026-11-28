# K2-C.1 — Sincronização GitHub e correção de staging

28/11/2026 · `codex/staging-k2` · base `3e159ab`

**GO para versionamento na branch de staging e manutenção da avaliação privada. NO-GO para integrar à main de produção ou executar a K3.** O MFA financeiro e o cookie Secure foram homologados no Workers. A preparação da K3 está no [plano de infraestrutura](production-infrastructure-k3.md). A homologação continua com custo configurado de **US$ 0/mês**.

[Homologação protegida](https://lps-agenda-staging.lpsagenda-qa.workers.dev) · [Evidências da K2-C.1](qa-k2-c1/) · [Checklist](pre-launch-checklist.md).

## Sincronização segura

O GitHub confirmou o repositório público `missuryso2-svg/lps-agenda` e a branch padrão `main`. Após `git fetch --prune`, os 37 commits desde `origin/main` estavam íntegros no `git fsck --strict`. A `main` remota e a local são ancestrais de `3e159ab`. A árvore inicial estava limpa, as evidências estavam rastreadas e o destino de push foi conferido.

O Gitleaks examinou o histórico a enviar e a árvore. A única marcação do intervalo novo era o nome da suíte `operations-f3-concurrency` em um log. As oito marcações restantes da árvore eram fixtures de Vitest em quatro arquivos com blobs idênticos aos já públicos na main. A checagem adicional examinou JWTs, chaves, arquivos de ambiente e dados pessoais nos patches. O único arquivo de ambiente rastreado foi `.env.example`. Os e-mails de metadados de commits eram os mesmos já existentes no remoto, sem novos autores ou committers. Os logs de homologação do produto registram dados sintéticos e valores sanitizados.

`git.deploymentEnabled=false` consta no `vercel.json` do ponto de origem e do candidato. O GitHub não tem workflows versionados e retornou zero execuções de Actions para a branch. O painel do único Worker Cloudflare mostrou a opção de conectar um repositório, sem vínculo Git existente. A Vercel retornou zero deploys para `codex/staging-k2` após o push.

| Referência | OID verificado |
| --- | --- |
| Branch local e remota no envio inicial | `3e159ab32d1a968bbafcda504e3b2d8c305a829d` |
| `main` local preservada | `a160096931c7783f9347eec1be9ebea4e3832d8a` |
| `origin/main` preservada | `8d1e18bdb1c515d2f29cfbd7f29b976a0092b9e0` |

O envio inicial foi um push sem força, sem PR ou merge. A sequência de verificação e documentação foi sincronizada somente na branch de staging. O banco de produção com 29 migrations ainda carece das funções e políticas utilizadas pela aplicação atual, inclusive a garantia AAL2. A existência de fast-forward no Git não resolve essa incompatibilidade. [Configuração Git Vercel](https://vercel.com/docs/project-configuration/git-configuration).

## Migration e deploy corretivo

1. Dry-run com ref explícito listou somente `20261128082411_financial_mfa_required.sql`, sem seed, roles ou Vault. A CLI aplicou essa versão ao **Supabase de staging** `kffhoimijhsddodqxezs`. O rótulo “production” que a CLI exibe indica a branch principal desse projeto isolado. O ledger do projeto retornou 37 migrations e a versão aplicada coincide com o Git.
2. O candidato foi construído isoladamente em Linux a partir de `3e159ab`. A inspeção de 1.727 arquivos confirmou o hostname e o ref de staging e excluiu o ref do Supabase de produção e as chaves de servidor. Os dois secrets de runtime foram validados por ref e papel e enviados via arquivo temporário com permissão restrita, removido após a operação. A configuração de CSP estrita, Images Binding e gates comerciais foi mantida.
3. O Worker publicou **`fde7ea0a-03b2-410e-bf44-34fcf3df5cdf`** a 100% no hostname existente, com a política Access preservada e previews desativados. Depois do deploy, anônimo recebeu 302 para Access em landing, login, arquivo estático e endpoint. Sessão autorizada acessou o app. A versão anterior era `06626ad5-b1a6-422e-bfa9-3b806cf1361b`.
4. Em rollback do binário, preservar Access e migration 37. A versão antiga continua protegida no banco, mas pode perder a tela de desafio de MFA. Nesse caso, suspender finance no staging ou reimplantar versão compatível. Restringir mudanças ao Worker de staging.

## Homologação da autorização e de sessões

| Caso | Prova executada |
| --- | --- |
| Manager/operator com AAL1 | Worker encaminhou à tela de segundo fator. A Data API recusou `finance_capability` e `finance_confirm_pix` com `LP037`. |
| Manager/operator com AAL2 | As duas contas cadastraram e verificaram TOTP real no GoTrue. A Data API reconheceu cada nível e as páginas financeiras privadas abriram. Somente manager listou, concedeu e revogou papel. A trilha persistiu ator, motivo e revogação para a fixture. |
| Conta comum | Recusada pela Data API mesmo após TOTP. A revogação de papel impediu novo acesso, apesar da mesma sessão AAL2. |
| Renovação, expiração e revogação | A renovação do Supabase SDK manteve a autorização do operator. Após logout global, refresh token e JWT anterior foram recusados para operações financeiras. Expiração de sessão simulada por dado da fixture bloqueou acesso direto. O ensaio não reduziu a validade global de JWT no projeto. |
| Cookies no Worker | Login HTTPS emitiu cookie Auth com `Secure`, `SameSite=Lax` e acesso pelo SDK. `HttpOnly` permanece ausente no cookie de sessão lido pelo SDK do navegador. O logout apagou o cookie com `Secure` e a sessão anterior deixou de abrir o dashboard. |
| CSP, CSRF e proxy | Login, dashboard, agenda e QR com política aplicada e nonce no HTML. Origem externa recebeu 403 em mutação mesmo com os headers encaminhados para a origem canônica. Headers Forwarded e X-Forwarded com host externo não alteraram o redirecionamento HTTPS para o hostname de QA. |

A recuperação administrativa depende de procedimento supervisionado. Revogar papel e sessões, verificar identidade fora do login, retirar o fator perdido só após essa verificação e exigir novo TOTP validado antes de devolver o acesso. Usar gestor substituto ou procedimento de emergência formal se for a última conta de gestão. O ensaio hospedado revogou o papel sintético, removeu o fator perdido, verificou o fator novo e só restabeleceu o papel após nova concessão pelo manager. A cerimônia de recuperação com gestor real permanece pendente.

## Desempenho e regressões

| QR no Workers | CPU por GET |
| --- | --- |
| `06626ad5`, amostra anterior K2-C | 180, 181 e 185 ms |
| `fde7ea0a`, três GETs autorizados em sequência | 125, 108 e 121 ms |

A mediana da pequena amostra caiu de 181 para 121 ms, cerca de **33%**. O PNG real saiu em escala de cinza. O teste local já demonstrou equivalência de pixels e decodificação. A amostra não separa todos os estados frios do isolate e permanece acima do limite nominal do Free. Em outra medição agregada pós-deploy, foram 20 invocações e zero erros da plataforma, com CPU p50 de 47,86 ms, p99 de 294,01 ms e memória p99 de 46,77 MB. As composições e janelas dessa amostra e da K2-C diferem. Sem teste de carga significativo. O plano progressivo e a decisão de preço estão no [plano K3](production-infrastructure-k3.md).

**838 testes Vitest**, lint, typecheck, builds isolados Next.js e OpenNext e empacotamento Wrangler. Foram executadas regressões PostgreSQL e sondas do Worker, MFA, Auth, Data API, CSP, QR e Images Binding pós-deploy. O inventário final confirmou a remoção das fixtures e os gates desativados. [Evidências](qa-k2-c1/).

## SMTP e jornada de trial

**Resend Free** é a recomendação inicial para envio transacional. A franquia publicada é de 3.000 mensagens/mês e 100/dia. Usar subdomínio dedicado e aprovado, credencial SMTP dedicada, limite no Supabase e alertas de rejeição. Brevo Free é alternativa para picos até 300/dia. Amazon SES é opção para escala e operação com AWS, com sandbox e custos por mensagem. A comparação e os requisitos de autenticação do domínio estão no [plano K3](production-infrastructure-k3.md#smtp-transacional).

O provedor, remetente, DNS e destinatários de teste ainda exigem aprovação. O SMTP padrão do Supabase restringe destinatários à equipe e a duas mensagens por hora por projeto. A validação de entrega real e da jornada completa de cadastro, confirmação, primeira barbearia, modal, dias restantes e conversão pelo navegador fica condicionada a um meio de envio autorizado. Os testes de trial e Pix nesta etapa continuam sintéticos e transacionais. [SMTP no Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
