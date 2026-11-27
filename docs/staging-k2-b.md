# K2-B — Homologação protegida no Cloudflare Workers

27/11/2026 · branch `codex/staging-k2` · código implantado `4714cb0`

**GO para avaliação privada pelo proprietário. NO-GO para validar a capacidade do Workers Free sob carga sustentada.** A K2-C depende de autorização explícita e o lançamento comercial permanece em NO-GO.

[Homologação protegida pelo Cloudflare Access](https://lps-agenda-staging.lpsagenda-qa.workers.dev) · [Evidências hospedadas sanitizadas](qa-k2-b/cloudflare-hosted.log).

## Recursos e custo

| Recurso | Estado verificado |
| --- | --- |
| Cloudflare Zero Trust | Organização ativa no plano **Teams Free Base**, por **US$ 0/mês**. Política individual para o proprietário. |
| Cloudflare Workers | Worker `lps-agenda-staging` com um único ingresso `workers.dev`. A conta não tem zona gerenciada e nenhuma zona foi criada. |
| Cloudflare Images | Painel mostrou 0 de 5.000 transformações antes do smoke. O binding `UPLOAD_IMAGES` funcionou no Worker hospedado sem zona própria. |
| Supabase | Projeto Free `lps-agenda-staging`, ref `kffhoimijhsddodqxezs`, região us-east-1, PostgreSQL 17.12, com 36 migrations. Nenhum dado comercial foi importado. |

Nenhuma forma de pagamento foi cadastrada, nenhum plano pago foi contratado e o custo mensal configurado permanece em **US$ 0**. A Vercel, o domínio comercial, o Registro.br e o Supabase de produção foram preservados. A verificação anterior do histórico de produção encontrou as mesmas 29 migrations, até `20261120180000`. O Supabase Free pode pausar por inatividade. [Cloudflare Images](https://developers.cloudflare.com/images/pricing/) · [Supabase Free](https://supabase.com/pricing).

## Histórico e smoke do Supabase

1. O projeto novo estava ACTIVE_HEALTHY com ledger vazio, sem tabelas de aplicativo, usuários ou buckets. O executor postgres tinha CREATEROLE, acesso ao Auth, criação em public, INSERT/UPDATE em storage.buckets e suporte de políticas em storage.objects fornecido pelo supautils. PostgreSQL 17.12 oferecia as extensões esperadas.
2. A CLI confirmou por dry-run o alvo lps-agenda-staging e os 36 nomes ordenados. As migrations foram aplicadas com ref explícito e sem enviar Vault ou seeds. A indicação “production” da CLI designa o banco principal **do projeto de staging**. O histórico oficial remoto contém as 36 versões e os nomes correspondentes ao Git, da 20261108090000 à 20261127094922. Nenhum arquivo SQL foi editado.
3. O catálogo mostrou RLS em **22/22 tabelas públicas**, sem SELECT de anon em appointments, seis roles lps sem login e cinco políticas do app em objetos. O bucket **barber-photos** ficou privado, WebP e até 524.288 bytes. **barbershop-logos** tem leitura pública intencional, WebP e até 2.097.152 bytes. Ambos os gates de trial ficaram desativados.
4. O Auth do staging teve cadastro público fechado. Login anônimo já estava desativado. O arquivo [config Auth](../ops/staging-k2/supabase/config.toml) declara apenas esses dois controles. O diff anterior mostrou que somente a flag de cadastro precisava mudar. Callback externo e SMTP permanecem pendentes.
5. O smoke criou duas contas sintéticas confirmadas pela API administrativa, sem e-mail real, e testou login por senha. A Data API permitiu leitura ao owner, isolou usuário sem vínculo, negou leitura anônima de agenda e acesso ao schema privado pela API. WebP de teste foi armazenado e recuperado com hash idêntico pelo owner. Visita anônima e conta externa receberam negativa no bucket privado. As fixtures foram removidas pelas APIs do projeto. A checagem final retornou zero usuários, barbearias e objetos.

[Histórico oficial verificado](qa-k2-b/migrations.log) · [Catálogo e configuração](qa-k2-b/inventory.log) · [Smoke](qa-k2-b/supabase-smoke.log) · [Sonda reproduzível](../tests/integration/k2b-supabase-smoke.mjs).

## Proteção do Worker e deploy

1. O Wrangler autenticado confirmou a conta. O OAuth retornou HTTP 403 e código 1010 para criação da aplicação Access e HTTP 403 para leitura individual de aplicação e política. O escopo afetado é **Access Apps and Policies** nas operações de edição e leitura. A Cloudflare não especificou no erro se a causa exata era o escopo do OAuth ou a autorização da conta para a operação. A configuração foi concluída no painel autenticado, sem criar API Token.
2. O primeiro deploy utilizou um Worker que só devolvia HTTP 403, com `workers_dev=false`, `preview_urls=false` e sem rotas. No painel, o Access foi associado ao Worker com escopo **Todo o tráfego**, uma única regra **Allow** por e-mail exato e zero políticas Bypass. A identidade foi omitida deste registro.
3. O ingresso `workers.dev` foi habilitado para o Worker inicial. Acesso anônimo a página, login, API e caminho estático foi interceptado pelo Access antes da publicação do aplicativo.
4. O build OpenNext do commit `4714cb0` foi publicado como versão `06626ad5-b1a6-422e-bfa9-3b806cf1361b` e recebe 100% do tráfego. Uma configuração temporária habilitou somente o ingresso aprovado. O [template Wrangler](../wrangler.k2-staging.jsonc) no Git mantém a entrada desligada por padrão, previews desligados, nenhuma rota customizada e CSP estrita configurada.
5. A URL da API e as chaves usadas no build e no runtime pertencem ao ref de staging. O ref e o papel das chaves foram verificados antes do envio. O material temporário com valores sensíveis do deploy foi removido. A varredura dos 1.722 arquivos gerados confirmou a origem de staging e a ausência do ref de produção e das chaves de servidor verificadas. O upload hospedado confirmou a escrita no Storage de staging.

O build e as verificações locais anteriores tiveram typecheck, lint, 830 testes Vitest e empacotamento Wrangler aprovados. O bundle implantado teve 13.403,68 KiB sem compressão. [Build e varredura](qa-k2-b/workers-dev-reservation.log) · [Perfil local](qa-k2-b/worker-local.log) · [Vitest](qa-k2-b/vitest.log) · [Lint](qa-k2-b/lint.log) · [Typecheck](qa-k2-b/typecheck.log).

## Testes hospedados

| Cenário | Resultado |
| --- | --- |
| Proprietário no Access | Sessão de navegador autenticada abriu a landing page e o login do aplicativo. O Policy Tester também concedeu acesso ao e-mail aprovado. |
| Visitante anônimo | Após o deploy real, `/`, `/login`, `/api/barbershop/logo` e `/brand/lps.webp` devolveram HTTP 302 ao Access, sem entregar o conteúdo. |
| Outro e-mail | O Policy Tester negou um e-mail sintético fora da allowlist. A negativa foi validada por simulação. O login pelo provedor com uma segunda identidade real segue sem ensaio. |
| Ingressos alternativos | A API mostrou `previews_enabled=false` e nenhuma rota de domínio customizado. A URL de preview da versão implantada retornou HTTP 404. |
| Supabase Auth e área interna | Conta sintética de owner entrou no app e abriu dashboard, Agenda diária e Configurações. |
| QR Code e PDF | QR renderizado. Download de 84.168 bytes verificado com assinatura `%PDF-`. |
| Binding de imagens | Um PNG sintético transparente de 320 × 240 foi enviado pelo fluxo de logo. A interface confirmou atualização. O Storage de staging recebeu um único WebP decodificável de 320 × 240 e 292 bytes. O PNG original não foi persistido. |
| Limpeza | Objeto, barbearia e usuário sintéticos removidos. Consulta final de staging confirmou zero usuários de Auth, zero barbearias e zero objetos nos dois buckets de mídia. |

O smoke do binding cobre um upload válido de logo. A homologação de fotos privadas, dos casos inválidos e dos limites de upload segue pendente. O Access protege os caminhos do Worker. O endpoint direto do bucket de logos no Supabase mantém a política pública descrita acima. O bucket de fotos continua privado.

## CPU, memória e latência

A consulta `workersInvocationsAdaptive` considerou 50 requisições observadas pelo Worker a partir de 27/11/2026 às 20h11min30s no horário de Brasília. O painel confirmou os percentis de CPU e registrou a memória V8 no intervalo observado. A amostra combina fluxos do smoke e não separa rotas nem invocações frias.

| Métrica | p50 | p90 | p99 |
| --- | ---: | ---: | ---: |
| CPU por invocação | 15,636 ms | 229,887 ms | 496,844 ms |
| Duração total por invocação | 171,448 ms | — | 2.318,879 ms |
| Memória V8 por isolate | 23.650.304 bytes | 29.718.688 bytes | 31.288.844 bytes |

A consulta retornou zero erros. O painel indicou zero ocorrências de limite de CPU ou de memória no período observado. O Workers Free publica 10 ms de CPU por requisição HTTP, 100 mil requisições por dia, 50 subrequests por requisição e 128 MB por isolate. A Cloudflare admite flexibilidade para excessos ocasionais. Como até a mediana superou 10 ms e a amostra é pequena, o resultado não comprova operação estável sob carga sustentada. A duração total inclui espera externa e não equivale à CPU nem à latência ponta a ponta do navegador. [Limites do Workers](https://developers.cloudflare.com/workers/platform/limits/).

## Operação e pendências

Para suspender a homologação, desabilitar primeiro o ingresso `workers.dev` do Worker, manter previews desligados e conferir o endereço sem sessão. A versão de negação integral `23399ebe-c715-481e-a29a-0f508f9ef5ae` também pode ser restaurada enquanto disponível no histórico de versões. Manter Access vinculado e repetir o smoke anônimo antes de habilitar qualquer versão futura.

Para validar capacidade no Free, coletar séries por rota, separar inicializações frias e requisições aquecidas e medir a frequência de invocações acima de 10 ms com tráfego sintético representativo. A homologação completa de CSP, MFA financeiro e RPCs, SMTP, WAF/rate limiting/Turnstile, trial e Pix, restauração e acessibilidade também permanece pendente. Nenhuma dessas mudanças foi iniciada nesta etapa. [Checklist](pre-launch-checklist.md) · [Plano operacional](cloudflare-staging-k2.md) · [Acessibilidade](accessibility-validation.md).
