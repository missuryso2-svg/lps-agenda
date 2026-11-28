# K3 — Plano de infraestrutura de produção

28/11/2026 · preparação em leitura após a homologação de MFA e cookie Secure na K2-C.1

**GO para preparar. NO-GO para executar a K3 e para lançamento comercial.** Este plano preserva o staging em US$ 0/mês, a hospedagem Vercel e o Supabase atual. O avanço depende de aprovação do orçamento, da janela e dos critérios de saída abaixo.

## Estado do domínio e da base

Consulta DNS pública, antes de qualquer alteração. O inventário público não enumera registros arbitrários de uma zona. A exportação integral do Registro.br e a conferência de todos os consumidores são pré-requisitos para cutover. [Evidência DNS](qa-k2-c1/dns-sanitized.jsonl).

| Nome e tipo | Resposta observada |
| --- | --- |
| `lpsagenda.com.br NS` | `a.auto.dns.br` e `b.auto.dns.br`, TTL 3.600 s |
| `lpsagenda.com.br SOA` | `a.auto.dns.br`, serial 2026332350, TTL 3.600 s |
| `lpsagenda.com.br A / AAAA` | Sem respostas A/AAAA na consulta |
| `www.lpsagenda.com.br CNAME / A` | NXDOMAIN |
| `lpsagenda.com.br MX` | Null MX `0 .`, TTL 900 s |
| `lpsagenda.com.br TXT` | `v=spf1 -all`, TTL 900 s |
| `_dmarc.lpsagenda.com.br TXT` | `v=DMARC1; p=reject;`, TTL 900 s |
| `lpsagenda.com.br CAA` | Sem registros CAA na consulta DoH |
| `lpsagenda.com.br DS` | Key tag 33150, algoritmo 13, digest tipo 2, TTL 3.600 s |

O DNSSEC está ativo na delegação atual. O banco de produção permanece na base com 29 migrations. O staging tem 37, inclusive a proteção AAL2 da K2-C.1. A `main` GitHub continua preservada. [Homologação K2-C.1](staging-k2-c1.md) · [Inventário de migrations](supabase-migration-inventory-k1-c.md).

## Sequência da configuração de domínio

1. **Antes da janela.** Exportar a zona atual do Registro.br e registrar seus nameservers, DS, DNSKEY, TTLs e o destino operacional Vercel. Conferir apex, `www`, subdomínios, MX, SPF, DKIM, DMARC, CAA, TXT de verificação, SRV e delegações. Revisar exportação com o proprietário. Levantar o TTL do DS na delegação pai e o tempo de retenção na prática. Responsáveis pela conta Cloudflare e pelo Registro.br devem ter MFA, recuperação e acesso de emergência.
2. **Montar a zona Cloudflare.** Em etapa aprovada, adicionar o domínio à conta correta. Importar e comparar registros com o inventário completo. Preservar Null MX, SPF e política DMARC atuais no apex, bem como demais registros existentes. Marcar registros de autenticação de e-mail como DNS-only. Não copiar SOA/NS geridos pelo provedor antigo. Registrar os dois nameservers atribuídos pela Cloudflare e revisar respostas diretamente neles antes de delegar.
3. **Trocar delegação com DNSSEC.** Para a sequência convencional, manter a zona antiga servindo, retirar primeiro o DS antigo no Registro.br e esperar a expiração do TTL do DS antigo na delegação pai. Verificar ausência de DS nos servidores autoritativos e em resolvedores validadores antes de trocar NS. Alterar os nameservers do Registro.br em janela aprovada. Confirmar delegação e propagação sem SERVFAIL. Ativar DNSSEC na Cloudflare, publicar o DS novo no Registro.br e verificar DS/DNSKEY e resolução autenticada. O caminho com DNSSEC contínuo exige suporte multisigner ou importação de chaves do provedor anterior e deve ser tratado como decisão própria.
4. **Emitir e verificar HTTPS.** Aguardar zona ativa e certificado válido para apex e `www`. Conferir a cadeia, SAN e qualquer CAA do inventário. Escolher `https://lpsagenda.com.br` como URL canônica, com redirecionamento de `www` e HTTP após certificados prontos. Para fallback com Vercel como origem, validar TLS entre Cloudflare e origem no modo **Full (strict)** e manter certificado válido em ambos. Avaliar HSTS depois de provar HTTPS em todos os subdomínios relevantes e o rollback.
5. **Implantar Worker de produção isolado.** Usar nome, config, variáveis, secrets e observabilidade distintos, sem cópia de credenciais de staging. Manter `workers.dev` e previews desativados e exigir domínio canônico. Manter o staging atrás do Access e no Supabase próprio. Validar CSP estrita, redirects, cache privado, cookie Secure e origem das mutações. Proteger rotas administrativas com Access ou regra própria da zona, preservando AAL2 em Supabase e nas RPCs. A Data API tem endereço próprio e exige os controles de RLS, Auth e RPCs independentemente da Cloudflare.

[Setup completo Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) · [DNSSEC](https://developers.cloudflare.com/dns/dnssec/) · [Custom Domains para Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Firewall, abuso e observabilidade

- **WAF e rate limits.** A zona permite configurar o conjunto disponível no plano efetivo. Começar com regras observadas em log quando disponível e escopo restrito a login, cadastro, recuperação, reserva e uploads. Limitar por IP validado na borda mais escopo funcional no app, por exemplo tenant e telefone normalizado na reserva. Testar NAT compartilhado, falsos positivos, caminhos diretos e efeitos sobre clientes legítimos. Revalidar o limite de cada recurso no painel antes de aprovar.
- **Turnstile.** Usar widgets separados para QA e produção, restritos aos hostnames aprovados. Validar com Siteverify no servidor, verificar hostname e ação, rejeitar replay e acomodar falha com mensagem acessível. A decisão deve cobrir tanto Server Actions quanto acessos diretos ao Supabase Auth, conforme a integração escolhida. Manter validações de esquema, CSRF, quotas por tenant e gatilhos de trial.
- **Trial e reservas.** Repetir concessão única e concorrência, limite de profissionais, bloqueio de reservas após expiração e integração com o rate limiter. Exigir pausa manual rápida e monitor de aquisição anormal antes de ligar o gate. Exibir “sete dias” ou o número de dias restantes. Gates do staging e do banco de produção ficam sob controle separado.
- **Monitoramento.** Alertar por erro 1102, 5xx, 429, p95/p99, CPU por rota, duração Auth/Data API, memória de isolate, uso de Images, filas financeiras, entrega/recusa de e-mail e backups atrasados. Usar apenas classes de rota, duração, resultado e IDs opacos. Omitir objetos do cliente, OTP, JWT, cookies e payloads financeiros. Definir responsável, canal de incidente e horários. [WAF](https://developers.cloudflare.com/waf/) · [Turnstile](https://developers.cloudflare.com/turnstile/get-started/) · [Limites do Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Plano de carga sujeito a autorização

1. Depois de aprovar o orçamento e o teto de requisições, repetir smoke com um usuário virtual. Medir ponta a ponta e registrar versão, região, amostras frias/aquecidas e chamadas a Supabase Auth, Data API, Storage e Images separadamente.
2. Em staging privado com fixtures e destino explícitos, rodar 5, 10 e 25 usuários simultâneos por patamares curtos de até 2 minutos, com pausa e análise entre níveis. Começar com mix de landing, login, agenda e QR. Incluir proporção menor de reservas e mídia dentro dos limitadores e da franquia. Registrar a taxa efetiva e a distribuição de rotas. Para operações de usuário, simular intervalos de leitura para não concentrar sessões no mesmo IP sem necessidade.
3. Parar imediatamente em 1102, evento de memória excedida, qualquer falha de isolamento, duplicidade financeira, erro de proteção ou sinais de saturação. Interromper subida de patamar ao atingir 1% de 5xx não esperados no período, p95 acima de 2 s em leituras comuns por dois intervalos, ou aproximação de 70% de quota diária, memória ou operação. Tratar os limiares como critérios propostos para a aprovação, não como SLA vigente.
4. Registrar CPU total e média ponderada para dimensionar custo. As medianas atuais são 19,41 ms no agregado anterior e 121 ms para as três chamadas QR após otimização. Elas justificam cautela com os 10 ms do Free. Esperar I/O externo aumenta duração sem equivaler a CPU faturável. [Limites](https://developers.cloudflare.com/workers/platform/limits/) · [Preços](https://developers.cloudflare.com/workers/platform/pricing/).

## SMTP transacional

| Opção | Preço e limites verificados | Requisitos e restrições |
| --- | --- | --- |
| Resend Free | US$ 0, até 3.000/mês, 100/dia, até três domínios no plano publicado. Pro a partir de US$ 20/mês. | SMTP com domínio próprio verificado, SPF do retorno e DKIM do provedor. Usar subdomínio separado para Auth, monitorar bounces e bloquear excedente pago. |
| Brevo Free | US$ 0, 300 envios/dia. Excedentes transacionais podem ser enfileirados até o limite divulgado. | SMTP transacional com remetente autorizado e domínio autenticado. Configurar DKIM e DMARC conforme instruções da conta, validar SPF/alinhamento onde aplicável e considerar fila e branding. |
| Amazon SES | À la carte, US$ 0,10 por mil envios, com possíveis custos adicionais de dados e recursos. Verificar créditos AWS Free Tier por elegibilidade. | Sandbox por região, até 200 mensagens/dia, 1/s e destinatários verificados. A saída do sandbox exige aprovação. Credenciais SMTP regionais, DKIM, e custom MAIL FROM opcional com SPF/MX alinhados. |
| Supabase padrão | Sem custo separado, 2 mensagens/hora por projeto. | Só aceita destinatários da equipe, entrega sem SLA. Uso de QA restrito a endereços aprovados. |

**Recomendação.** Começar com **Resend Free** para os primeiros volumes, com SMTP via TLS, subdomínio transacional separado, sem excedente e com alertas. Se 100/dia for restritivo, avaliar Brevo Free para os picos. SES é opção quando o volume justificar a operação de reputação, sandbox e faturamento. Nenhum provedor garante caixa de entrada. Medir confirmação, recuperação, bounce e rejeição com os destinatários aprovados.

Depois de aprovados provedor, domínio e destinatários, publicar somente os registros SPF, DKIM e MAIL FROM propostos pelo provedor no subdomínio escolhido. Manter SPF único por hostname. Confirmar alinhamento SPF ou DKIM com o From para satisfazer DMARC, incluindo o `p=reject` herdado do apex. Desativar tracking de links que reescreva confirmação ou recuperação. Configurar SMTP exclusivo de staging no Supabase, limitar callbacks à origem aprovada e completar a jornada no navegador. Guardar códigos e links apenas na caixa de teste. Ao final fechar novamente signup de staging e ambos os gates e conferir o estado efetivo.

[Resend Pricing](https://resend.com/pricing) · [Domínios Resend](https://resend.com/docs/dashboard/domains/introduction) · [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) · [Autenticação de domínio Brevo](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC) · [SES Pricing](https://aws.amazon.com/ses/pricing/) · [Sandbox SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) · [SMTP no Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Migrations, recuperação e rollback

- **Pré-requisitos DBA.** Inventariar 29 versões em produção e testar em restauração isolada a sequência incremental 30–37, incluindo data drift e ACL de Storage/Auth. Conferir órfãos, contratos em reconciliação, definer/roles, chaves e compatibilidade de versões. Aprovar backup, janela sem escritas críticas, número de operadores com TOTP e gestor de emergência antes de aplicar. Validar em transação owner, staff, Data API, contratos históricos e logs. Aplicar ao ref exato, sem seeds ou Vault, sob operação autorizada.
- **Backups.** Definir RPO inicial de até 24 horas e RTO alvo de até 4 horas para validação. Exportar esquema, Auth, dados, ledger, RLS e RPCs. Copiar os bytes de Storage separadamente com manifesto de bucket, objeto, tamanho e hash, e verificar referências nas tabelas. Cifrar e limitar acesso ao conjunto, manter cópia externa e ensaiar a restauração em outro ambiente liberado. Validar login de fixture, autorização, histórico financeiro e mídia. Configuração Cloudflare, nameservers, política de acesso e infraestrutura Vercel devem ter runbooks. Guardar secrets em armazenamento próprio.
- **Rollback durante cutover.** Conservar o deployment Vercel compatível com o schema novo e a checagem MFA como destino de contingência. Se erro crítico, desativar ingresso do Worker, restaurar rota/domínio para o Vercel preparado ou apontar o registro da zona para o destino Vercel validado. Repetir DNS/HTTPS, sessões, RLS e pagamentos. Evitar downgrade de schema que enfraqueça AAL2 ou perca operações após a mudança. Suspender finance até ter aplicação compatível se necessário.
- **Rollback de nameservers.** Separar rollback da aplicação e rollback da delegação. Preferir preservar a zona Cloudflare para redirecionar tráfego. Se a delegação precisar voltar ao Registro.br, coordenar primeiro a retirada do DS Cloudflare e o TTL, restaurar os NS antigos com zona pronta e reinstalar o DS correto apenas depois de conferir as chaves correspondentes.
- **Recuperação de gestor.** Dois gestores provisionados e verificados, com fatores TOTP e procedimento fora do canal para perda de dispositivo. Revogar concessão e sessões, registrar ticket e aprovação independente, restabelecer somente após novo TOTP. Ensaiar NVDA/Narrador, recuperação do último gestor e alerta de login antes de publicar. [Backups Supabase](https://supabase.com/docs/guides/platform/backups) · [Plano de recuperação](backup-and-restore.md) · [Roteiro audível](accessibility-validation.md).

## Custos propostos e critérios de GO

| Cenário | Estimativa mensal antes de impostos |
| --- | --- |
| Staging atual | US$ 0 com Workers, Access, Images e Supabase Free dentro de franquia |
| Produção com Worker Paid e Supabase Pro de um projeto | A partir de US$ 30, com US$ 5 de Workers e US$ 25 de Pro, assumindo um Micro coberto pelo crédito de compute |
| Produção e staging na mesma organização Pro | A partir de US$ 40 com dois projetos Micro, se o segundo custar US$ 10 de compute incremental. Precificar no painel antes de decidir. |

Limites incluem Workers Paid com 10 milhões de requisições e 30 milhões de ms de CPU. Alertas ou limite de gastos e teto de CPU devem ser aprovados junto com o custo. Os valores excluem domínio, tributos, overages, PITR, cópia externa e SMTP pago. O upgrade do Supabase Pro é recomendado para disponibilidade operacional, backups geridos e retenção inicial, após validar capacidade e recuperação. Supabase Free pode pausar. O custo do segundo projeto deve ser contabilizado se ambos estiverem na mesma organização. A aplicação usa SDK via HTTPS e RPCs. Mantém-se sem PgBouncer adicional, Hyperdrive ou outro pooler até demonstrar uma necessidade de conexões diretas. [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) · [Supabase](https://supabase.com/pricing) · [Compute Supabase](https://supabase.com/docs/guides/platform/compute-add-ons).

**Para autorizar a execução da K3**, concluir entrega SMTP real e jornada do trial, recuperação audível e administrativa, ensaio de restauração e cópia de objetos, carga representativa, acordo de orçamento e janela, e compatibilidade de aplicação e banco. Conferir proteção de ingresso, caminhos diretos e fallback. A ativação comercial, trial de produção, DNS e compra de serviços dependem de autorização explícita.
