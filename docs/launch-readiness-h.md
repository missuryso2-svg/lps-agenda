# LPS Agenda — prontidão de lançamento (Fase H)

**Atualizado em:** 23/11/2026
**Decisão:** **NO-GO para receber barbearias reais ou iniciar operação comercial.**
**Deploy, ativação e escrita financeira hospedada:** não realizados.

## Adendo I1 — hospedagem definida

O proprietário escolheu **Vercel exclusivamente** para Next.js; o Supabase hospedado existente permanece. Repositório/branch pretendidos: `missuryso2-svg/lps-agenda` / `main`. `vercel.json` fixa Functions em `iad1`, desliga deployments automáticos Git e não declara `crons`. Conta/projeto/domínio não foram configurados, não houve importação nem deployment e o plano Pro não foi contratado. A Vercel trata o primeiro deployment de projeto novo como Production; qualquer import/deploy futuro exige autorização explícita. O NO-GO permanece.

## Resumo executivo

As funcionalidades existentes foram exercitadas em stacks locais de QA com dados sintéticos, inclusive Auth, isolamento entre barbearias, agenda, trial, operação financeira, fotos privadas, notificações, QR/PDF e a integração AdSense desligada. Não foi confirmado defeito P0/P1 no código durante os cenários executados. A comunicação pública do trial foi ajustada para não prometer disponibilidade imediata, e dois fixtures/seletor de testes foram estabilizados.

Isso não equivale a autorização de lançamento. Vercel foi escolhida, mas conta/projeto/domínio definitivo ainda não estão configurados; o SMTP hospedado não foi verificado, a credencial administrativa disponível na configuração local foi rejeitada pelo projeto hospedado, a proteção contra senhas vazadas está desativada e a revisão jurídica/privacidade e os canais de suporte ainda não foram concluídos. Portanto, a decisão geral permanece **NO-GO**, embora a homologação funcional em QA tenha sido aprovada no escopo executado.

## Estado confirmado por ambiente

### Supabase hospedado — somente leitura

- 29 migrations aplicadas; última: `20261120180000`.
- 1 gestor financeiro ativo e 0 operadores.
- Nenhum contrato ou trial manual, mensalidade, Pix confirmado, assinatura Asaas vigente, pendência de conciliação, compensação aberta ou fila de retry/webhook.
- `private.manual_trial_activation.enabled=false`; executor de inadimplência desligado; `pg_cron` ausente.
- 22/22 tabelas públicas com RLS; nenhum privilégio efetivo de tabela para `anon`.
- 25 funções públicas `SECURITY DEFINER`: 20 executáveis por `authenticated`, nenhuma por `anon`; todas com `search_path` vazio. As RPCs autenticadas têm guards internos de proprietário, vínculo ou concessão financeira e foram exercitadas com tentativas negativas em QA. Não revogar em massa.
- Bucket de fotos da equipe `barber-photos` privado.
- As consultas hospedadas foram de leitura. Não foram alteradas concessões, contratos, Pix, flags, migrations ou dados de usuários.

### Workspace e QA local

- A homologação começou em `main`, no commit `e73e7f7819eb22d090901dac5c49602c5da13b9f`, igual a `origin/main` naquele momento.
- `.env.local` aponta a URL/chave pública para o projeto hospedado e usa `http://localhost:3000` como origem da aplicação. A chave administrativa local não autenticou no PostgREST hospedado (`Invalid API key`); não foi substituída. Não usar essa chave para produção.
- Builds e testes de escrita foram compilados explicitamente contra Supabase local QA em loopback. A stack B2A2 já existia antes da Fase H e não foi resetada nem parada; contém fixtures `example.test`. A stack B2B limpa criada para esta fase tem somente fixtures sintéticas e será encerrada sem backup no cleanup H.
- O teste de upgrade local aplicou as migrations 20–29 sobre fixtures legadas sintéticas. Nenhuma migration foi aplicada remotamente.

## Inventário dos módulos

| Módulo | Resultado H | Limite ou dependência para lançamento |
| --- | --- | --- |
| Landing page e planos | Homologados em 375, 768 e 1280 px; três planos, limites 1/5/10, sem preço público, FAQ, demo e WhatsApp validados. | Conferência humana do destinatário WhatsApp ainda necessária. |
| Cadastro, login e Auth | Cadastro, confirmação via Mailpit/PKCE, login, recuperação, redefinição, logout e cookie inválido exercitados em QA. | SMTP, domínio remetente, redirects e entrega real hospedados não verificados. |
| Trial | 168 horas, Básico, limite de um profissional, bloqueio após expiração e preservação do histórico testados em QA/SQL. | Ativação Next e banco permanecem desligadas no hospedado; copy informa liberação comercial. |
| Dashboard, equipe e clientes | Fluxos de painel, permissões, troca de contexto, fotos privadas, validação de telefone e WhatsApp individual exercitados. | Operação real e suporte não autorizados. |
| Agenda pública e interna | Disponibilidade, cobertura, associação serviço/profissional, almoço, reservas concorrentes, atendimento presencial, confirmação, avaliação e notificações testados. | Testes finais em domínio e dispositivos reais pendentes. |
| Financeiro da plataforma | Gestor, operador, acordo, emissão, conferência Pix sintética, idempotência, revogação, atraso e carência testados em bancos locais descartáveis. | Sem escritura financeira hospedada; executor, plantão e alertas não provisionados. |
| QR G1 | Link real `/agendar/[slug]`, PNG decodificado, PDF A4 e reserva/notificação no fluxo existente testados contra origem HTTPS reservada de QA. | Regerar no domínio definitivo e validar leitura física pelo celular. |
| AdSense G2 | Código e páginas auditados com integração desligada; não é requisito para o SaaS de agenda. | Publisher, CMP e aprovação ficam pendentes de monetização futura. |

## Auditoria técnica e de segurança

- Next.js 16.4.5, React 19.3.0, TypeScript 5.9.3; instalação de dependências de topo consistente (`npm ls --depth=0`).
- `npm audit --omit=dev`: zero vulnerabilidades. Auditoria completa: 10 vulnerabilidades moderadas em dependências de desenvolvimento associadas a `minimatch`/`shadcn`/`typescript-eslint`; o conserto sugerido por `--force` introduziria troca major do `shadcn` e não foi aplicado.
- Advisors hospedados: 20 avisos de `SECURITY DEFINER` executável por `authenticated` (RPCs intencionais com autorização interna), 1 de proteção contra senhas vazadas desativada e 1 de plano de inicialização RLS (desempenho). Nenhum `SECURITY DEFINER` listado é executável por `anon`; os guards foram validados em QA. A proteção de senha requer decisão/configuração no Supabase Auth antes de abrir cadastro real. O aviso de desempenho deve ser medido antes de eventual ajuste de política.
- Chaves `service_role`, Asaas e cron devem ser fornecidas pelo secret manager do host, exclusivamente ao processo servidor. `.env.local` é ignorado pelo Git e não deve ser usado como fonte de build/produção. Os testes de segurança da suíte verificam que segredos privados não são referenciados pelos bundles client.
- Vercel foi escolhida, mas ainda não há conta/projeto/deployment nem domínio final; região/contratos dos subprocessadores, backup restaurável, monitoramento, recuperação de desastre e teste pós-deploy também não foram confirmados.

## Achados e correções

| ID | Classe | Achado | Tratamento |
| --- | --- | --- | --- |
| H-01 | P2, informação comercial | A vitrine afirmava teste grátis imediato mesmo com onboarding manual desligado. | Corrigido: agora informa 168 horas no Básico, sujeitas à liberação da LPS Solutions, e que criar conta não inicia o trial. Teste unitário e browser assertion adicionados. |
| H-02 | QA, não defeito de produto | O seletor C2 encontrava o `<summary>` e o título homônimo do diálogo fechado, e o teste podia consultar antes da hidratação. | Estabilizado por escopo ao artigo da fatura, espera pelo elemento e `networkidle`; a jornada financeira repetiu e passou. |
| H-03 | QA, não defeito de produto | O fixture HTTP do trial usava horário no passado e não criava cobertura real de serviço/profissional/expediente. | Corrigido fixture para criar vínculos e horário válidos dentro das 168 horas. |
| H-04 | P1, operação | Vercel foi definida na I1, mas conta/projeto/domínio, SMTP e credencial `service_role` válida no processo hospedado não foram confirmados. | Bloqueia lançamento até provisionamento/validação autorizados; nenhum plano foi contratado e nenhuma credencial foi substituída. |
| H-05 | P1, privacidade/jurídico | A política declara canal de direitos/exclusão ainda indisponível; os termos ainda descrevem ambiente de desenvolvimento. O papel controlador/operador, bases legais, retenção e transferência internacional precisam de revisão. | Não alterado silenciosamente. Aprovação jurídica e canais reais são pré-requisito. |
| H-06 | P1, segurança/operação | Advisor indica proteção contra senhas vazadas desativada. | Habilitar/decidir em Auth e repetir teste antes de cadastro hospedado. |
| H-07 | P2, desempenho | Um aviso de inicialização RLS. | Sem alteração automática; medir em staging/produção após hospedagem escolhida. |

Não foi confirmado achado P0 de exposição entre tenants, privilégio `anon`, corrupção financeira ou perda de histórico durante esta auditoria. A ausência de achado automatizado não substitui revisão jurídica ou monitoramento em produção.

## Privacidade e legislação — revisão pendente

As rotas `/privacidade` e `/termos` estão públicas, mas não são aprovação jurídica. A política atual informa que exclusão assistida e canais oficiais ainda serão implementados/publicados e descreve a LPS de forma ampla como operadora; a divisão de papéis pode variar entre dados de clientes da barbearia, conta, segurança e cobrança. Antes de receber dados reais, o jurídico/responsável de privacidade deve confirmar: bases legais por finalidade, controlador(es)/operador(es), instruções e contratos, retenção e descarte, fluxo de acesso/correção/exclusão/portabilidade, fotos, destinatários/subprocessadores e região de processamento/transferência internacional.

A análise considerou as fontes oficiais vigentes em 23/11/2026: [LGPD compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [Lei 15.352/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15352.htm), [ECA Digital — Lei 15.211/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm) e [guia ANPD para fornecedores, publicado em 28/10/2026](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-fornecedores-de-produtos-ou-servicos-de-tecnologia-da-informacao.pdf/@@display-file/file). O ECA Digital está em vigor desde 17/03/2026; como a reserva pública pode ser acessada por menores, o jurídico deve avaliar o critério de acesso provável, riscos e obrigações aplicáveis. H não concluiu essa classificação nem introduziu coleta de idade.

Revisar também o [Regulamento de Comunicação de Incidente — Res. ANPD 15/2024](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024), [atuação do encarregado — Res. 18/2024](https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-18-de-16-de-julho-de-2024-572632074), [transferência internacional — Res. 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024) e [cookies — guia ANPD](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf). Não declarar conformidade integral à LGPD/ECA Digital com base nesta homologação.

## Matriz GO/NO-GO

| Grupo | Evidência H | Situação para lançamento |
| --- | --- | --- |
| Produto | Jornadas sintéticas e telas responsivas passaram; trial testado, mas flags continuam off. | **Parcial** — trial requer aprovação e smoke test real após deploy autorizado. |
| Financeiro | Operação manual e inadimplência testadas somente em QA; zero escrituração hospedada; sem conflitos Asaas no snapshot. | **NO-GO operacional** — nomear conferentes, provisionar executor/segredo, alertas e testar procedimento/recuperação. |
| Infraestrutura | Build passa em QA; Vercel escolhida, mas conta/projeto/domínio ainda não configurados; origem atual é loopback; SMTP e backup não comprovados. Git deploy e Cron foram desligados em código para evitar publicação/automação prematuras. | **NO-GO essencial** — aprovar custo/primeiro deploy, configurar host/domínio, Auth, backup, monitoramento e teste pós-deploy. |
| Segurança | RLS, grants, guards, Storage e autorização financeira exercitados. | **Parcial** — credencial administrativa válida não confirmada; leaked-password protection desligada; revisar advisors após configuração. |
| Privacidade e jurídico | Páginas públicas existem e fluxos foram inventariados. | **NO-GO essencial** — revisar política/termos, canais, papéis, retenção, subprocessadores, incidentes e ECA Digital. |
| Comercial | Links `wa.me` para número configurado e mensagens foram testados sem envio. | **Parcial** — pessoa da LPS deve conferir titularidade do WhatsApp; suporte e responsável de cobrança precisam ser designados. |
| AdSense | Flag e integração desligadas, sem anúncios em reservas ou áreas privadas. | **Aprovado como não bloqueante** enquanto permanecer desligado; aprovação/CMP são etapa futura. |

### Aprovações para mudar a decisão

1. Proprietário confirma orçamento/plano Vercel Pro, escolhe domínio e autoriza explicitamente a janela do primeiro deployment, que a Vercel classifica como Production.
2. Operações valida segredo Supabase, URL pública, redirects, SMTP, backups restauráveis e monitoramento.
3. Segurança revisa proteção de senha, rotação de credenciais de teste, alertas e acesso operacional.
4. Jurídico/privacidade aprova termos, política, canais de titular/encarregado, contratos e escopo ECA Digital.
5. Financeiro nomeia responsáveis e aprova executor, conciliação, escalonamento e incidentes.
6. Comercial confirma o destinatário WhatsApp e o procedimento de suporte.
7. Após deploy autorizado, realizar smoke test sintético e documentar o resultado antes de liberar aquisição.

**A decisão acima não autoriza deploy, ativação de onboarding/worker, cobrança, Pix real, criação de operador, `pg_cron` ou AdSense.**
