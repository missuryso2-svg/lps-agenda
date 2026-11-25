# LPS Agenda — checkpoint I4 e preparação Cloudflare J1

25/11/2026 · `main` local em `31094d8` · preparação em `codex/cloudflare-j1`.

**I4: GO técnico para integração local. J1: NO-GO para publicar no Workers.**
O build e as rotas principais funcionaram no Workers local. O Sharp/libvips
continua indisponível nesse runtime e as duas rotas de upload recusam imagens
válidas sem gravá-las. O lançamento comercial depende de aprovação explícita.

## Revisão e preservação da I4

Revisão de `77ff36b..31094d8` reutilizou o catálogo, os testes SQL e as
integrações publicados no repositório. `git fsck --connectivity-only` e
`git diff --check` passaram. Os quatro commits são ancestrais verificáveis de
`31094d8`. A branch de segurança, os relatórios e os 68 arquivos de evidência em
`docs/qa-i4/` estão acessíveis pelo repositório principal. O checkout original
tinha 1.509 caminhos não rastreados e nenhuma alteração rastreada. O worktree
temporário estava limpo. Um novo worktree permanente, em
`C:/Users/missu/source/lps-agenda-j1`, recebeu o fast-forward da `main` e deu
origem à branch J1. Os dois worktrees anteriores foram preservados.

| Área | Verificação e decisão |
| --- | --- |
| Migration 32 | Trigger `SECURITY INVOKER`, `search_path` vazio e sem EXECUTE para papéis da Data API. Na inserção por `authenticated`, deriva o preço do serviço ativo do próprio tenant e o autor de `auth.uid()`. Na atualização, preserva preço, autor, serviço e tenant. Nenhum backfill recalcula valores históricos. O replay aprovou owner e staff, preço/autor forjados, histórico após mudança de catálogo e escrita de serviço auditada. Migrations 30 e 31 conferidas sem diferenças. |
| Caminhos de escrita | INSERT, UPDATE e eventual upsert disparam o trigger em suas respectivas operações. A RPC de atendimento presencial é invocadora. A RPC privilegiada de conclusão revalida vínculo ativo e tenant, bloqueia o registro e só atualiza status. O fluxo público escreve com `service_role` após resolver preço e equipe no servidor. O bypass depende do papel PostgreSQL efetivo. O owner ainda pode excluir registros por privilégio legado. Isso pode remover histórico operacional e desfazer o vínculo de pagamento ao atendimento, sem alterar seu valor. Status, identidade da linha e exclusão precisam de política própria de retenção. |
| Transições diretas | **Vulnerabilidade de integridade confirmada, média.** A fixture SQL demonstra que staff consegue inserir atendimento já concluído no próprio tenant. As permissões também admitem transições diretas fora da Server Action. O achado permite adulteração operacional no tenant. A revisão não identificou alteração de Pix, tomada de permissões ou escrita em outro tenant por esse caminho. Proposta posterior com aprovação: estados iniciais e transições no banco, autoria auditável e revisão de exclusão. Cobrir cancelamento público, no-show, conclusão e concorrência. |
| Fotos privadas órfãs | **Risco residual de retenção e melhoria operacional.** Sobras podem ocorrer entre upload, CAS e remoção. A política do bucket exige referência atual em `barbers.avatar_url` e vínculo ativo, portanto a evidência sustenta acúmulo/retenção, sem exposição cruzada confirmada. Propor fila com conferência dupla de referência, reprocessamento e trilha de exclusão. |
| Login, CSP, CSRF e isolamento | `safeNextPath` corta destinos externos e caracteres de controle. O Proxy gera nonce novo, substitui cabeçalhos recebidos e preserva cookies. A I4 tem baseline de bloqueio de frames e objetos, política completa em Report-Only e ativação estrita testada. As rotas de imagem checam origem, papel, tenant e versão. O limitador atômico só roda após autorização. Foram revistos os logs de teste HTTP e as políticas Supabase, inclusive negações entre tenants e por papel. |
| Dependências e segredos | Quatro entradas moderadas de dev correspondem a um advisory de DoS no `minimatch`, propagado por `@ts-morph/common`, `ts-morph` e `shadcn`. O gerador participa do desenvolvimento e fornece CSS ao build. A auditoria de produção registrou zero alertas, inclusive após adicionar as ferramentas da J1. A busca por padrões no snapshot I4 não retornou candidatos. O histórico I4 e 59 assets da build já tinham evidência de varredura, incluindo ausência da chave administrativa de QA e de source maps na build inspecionada. |

A revisão não encontrou vulnerabilidade alta ou crítica confirmada que
bloqueasse o fast-forward. Referências de evidência: [auditoria I4](security-audit-i4.md),
[log SQL](qa-i4/replay-i4-security.log), [HTTP I4](qa-i4/i4-http-i4-security-http.log)
e [advisory minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

### Os quatro timeouts

A rajada de 100 requisições registrou 96 respostas e 4 rejeições em
20.008 ms. O cliente usa `AbortSignal.timeout(20_000)` e espera também pelo
corpo, o que explica o prazo em que o estágio terminou. A agregação não
registrou erro individual, rota, início dos headers ou fase da espera, por isso
o tempo é compatível com quatro abortos no prazo e não comprova a causa
interna. As respostas que terminaram tiveram p95 de 3.009 ms. Outra rodada
chegou a 100/100 com p95 de 2.645 ms. A amostra posterior mostrou 17 backends
e zero espera de lock, sem medir o pico. Login, agendamento público e agenda
autenticada estavam misturados. CPU, pool, Auth, conexões HTTP e agendamento
local continuam hipóteses, sem evidência para atribuir causalidade a uma delas.

A próxima medição deve separar rotas e sessões, registrar fase e código dos
erros, acompanhar CPU/memória do servidor, tempo de Auth/REST e
`pg_stat_activity` durante a rajada. Conservar os 20 s e repetir estágios com
um critério de parada documentado. [Medição I4](load-test-results-i4.md).

## Adaptador e configuração local

**OpenNext 1.20.19 + Wrangler 4.168.0** foi escolhido para a prova. O range
do adaptador inclui o Next 16.4.5 atual e o build manteve React 19.3.0.
O Proxy Node é experimental no OpenNext. Sua execução foi comprovada
localmente. O build nativo Windows encontrou `EPERM` ao criar um link
simbólico para Sharp. A adaptação passou em Linux com Node 24.22.3 e
`workerd` 1.20261123.1. O Next continua compilável pelo caminho normal da
Vercel. [Compatibilidade do OpenNext](https://opennext.js.org/cloudflare).

**vinext 1.4.6** é a recomendação atual da Cloudflare para projetos novos e
uma alternativa a reavaliar. Reimplementa o Next na camada Vite. A versão
avaliada exige React, React DOM e React Server DOM compatíveis com 19.3.1,
além de Vite 8. Migrar para ela agora acrescentaria troca do runtime React/RSC
e exigiria nova prova de Proxy, Server Actions e CSP. Ela também exige
substituir módulos nativos como Sharp. A avaliação de vinext foi documental
e de metadados de pacote. [Guia de migração vinext](https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/nextjs/).

O script `workers:build` chama OpenNext. `workers:preview` roda Wrangler
com `--local` em `127.0.0.1:59331`. `wrangler.j1.jsonc` tem
`workers_dev=false` e `preview_urls=false`, assets estáticos, compatibilidade
Node e sem agenda de execução. O entrypoint `worker.j1.mjs` usa o adaptador
gerado e finaliza CSP depois que OpenNext aplica os headers do `next.config`.
O Proxy continua gerando e propagando o nonce. A promoção antes da resposta
final era sobrescrita pela política básica no OpenNext. Os dois modos estão
cobertos no ensaio HTTP. [Entrypoint próprio do OpenNext](https://opennext.js.org/cloudflare/howtos/custom-worker).

O Supabase continua acessado pelo SDK com HTTPS e RPCs na arquitetura
hospedada. O QA usou somente loopback. Sem conexão PostgreSQL direta no
runtime, não há justificativa para PgBouncer, Prisma Accelerate ou Hyperdrive.

## Resultados de compatibilidade

| Componente | Evidência local |
| --- | --- |
| App Router, Server Actions e Proxy | Página de login, redirect de visitante, dashboard de dois tenants e escrita pela Server Action executados no Workers. Server Action de origem distinta foi rejeitada. |
| Supabase Auth e cookies | Login real no Auth descartável, propagação de `Set-Cookie` pelo adaptador e acesso posterior ao dashboard. O modo estrito preservou a sessão. |
| Storage e cache privado | Foto WebP pré-carregada no Storage privado lida pelo owner. Outro tenant e visitante receberam 404. Dashboard e foto verificados com política privada e sem armazenamento compartilhado. |
| CSP | Report-Only emitido junto ao baseline. Modo estrito enviou nonce exclusivo por resposta, presente nos scripts. O Chrome bloqueou um script inline sem nonce, mantendo a hidratação e o download de PDF. |
| QR Code e PDF | QR gerado no servidor Workers e decodificado para a URL esperada. PDF A4 de uma página gerado via `pdf-lib` e Canvas no navegador servido pelo Workers. |
| Fotos e logos | Sharp 0.35.5 falhou com módulo nativo ausente no workerd. O carregamento se tornou tardio, após autorização, limite do corpo e assinatura raster. Origem não autorizada e staff foram negados. SVG mascarado e corpo excessivo foram recusados. PNG truncado nunca foi gravado. PNG válido em ambas as rotas retornou 503 e zero objetos criados. O backend Node conserva o mesmo decoder, limites de pixels, rejeição de animação e WebP. |
| Variáveis e secrets | Valores `NEXT_PUBLIC_*` pertencem ao build. A chave administrativa foi fornecida por `.dev.vars` ignorado e lida apenas no servidor. Onboarding automático e anúncios estavam desligados. |
| CPU e memória | Execuções funcionais locais passaram, exceto uploads válidos. O handler final pesou 8,85 MB em disco e 2,39 MB com gzip. A amostra após o ensaio registrou 1,31% de CPU e 1,097 GiB para todo o contêiner de desenvolvimento. São medidas do artefato e do contêiner, sem equivalência com consumo por invocação, memória de um isolate ou cold start no edge. |

O build Next local e os testes Node de logo e foto passaram, incluindo upload
válido, WebP, substituição, exclusão, isolamento e CAS. Typecheck, lint,
802 testes Vitest e `git diff --check` foram verificados. As duas rodadas HTTP
no Workers terminaram com código 1 pelos dois uploads válidos que retornaram
503. As demais verificações estão separadas nos logs.
[Evidências sanitizadas](qa-j1/README.md).

Próxima prova de imagens deve preservar o pré-filtro, limites por bytes e
pixels, recusa de animação e conteúdo truncado, reencodificação sem EXIF,
arquivo de saída validado, rate limiting, versionamento/CAS e isolamento
do Storage. Avaliar decodificação em serviço Node autenticado com o Sharp
existente ou um backend de transformação compatível com Workers.
O Images binding offline é de fidelidade reduzida. Antes de adotá-lo,
demonstrar paridade de validação de páginas, dimensões, formato e animação,
além de limites e custo. [Images binding e desenvolvimento local](https://developers.cloudflare.com/images/optimization/binding/).

### Reprodução local

1. Preparar um Supabase descartável com as 32 migrations, API em
   `http://127.0.0.1:59321` e projeto de QA `b2a2-app-<número>`.
   Disponibilizar essa API no loopback do host Linux que roda o Worker.
2. Em Linux com Node 24 e certificados CA, executar `npm ci`.
   Fornecer `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   e `NEXT_PUBLIC_APP_URL=https://agenda.example.org` no ambiente de build.
   Fornecer as mesmas variáveis, `SUPABASE_SERVICE_ROLE_KEY` descartável e
   `CSP_ENFORCE=false` em `.dev.vars`, arquivo local ignorado. Usar somente
   credenciais de QA. O endereço HTTPS reservado é um dado de teste do QR.
3. Executar `npm run workers:build` e `npm run workers:preview` na mesma
   árvore de build. Manter o manifesto de Server Actions em `.next`
   alinhado com o build que o Workers executa.
4. Executar `node tests/integration/j1-workers.mjs` com as variáveis de QA,
   `B2A2_QA_API_PORT=59321`, `B2A2_QA_NEXT_PORT=59331`,
   `B2A2_QA_PROJECT` e, quando aplicável em Windows, `B2A2_QA_WSL_DISTRO`.
   Configurar Chrome e `C2_QA_PLAYWRIGHT` para uma instalação local de
   `playwright-core@1.56.1`. Em Linux, o helper usa Docker diretamente.
   Repetir com `CSP_ENFORCE=true` no Workers e
   `J1_EXPECT_STRICT_CSP=true` no cliente de teste. As duas asserções de
   upload devem continuar vermelhas até o decoder ser compatível.

## Segurança para homologação

1. Definir o hostname canônico do ambiente e `NEXT_PUBLIC_APP_URL`.
   Confiar nos headers de origem e IP apenas depois de garantir o ponto de
   ingresso. Testar `Host`, `Origin`, `X-Forwarded-Host`,
   `X-Forwarded-For` e `CF-Connecting-IP` adulterados. Revisar as ações
   de Auth, os callbacks e o CSRF. O limite de imagens no banco é por tenant,
   independente da IP de cliente.
2. Proteger hostname de homologação e caminhos administrativos com
   Cloudflare Access e identidade com MFA. Verificar audiência e emissor
   do token no limite aplicável. Manter autorização de tenant, operador e
   RLS na aplicação. Negar hostnames alternativos, `workers.dev`,
   previews e acesso direto ao fallback. Validar os URLs efetivos, inclusive
   os gerados pela Vercel. [Access no Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
3. Aplicar WAF e orçamento de abuso por rota e IP verificada. Proteger
   login e cadastro contra brute force com limite por dimensão apropriada,
   sinais de abuso e revisão de limites nativos do Supabase Auth. Avaliar
   Turnstile para cadastro, recuperação e reserva sob abuso, com verificação
   no servidor, token de uso único, comparação de hostname/ação e falha segura.
   Evitar challenge em endpoints de máquina. Separar chave por tenant no
   limitador de reservas antes do lançamento.
4. Validar CSP estrita em fluxos completos e ausência de cache compartilhado
   em dashboard, admin, cookies e APIs privadas. Permitir cache público
   apenas para estáticos e logos com chaves imutáveis. Confirmar cabeçalhos
   também em redirects e erros. Manter logs sem cookies ou tokens.
5. Medir latência por rota, CPU por invocação, pico de memória, subrequests,
   cold start, tamanho final e erro 1102 no ambiente aprovado. Encerrar testes
   ao exceder o orçamento antes de aumentar limites.

## Planos e custos de referência

Valores públicos em USD consultados em 25/11/2026. Plano da zona, Workers,
Access e eventual Images têm cobranças e limites distintos.

| Recurso | Gratuito | Pago relevante |
| --- | --- | --- |
| Workers | 100.000 requisições/dia, 10 ms CPU por invocação, 50 subrequests, 128 MB. | Mínimo US$ 5/mês, 10 milhões de requisições e 30 milhões de CPU-ms incluídos. Excedentes US$ 0,30/milhão de requisições e US$ 0,02/milhão de CPU-ms. CPU configurável até 5 min, padrão 30 s, 10.000 subrequests e 128 MB. |
| WAF e rate limit da zona | Free Managed Ruleset, regras customizadas e uma regra de rate limiting por IP com campos limitados. | Pro US$ 20/mês anual ou US$ 25 mensal, duas regras. Business US$ 200/mês anual ou US$ 250 mensal, cinco regras e mais campos. Advanced Rate Limiting é add-on Enterprise. |
| Access | Zero Trust Free até 50 usuários, adequado para avaliar grupo privado pequeno. | Pay-as-you-go US$ 7 por usuário/mês. Enterprise mediante contrato. |
| Turnstile | Até 20 widgets por conta e 10 hostnames por widget. | Enterprise sob consulta. |
| Images, se escolhido | Até 5.000 transformações únicas/mês. | US$ 0,50 por 1.000 transformações únicas excedentes no plano pago. Storage do Supabase pode continuar como destino. |

Ambos os planos Workers indicam 64 MiB de bundle descomprimido e 1 s de
inicialização, segundo a documentação da plataforma atualizada. A referência
do OpenNext ainda cita limites antigos de tamanho. Confirmar limites
efetivos na homologação.
[Workers preços](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limites](https://developers.cloudflare.com/workers/platform/limits/),
[planos da zona](https://www.cloudflare.com/plans/),
[limites WAF](https://developers.cloudflare.com/waf/rate-limiting-rules/#availability),
[Turnstile](https://developers.cloudflare.com/turnstile/plans/),
[Images preços](https://developers.cloudflare.com/images/pricing/).

## Domínio, rollback e decisão

Após autorização, inventariar zona, registros atuais, TLS e callbacks de Auth
e cobrança. Preservar MX, SPF, DKIM e DMARC. Homologar primeiro em hostname
separado com Access e credenciais próprias. Verificar o acesso pelo hostname
canônico e negar endpoints alternativos antes do corte. Fixar o mesmo projeto
Supabase aprovado e confirmar compatibilidade de schema e Storage com as duas
versões. Configurar Route ou Custom Domain de acordo com os registros
existentes. Custom Domain conflita com CNAME existente. Registrar a janela de
corte, registros anteriores, TTL real, critérios de retorno e responsável.
[Regras de Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Preservar a versão de fallback na Vercel com o conjunto de variáveis
compatível e acesso restrito. A proteção Standard não cobre todos os domínios
de produção. Verificar na conta se pode proteger todos os domínios e URLs
gerados ou implantar uma barreira equivalente no ingresso. Se o corte
falhar, remover a rota Workers ou restaurar o destino anterior do hostname
para a Vercel conforme o plano aprovado. Conferir TLS, login, reservas,
uploads, confirmação de pagamento apenas em QA e ausência de cache privado.
Usar o mesmo Supabase e manter as migrations compatíveis com o fallback.
[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).

**Pendências para GO:** upload válido de foto e logo no caminho escolhido,
arquivo corrompido, animação e limites testados sem objeto órfão, confiança
de headers e bloqueio de bypass, tese dos timeouts com telemetria, limites
edge, homologação de Auth/RLS/Storage e ensaio de rollback. O build local
e o ensaio funcional autorizam continuar a preparação, sem liberar o corte.
