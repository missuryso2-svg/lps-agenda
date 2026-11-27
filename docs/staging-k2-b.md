# K2-B — Supabase de homologação e ingresso protegido

27/11/2026 · base 22ce48f · branch codex/staging-k2

**Execução parcial. NO-GO para iniciar a K2-C.** O Supabase isolado foi provisionado gratuitamente e validado. A sessão do Wrangler foi autenticada e o proprietário confirmou o único e-mail autorizado e a estratégia workers.dev. O deploy depende de acesso ao Zero Trust e da confirmação das franquias da conta. Ainda não há endereço externo de avaliação nem commit implantado. O lançamento comercial permanece em NO-GO.

## Recursos, contas e custo

| Item | Estado |
| --- | --- |
| Organização Supabase | lps-agenda, plano Free. A conta retornou um projeto ativo antes do provisionamento e cotação de **US$ 0/mês** para o segundo. Depois, os dois projetos apareceram ativos. |
| Projeto de staging | lps-agenda-staging, ref **kffhoimijhsddodqxezs**, us-east-1, PostgreSQL **17.12**. Mesma região e versão principal da produção para comparação. Auth e chaves de API são do projeto novo. Nenhum dado comercial foi importado. |
| Supabase de produção | lps-agenda, ref nphxqqbiyudoxntfmiur. A checagem final do histórico retornou as mesmas 29 versões, até 20261120180000. Todas as escritas desta etapa tiveram o ref de staging como destino explícito. |
| Cloudflare | Wrangler 4.168.0 autenticado. A conta não tem zonas, Workers nem assinaturas ativas retornadas pelo inventário de leitura. O subdomínio gratuito lpsagenda-qa.workers.dev foi reservado e a lista de Workers continuou vazia. Access e Images retornaram HTTP 403 com o OAuth atual. A disponibilidade efetiva das franquias e de Zero Trust precisa de confirmação. |
| Custo efetivo | US$ 0/mês cotado para o novo projeto Free. Sem plano pago, forma de pagamento, mecanismo de excedente ou addon contratado. |

A política Free do Supabase oferece até dois projetos ativos nos limites de Owner/Admin. Usar exportações lógicas e uma cópia separada dos objetos do Storage. O projeto Free pode pausar por inatividade. A conta Cloudflare ainda precisa confirmar franquias de uso. [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Supabase planos](https://supabase.com/pricing) · [Backups](backup-and-restore.md).

## Histórico e smoke do Supabase

1. O projeto novo estava ACTIVE_HEALTHY com ledger vazio, sem tabelas de aplicativo, usuários ou buckets. O executor postgres tinha CREATEROLE, acesso ao Auth, criação em public, INSERT/UPDATE em storage.buckets e suporte de políticas em storage.objects fornecido pelo supautils. PostgreSQL 17.12 oferecia as extensões esperadas.
2. A CLI confirmou por dry-run o alvo lps-agenda-staging e os 36 nomes ordenados. As migrations foram aplicadas com ref explícito e sem enviar Vault ou seeds. A indicação “production” da CLI designa o banco principal **do projeto de staging**. O histórico oficial remoto contém as 36 versões e os nomes correspondentes ao Git, da 20261108090000 à 20261127094922. Nenhum arquivo SQL foi editado.
3. O catálogo mostrou RLS em **22/22 tabelas públicas**, sem SELECT de anon em appointments, seis roles lps sem login e cinco políticas do app em objetos. O bucket **barber-photos** ficou privado, WebP e até 524.288 bytes. **barbershop-logos** tem leitura pública intencional, WebP e até 2.097.152 bytes. Ambos os gates de trial ficaram desativados.
4. O Auth do staging teve cadastro público fechado. Login anônimo já estava desativado. O arquivo [config Auth](../ops/staging-k2/supabase/config.toml) declara apenas esses dois controles. O diff anterior mostrou que somente a flag de cadastro precisava mudar. Callback externo e SMTP aguardam o hostname autorizado e o plano próprio.
5. O smoke criou duas contas sintéticas confirmadas pela API administrativa, sem e-mail real, e testou login por senha. A Data API permitiu leitura ao owner, isolou usuário sem vínculo, negou leitura anônima de agenda e acesso ao schema privado pela API. WebP de teste foi armazenado e recuperado com hash idêntico pelo owner. Visita anônima e conta externa receberam negativa no bucket privado. As fixtures foram removidas pelas APIs do projeto. A checagem final retornou zero usuários, barbearias e objetos.

[Histórico oficial verificado](qa-k2-b/migrations.log) · [Catálogo e configuração](qa-k2-b/inventory.log) · [Smoke](qa-k2-b/supabase-smoke.log) · [Sonda reproduzível](../tests/integration/k2b-supabase-smoke.mjs).

O smoke usou diretamente Auth, Data API e Storage. O WebP já era válido na origem do teste. Isso não verifica a conversão, persistência ou tratamento de erros pelo Images Binding.

## Worker e proteção antes do primeiro acesso

O [template Wrangler](../wrangler.k2-staging.jsonc) usa o nome **lps-agenda-staging**, OpenNext, CSP estrita e auto-referência apenas para o Worker de staging. A URL Supabase declarada é a do novo projeto. Não contém credenciais. A configuração inicial mantém workers.dev, previews e rotas públicas desligados. A URL canônica final deve ser definida antes do build, pois entra em callbacks, QR e redirecionamentos. A chave de serviço será configurada separadamente como segredo de runtime após a verificação de conta e proteção. A chave pública no build deve vir do mesmo projeto.

1. A sessão Wrangler e a conta foram verificadas. A conta atual não contém uma zona de QA. Para gerir a política por API, usar uma credencial de curta duração limitada à conta, com Access: Apps and Policies Edit, Access: Organizations, Identity Providers, and Groups Read e Images Read. Conferir no painel se o Zero Trust Free e o Images Free estão disponíveis. Guardar a credencial em sessão local segura, sem colocá-la no chat, no Git ou nos logs. O proprietário confirmou uma única identidade. O endereço foi omitido deste relatório.
2. Com a aprovação do proprietário, reservei lpsagenda-qa.workers.dev na conta que não possuía subdomínio nem Workers. O hostname planejado para o app é **lps-agenda-staging.lpsagenda-qa.workers.dev**. O template tem conta e origem canônica explícitas e mantém o ingresso desligado até comprovar Access com a única identidade aprovada.
3. Criar o Worker sem ingresso e aplicar Access All traffic com allowlist. Confirmar policy em leitura, sem regra pública ou bypass. Só então adicionar o hostname e verificar acesso autorizado, anônimo e URLs alternativas. Opções de serviço para smoke exigem política própria de identidade de teste. Admin continua sujeito às permissões da aplicação. Se Access Free não atender, manter ingresso fechado e apresentar custo/alternativa antes de prosseguir.
4. Somente com o ingresso protegido, completar os secrets, o binding Images e o deploy com o commit exato do build local. Testar QR/PDF, cookies, CSP e dashboard em sessão autorizada e negar acesso de fora. Testar um arquivo sintético através da rota de processamento e conferir o WebP persistido. Coletar CPU real por invocação, duração total e memória quando disponível. Evitar carga significativa.

O candidato OpenNext foi reconstruído localmente com a origem workers.dev aprovada e o Supabase de staging. O dry-run do Wrangler empacotou **13.403,68 KiB sem compressão**. A varredura de 1.722 arquivos confirmou a origem e o ref corretos, sem as duas chaves de servidor de staging nem o ref Supabase de produção. O perfil local anterior, com origem de teste, registrou **197,5 ms de CPU ativa** durante a inicialização emulada. [Nova verificação](qa-k2-b/workers-dev-reservation.log). Typecheck, lint e 830 testes Vitest também passaram. [Bundle e perfil](qa-k2-b/worker-local.log) · [Vitest](qa-k2-b/vitest.log) · [Lint](qa-k2-b/lint.log) · [Typecheck](qa-k2-b/typecheck.log).

## Limites e pendências

A documentação Cloudflare publica **64 MiB sem compressão**, inicialização de até **1 s** e **128 MB** por isolate em Free e Paid. Workers Free tem **10 ms de CPU por invocação**, 100 mil requisições/dia, 50 subrequests por invocação. Images Free tem franquia publicada de 5 mil transformações únicas/mês e pode negar novas transformações ao atingir o limite. Nenhuma métrica do runtime hospedado foi coletada. O build local não demonstra que o app cabe no orçamento de CPU ou memória real. [Workers limites](https://developers.cloudflare.com/workers/platform/limits/) · [Images](https://developers.cloudflare.com/images/pricing/) · [Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Antes de iniciar a K2-C, validar o ingresso protegido, testar as duas sessões de navegador e os smokes hospedados do app, medir runtime e verificar o uso do binding real dentro da franquia. A homologação completa de imagens, MFA financeiro e RPCs, SMTP, WAF/rate limiting/Turnstile, Data API, headers, trial e Pix, restauração em outro ambiente, desempenho representativo e roteiro audível seguem pendentes. [Checklist](pre-launch-checklist.md) · [Plano operacional](cloudflare-staging-k2.md) · [Acessibilidade](accessibility-validation.md).
