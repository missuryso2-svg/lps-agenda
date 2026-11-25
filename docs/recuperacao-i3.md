# I3 · Assinatura manual e logo da barbearia

**24 de novembro de 2026 · GO técnico local para revisão da I3. NO-GO comercial.** A próxima fase e qualquer operação hospedada dependem de aprovação do proprietário.

## Ponto de retomada

A recuperação começou na `main`. `git log`, as referências locais e a consulta de leitura `git ls-remote origin refs/heads/main` apontaram para `8d1e18bdb1c515d2f29cfbd7f29b976a0092b9e0`. O índice estava vazio. Havia 21 arquivos rastreados modificados e oito arquivos novos da I3 em `src`, `supabase/migrations` e `tests`. As instalações locais de skills, incluindo diretórios de agentes, `skills/`, `data/` e `skills-lock.json`, ficaram fora do commit.

Foram recuperados o formulário financeiro, a elegibilidade do diretório, o card de configurações, a rota de imagens, os componentes de identificação, a migration incremental e as suítes iniciadas pelo OpenCode. No primeiro ensaio isolado, 786 de 789 testes passaram. Os três testes de logo que falharam confundiam a chave do objeto com o hash de versão enviado ao navegador. A recuperação também corrigiu o tratamento de resposta perdida, a disputa entre a troca e a limpeza e o caso de uma aba que permaneceu aberta durante a troca de barbearia.

## Como aplicar o primeiro acordo

Em **Administração financeira → Barbearias**, selecione a linha do estabelecimento e **Aplicar assinatura manual**. No detalhe, confira a identificação, selecione um plano ativo e informe a mensalidade negociada, o início da cobertura, a primeira competência, o primeiro vencimento, as âncoras de renovação e vencimento, o deslocamento em meses, o horário local, o fuso, os termos, a referência e a justificativa. Revise os dados e confirme.

| Situação | Resultado |
| --- | --- |
| Barbearia sem qualquer assinatura | Pode registrar o primeiro acordo. |
| Trial manual vigente | A tela informa o término. O banco bloqueia inclusive acordos enviados com início futuro enquanto o trial está vigente. |
| Trial vencido, inclusive com estado persistido `trialing` | O diretório considera o término efetivo. Ao contratar, o banco encerra o trial vencido e verifica sobreposição. |
| Acordo manual cancelado ou expirado | Pode contratar novamente se a cobertura proposta respeitar o histórico. |
| Contrato pendente, ativo, em atraso ou com suspensão vigente | O operador consulta o motivo e administra o contrato existente. |
| Histórico Asaas ou pendência de conciliação | A nova contratação exige conciliação. |

A gravação usa `finance_agreement`, a autorização financeira C1 e o diário de operações. O banco serializa a primeira contratação por barbearia. Um reenvio idêntico recupera o recibo da operação, e duas tentativas distintas concorrentes resultam em um único contrato pendente. Esse recibo registra o acordo. A emissão da mensalidade é uma ação posterior, quando a competência permite. A baixa exige conferência do crédito integral no extrato oficial. A RPC de Pix existente calcula o efeito sobre a cobertura.

## Logo e isolamento

Em **Dashboard → Configurações → Logo da barbearia**, o proprietário pode pré-visualizar, salvar, substituir e remover a imagem. O servidor limita a leitura a 2 MiB, confere a assinatura de arquivo e o MIME, limita a imagem a 16 milhões de pixels e usa Sharp para decodificar e regravar o raster em WebP de até 1200 × 1200, preservando proporção e transparência. A logo identifica o estabelecimento no dashboard e no agendamento público. As referências HTTP(S) legadas continuam legíveis.

A rota exige a origem configurada, a sessão e o vínculo de proprietário. O identificador exibido na aba serve para detectar uma troca de contexto. O destino do upload vem da sessão. O bucket público usa chaves imutáveis por barbearia e restringe a escrita ao fluxo de servidor. A RPC volta a verificar o vínculo e compara a referência esperada sob lock. A atualização direta de `logo_url` pelo cliente fica bloqueada.

O banco registra a chave substituída na mesma transação da troca. Uma chave em limpeza fica impedida de voltar a ser a logo atual. Em caso de resposta perdida, a rota consulta a referência e submete o descarte ao banco antes de remover qualquer objeto do Storage. A próxima operação de logo pode recuperar uploads abandonados há mais de 15 minutos e retomar exclusões pendentes, em lotes. Até essa retomada, um arquivo sem referência pode permanecer no bucket. A remoção da origem também preserva possíveis cópias já obtidas por navegadores.

## Migration e arquivos

A migration 30 estende a função privada de registro de acordos e a projeção financeira. Também cria o bucket, as políticas de escrita, o papel de privilégio mínimo, as RPCs de referência e limpeza e a fila privada. Uma colisão de nome de bucket interrompe a instalação para que o conteúdo existente possa ser examinado. [SQL integral](../supabase/migrations/20261123120000_phase_i3_manual_agreements_and_logos.sql)

| Área | Arquivos principais |
| --- | --- |
| Financeiro | `src/app/admin/assinaturas/barbearias/[id]/page.tsx`, `finance.css` e `src/features/admin-billing/{actions,forms,lists,operation-form,validation}.*` |
| Imagem | `src/app/api/barbershop/logo/route.ts`, `src/features/barbershop/logo*.ts`, `src/features/settings/components/barbershop-logo-card.tsx` e `src/types/database.ts` |
| Exibição | Configurações, layout e QR do dashboard, `dashboard-shell.tsx`, `globals.css`, página de agendamento e consulta pública |
| Regressão | `tests/{admin-billing,barbershop-logo,security-and-schema}.test.ts`, suítes SQL e integrações abaixo |

## Evidências locais e reprodução

O build e os testes usaram uma cópia temporária dos fontes e das dependências instaladas, sem arquivos de ambiente privados nem cache de build herdado. Ambiente Windows, Node 26.13.0, npm 11.20.0, Next 16.4.5, Supabase CLI 3.1.0 e PostgreSQL 17.11. Um daemon Docker dedicado em uma distribuição WSL descartável isolou as duas instalações de QA das stacks preexistentes. O primeiro ensaio atualizou a base de 29 migrations. A instalação seguinte aplicou as 30 em sequência em banco vazio.

| Execução | Evidência |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | Saída 0. Build de produção gerou 8/8 páginas estáticas e incluiu as rotas dinâmicas. |
| `npm test -- --reporter=dot` | 790 testes em 37 arquivos. |
| `i3-logo-storage.sql` | 21 verificações em PostgreSQL, incluindo dois tenants, owner/staff, versão, recusa de reassociação, limpeza e upload abandonado. |
| `c2-dashboard.sql`, `c1-finance.sql`, `c1-concurrency.sql`, `b2b-operations.sql` | 24, 34, 16 e 43 verificações, respectivamente. A concorrência usa sessões PostgreSQL independentes. |
| `c2-dashboard-http.mjs` | Auth, PostgREST, Server Actions e Chrome. Primeiro acordo pendente, emissão, valor integral, repetição após perda de resposta e revogação de operador. |
| `i3-logo.mjs` | Chrome enviou dois PNGs sintéticos. A suíte decodificou os WebPs servidos pelo Storage, verificou as dimensões e o canal alfa e encontrou a logo no dashboard e no agendamento. Após a remoção, a referência estava nula e havia zero objetos do tenant. |
| `commercial-phase-d.mjs` | Jornadas comerciais em 375, 768 e 1280 px, primeiro acordo, trial vigente protegido e verificação dos contadores financeiros durante a navegação. |

Para reproduzir, use a configuração de QA de loopback descrita em [C2](financial-dashboard-c2.md). Aponte as variáveis públicas do build e os segredos de runtime exclusivamente para a stack descartável, mantenha as flags desligadas e compile antes das integrações. Execute os cinco SQLs da tabela na ordem indicada com `psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f <arquivo>`, preservando a estrutura de `tests/postgres`. Execute cada integração com `node tests/integration/<arquivo>` e passe os caminhos locais de Playwright Core e Chrome. Para um daemon dedicado em WSL, o helper aceita `B2A2_QA_WSL_DISTRO=LPS-I3-<dígitos>`. O helper confirma a identidade do projeto de QA e as portas locais.

## Pendências operacionais

O uso hospedado depende da aprovação e aplicação da migration, da origem exata em `NEXT_PUBLIC_APP_URL`, do acesso administrativo de servidor ao Storage e da publicação do código compatível. A validação com Sharp ocorreu no runtime Node. A compatibilidade com Workers pertence à futura fase de hospedagem. A contenção e rotação das credenciais de demonstração nos ambientes locais anteriores continua pendente conforme o [runbook I1](launch-unblock-i1.md). A auditoria I4 e a homologação hospedada aguardam autorização.
