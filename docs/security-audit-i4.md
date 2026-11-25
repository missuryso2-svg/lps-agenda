# Auditoria de segurança I4 — LPS Agenda

25/11/2026 · `codex/security-i4` · validação em Next.js e Supabase locais, com dados sintéticos.

**I3 + I3.1 — GO técnico local.** A `main` local avançou de `8d1e18b` para
`77ff36b` via fast-forward, pela sequência `8d1e18b → 48a1f9f → 77ff36b`.
`git fsck --connectivity-only` terminou com código 0 e objetos antigos
inalcançáveis. O checkout original tinha arquivos não rastreados de skills e
nenhuma alteração rastreada. A integração foi feita em um worktree limpo,
preservando esses arquivos. A referência local `origin/main` permaneceu em
`8d1e18b`. O diff entre a I3.1 e esta branch preserva as migrations 30 e 31.

**I4 — GO para revisão técnica local. NO-GO para publicação.** A correção de preço
e autoria passou nos testes locais. A aceitação para hospedagem depende dos
controles de origem, abuso e autenticação e da homologação do banco e dos
fluxos listados abaixo. A aprovação recebida cobre a migration financeira
incremental local.

## Achados

| ID | Severidade | Evidência e impacto | Correção e regressão |
| --- | --- | --- | --- |
| I4-01 | Alta | Antes da migration 32, um staff pôde atualizar `appointments.price_cents` de um atendimento concluído de 3100 para 1. O grant inicial de escrita é geral e a RLS valida o tenant. O preço exibido no histórico podia ser adulterado. A confirmação de Pix e a assinatura são fluxos separados. | Com aprovação, a migration 32 deriva preço e autoria para inserções autenticadas. Preserva preço, autoria, serviço e tenant na edição, inclusive por owner. Mutações internas dos papéis de infraestrutura e serviço continuam sob auditoria existente. `i4-security.sql` cobre preço e autor forjados na inserção, alteração rejeitada por staff e owner, histórico preservado depois de editar o catálogo e trilha de auditoria. |
| I4-02 | Média | `safeNextPath` aceitava caracteres de controle que o parser de URL remove durante a resolução, permitindo redirecionamento externo após autenticação. | Rejeição de controles, barras invertidas e entrada que não seja texto. Vitest valida quedas para URL interna e caminhos legítimos. |
| I4-03 | Média | Respostas HTML sem CSP. O HSTS declarava preload e incluía subdomínios sem evidência de revisão dos domínios. A ausência de CSP aumenta o impacto de uma eventual injeção. | Política de scripts com nonce gerado no Proxy, propagado ao Next e ao tema. Bloqueio de objetos e frames, base e formulários restritos à origem. Política completa em Report-Only por padrão, com `CSP_ENFORCE=true` para homologação. HSTS restrito ao host com um ano de vigência. Chrome validou script sem nonce bloqueado, tema executado, nonces únicos e headers na rota de login. |
| I4-04 | Média | As rotas de imagem aceitavam mutações repetidas de um owner. A rota de foto só identificava formatos incompatíveis depois de chamar Sharp. Isso expunha processamento nativo e Storage a uso excessivo. | As duas rotas compartilham teto de 30 mutações por tenant em janela fixa de 5 min, após autorização e antes da decodificação. O RPC existente é atômico e indisponibilidade retorna 503. A pré-validação raster precede o Sharp. Testes cobrem falso formato, erro de limite e 30 de 31 chamadas concorrentes, mais 429 na rota real. |
| I4-05 | Média | `getClientIp` usa o primeiro valor de `X-Forwarded-For`; a eficácia depende do proxy apagar valores do cliente e impedir acesso direto à origem. A chave por telefone é global em `createPublicBookingAction`; requisições em uma loja podem esgotar tentativas do mesmo telefone em outra. Consulta de horários prossegue se o limitador falha. | Pendente de validar a fronteira de ingresso e definir a política de abuso. Usar IP verificado pelo ingresso, escopo tenant + telefone e limite de borda para leitura. Homologar manipulação de headers, NAT, IPv6, tentativas entre tenants e indisponibilidade do limitador. |
| I4-06 | Média | `authErrorMessage` distingue `email_exists` e `user_already_exists`, se o provedor emiti-los. Recuperação já usa resposta uniforme. A enumeração via cadastro direto depende da configuração do Auth. | Proposta: resposta uniforme para duplicidade e teste de status, corpo e tempo na aplicação e no Auth REST. Homologar limites de login/cadastro, CAPTCHA quando adequado, MFA de operadores, expiração, proteção de senhas vazadas e SMTP. A evidência desta auditoria é de código, sem ensaio contra o provedor hospedado. |
| I4-07 | Média | O grant de UPDATE/INSERT em `appointments` ainda permite estados fora do fluxo do app no próprio tenant. O teste local cria um atendimento com status terminal pela tabela. A migration 32 cobre preço e autoria. | Proposta para revisão de permissões: mapear inserção, transições e RPC de avaliação antes de restringir escrita direta. Testar staff/owner, reservas públicas, chegada, cancelamento, conclusão, no-show e atendimento histórico. Impacto sobre integrações de Data API e rotinas operacionais requer aprovação própria. |
| I4-08 | Média | Foto privada tem remoção imediata com melhor esforço. Exclusão de tenant, falha após upload ou resposta ambígua podem deixar objetos no Storage. A rota conserva a versão em caso de dúvida para preservar a referência. | Proposta: fila ou reserva durável equivalente à das logos, com chave canônica e exclusão via Storage API após confirmar ausência de referência. Testar tenant excluído, CAS, reprocessamento e restauração. A reconciliação I3.1 cobre logos e passou pela API real. |
| I4-09 | Baixa na aplicação, moderada no advisory | `npm audit` encontrou dez entradas moderadas associadas ao minimatch na árvore de desenvolvimento. A atualização compatível do lint eliminou seis entradas. As quatro restantes são a mesma cadeia em `shadcn → ts-morph → @ts-morph/common → minimatch`. O pacote também fornece um CSS importado no build. | Lockfile atualizado sem override de major. O audit de produção registrou zero alertas. Recomenda-se atualizar a cadeia quando houver versão compatível, verificar o CSS e evitar rodar o gerador com padrões não confiáveis. [Advisory do minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). |
| I4-10 | Média, condicionada ao token | O webhook Asaas autentica antes de ler o payload e valida 64 KiB após `request.text()`. Com token válido, um corpo sem `Content-Length` pode ser materializado inteiro antes da rejeição. | Proposta: impor 64 KiB no stream e no ingresso, manter deduplicação e assinatura existentes, testar corpo segmentado acima do limite e reenvio do mesmo evento. |

## Controles revisados

- **Multi-tenant e administração.** As 22 tabelas de `public` tinham RLS
  ativa no catálogo local. As funções `SECURITY DEFINER` de `public`
  fixavam `search_path` e eram inacessíveis a anon. Os testes exercitaram
  PostgreSQL e Data API com dois tenants, owner, staff, usuário externo e anon.
  Consultas e escritas em clientes de outro tenant foram negadas, assim como
  promoção de staff, leitura de foto de outro tenant e funções do schema privado
  via PostgREST. O acesso financeiro é decidido pelo registro privado de
  operadores, inclusive após revogação na mesma sessão. `user_metadata` não
  concedeu papel administrativo. Funções e políticas continuam inventariadas no
  log de catálogo. [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- **Entradas, SQL, XSS e CSRF.** As ações inspecionadas validam entradas por
  Zod e filtram por tenant obtido da sessão. Consultas usam parâmetros do SDK.
  A gramática de filtros de busca é construída com entrada limitada e
  saneada. O teste HTTP de busca adversarial preservou os dados. O Chrome
  mostrou texto HTML de cliente como texto sem criar elemento ou executar
  script. As rotas de imagem exigem Origin exato e versão, e uma chamada
  cross-origin à Server Action foi rejeitada. Autenticação agora limita e-mail
  a 254 caracteres e senha enviada ao login a 4096.
- **Sessões, cabeçalhos e cache.** O servidor usa `auth.getUser()`.
  Cookies de seleção somente escolhem entre vínculos ativos autorizados.
  Proxy preserva cookies no redirect, e o HTTP de painel financeiro comprovou
  `private, no-store`. APIs de imagem usam autorização própria, Storage
  privado para fotos e leitura pública deliberada das logos. Políticas de
  CORS no ingresso hospedado, cookie Secure atrás do proxy e cobertura de
  recuperação de conta com SMTP real permanecem para homologação. A política
  completa permite estilos inline de componentes e imagens HTTPS legadas.
  Proteger os relatórios CSP de URLs sensíveis e revisar violações no navegador
  antes do enforcement em hospedagem. [CSP do Next.js](https://nextjs.org/docs/app/guides/content-security-policy).
- **Integridade financeira e concorrência.** Os testes existentes passaram
  para replay compatível, Pix concorrente, alteração de contrato, escopo de
  operador, limite de profissionais e consistência de agenda. A cobertura
  comercial existente e a decisão de bloqueio com acordo pendente continuam
  verificadas. A nota I3.1 descreve a execução manual da reconciliação de
  logo. A foto segue como pendência separada.
- **Segredos e dependências.** Variáveis administrativas são importadas de
  módulos `server-only`. O scan por padrões de credenciais foi feito sem
  imprimir valores. Seu alcance e o resultado de verificação do bundle
  estão nos logs. A rotação das credenciais de demonstração anteriores
  continua pendente conforme o runbook I1.

## Evidências e homologação

Os logs sanitizados em [qa-i4](qa-i4/) incluem testes Vitest, TypeScript,
lint, build, Chrome, Data API, PostgreSQL, concorrência, catálogo,
advisors, dependências e regressões I3.1. O relatório de desempenho registra
os planos e limites da medição.

Na homologação, confirmar configuração de exposição da Data API, privilégios
do papel que aplica a migration 32, versões do PostgreSQL e Storage, negações
e revogação com dois tenants, autenticação com MFA/SMTP, headers no caminho
real de ingresso e proteção contra abuso. Repetir a suíte de pagamentos e
reconciliação em ambiente aprovado. Logs da execução local não certificam
capacidade, configuração ou estado de ambientes hospedados.
