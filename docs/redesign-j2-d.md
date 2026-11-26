# J2-D — Agendamento público

A fase parte de 41a0918 em codex/redesign-j2, após a aprovação visual da J2-C3.

## Interface e fluxo

A página /agendar/[slug] destaca nome, identidade, descrição, endereço e telefone a partir do cadastro da barbearia. O horário de funcionamento e os links legais ficam disponíveis sem interromper a reserva. O painel de agendamento aparece ao lado dos dados da barbearia no desktop e vem antes deles no celular. Sem logo, as iniciais ficam no lugar da imagem. Os endereços precisam corresponder à regra de mídia pública antes de ser usados.

O cliente escolhe o serviço, o profissional, a data e o horário. A lista de profissionais acompanha o serviço escolhido e usa somente vínculos ativos da projeção pública existente. O calendário combina datas próximas e o seletor nativo. Os horários habilitados vêm do servidor. Seleção tem marca e estado semântico. Dia fechado, agenda cheia ou horário perdido durante a confirmação têm mensagens distintas. Uma mudança de data desconsidera resultados antigos. Ao voltar, o formulário preserva os dados de contato e reconsulta o horário.

O resumo mostra barbearia, serviço, profissional, data, hora, duração e valor. Os campos existentes usam preenchimento automático, teclado de telefone, formatação ao sair do campo e erros associados aos campos. Um bloqueio síncrono absorve cliques repetidos na interface. A confirmação só aparece depois que o servidor cria a reserva e a página privada localiza a gravação. Ela apresenta o valor histórico e o horário persistido, com a opção de cancelamento quando autorizada e a orientação para guardar o link privado.

## Arquivos principais

- A página pública e a confirmação foram atualizadas em [agendar](../src/app/agendar/%5Bslug%5D/page.tsx) e [reserva](../src/app/agendar/%5Bslug%5D/reserva/%5Btoken%5D/page.tsx).
- O [assistente](../src/features/public-booking/components/booking-wizard.tsx), o [botão de cancelamento](../src/features/public-booking/components/cancel-reservation-button.tsx) e o [CSS isolado](../src/features/public-booking/booking-j2.css) usam os tokens já aprovados.
- A [projeção pública](../src/features/public-booking/queries.ts) e o [filtro de mídia](../src/features/public-booking/format.ts) preservam o endereço HTTPS legado elegível. Caminhos privados, credenciais e URLs assinadas ficam fora da resposta pública. Fotos no bucket privado usam o fallback no site público. A confirmação evita exibir nome e contato do cliente e usa política de referência restritiva.
- [Testes de mídia](../tests/public-booking-media.test.ts), [fixture](../tests/integration/j2d-fixture.mjs), [matriz](../tests/integration/j2d-visual.mjs) e [integração](../tests/integration/j2d-booking.mjs) cobrem os fluxos afetados.

## Skills e decisões

emil-design-eng orientou hierarquia e densidade para celular. review-animations e improve-animations orientaram a revisão das transições de alta frequência. A troca de etapa e o foco são imediatos. animation-performance orientou o skeleton estático, o feedback útil durante o carregamento e a preferência por movimento reduzido. A projeção Supabase foi revisada com a skill Supabase. A revisão de React manteve o conteúdo institucional no servidor e deixou no cliente apenas a interação do fluxo. [Storage Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Segurança e regressão

As regras de cobertura, o cálculo de disponibilidade, os bloqueios, a validação Zod e as operações no PostgreSQL são as mesmas usadas nas fases aprovadas. As ações continuam usando a mesma proteção de origem, rate limiting e verificação final do horário. A página de indisponibilidade comunica a situação do agendamento em linguagem neutra. A validação antes do envio usa o interpretador Zod sob CSP estrita. A concessão de trial e o Pix de homologação usam exclusivamente fixtures locais.

## Testes executados

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Vitest | 826 testes em 41 arquivos, incluindo 9 novas regressões de mídia | [Log](qa-j2-d/vitest.log) |
| Typecheck e lint | Aprovados | [Typecheck](qa-j2-d/typecheck.log) · [Lint](qa-j2-d/lint.log) |
| Builds Next.js e OpenNext | Aprovados | [Next.js](qa-j2-d/next-build.log) · [OpenNext](qa-j2-d/opennext-build.log) |
| PostgreSQL | Suites `manual-trial-access`, `operations-f3` e `operations-f3-concurrency` aprovadas. 33 migrations conferidas no QA descartável | [Log](qa-j2-d/postgres.log) |
| Next.js em Node | Reserva persistida, cliques repetidos, isolamento entre barbearias, preço histórico, concorrência, recusa de origem externa e estados de cobertura aprovados | [Log](qa-j2-d/node.log) |
| OpenNext em Workers local | QR gerado pelo painel, decodificado e seguido no loopback, catálogo, validade de formulários, confirmação, persistência e isolamento aprovados | [Log](qa-j2-d/workers.log) |
| Matriz de interface em Chromium | Serviço e horário em 10 combinações, preferência por movimento reduzido, foco por teclado, CSP e overflow | [Antes](qa-j2-d/before.log) · [Depois](qa-j2-d/after.log) |
| Git | `git diff --check` e `git diff --cached --check` aprovados | [Log](qa-j2-d/diff-check.log) |

O fluxo em Node simulou disputa pelo mesmo horário e confirmou apenas uma gravação para o horário disputado. A segunda tentativa recebeu a disponibilidade atualizada com o contato preenchido. As coberturas exercitadas foram trial vigente e seu último dia, trial expirado, pagamento pendente, assinatura paga, suspensa e cancelada. O QR testado no Workers usa um domínio reservado de exemplo. No teste, o navegador seguiu o caminho da URL pela porta local.

A prévia compilada está vinculada a 127.0.0.1 e aceita reservas na barbearia sintética. [Abrir a prévia](http://localhost:59332/agendar/aurora-j2d-ef14a52d) · [Verificação](qa-j2-d/preview.log).

## Desempenho e capturas

A [galeria](qa-j2-d/README.md) reúne 40 capturas antes e depois, em 320, 375, 768, 1280 e 1920 px nos dois temas. As capturas adicionais mostram revisão, confirmação e indisponibilidade. A matriz mediu páginas compiladas em Chromium local, com contextos novos e a mesma barbearia sintética. As comparações descrevem essa amostra de loopback e precisam de confirmação em dispositivos, redes e infraestrutura hospedada.

| Amostra | Métrica | Antes | Depois |
| --- | --- | ---: | ---: |
| Todas as larguras | TTFB mediano | 12,80 ms | 17,15 ms |
| Todas as larguras | FCP mediano | 108 ms | 134 ms |
| Todas as larguras | LCP mediano | 120 ms | 136 ms |
| 320 e 375 px | FCP mediano | 128 ms | 142 ms |
| 320 e 375 px | LCP mediano | 284 ms | 148 ms |
| Todas as larguras | CLS mediano | 0 | 0 |
| Todas as larguras | JavaScript mediano | 224.971 B | 220.939 B |

O FCP aumentou na amostra. O JavaScript inicial caiu cerca de 4 kB e o LCP nas larguras móveis ficou menor. O menor contraste medido nos pares selecionados foi 6,84:1. A matriz registrou zero overflow horizontal e zero eventos de CSP no candidato. [Medições](qa-j2-d/performance.log).

## Pendências e parecer

Permanecem pendentes a leitura manual com NVDA ou Narrador, a homologação hospedada do binding de imagens, o controle de origem e dos headers encaminhados, a proteção contra acesso direto, rate limiting distribuído, Turnstile e a revisão de abuso e da Data API. Continuam registrados os quatro timeouts sem atribuição, a restrição de transições diretas de atendimentos e a reconciliação de fotos privadas órfãs.

**GO técnico local para avaliação visual da J2-D.** A próxima fase depende de aprovação visual explícita. O lançamento comercial permanece em **NO-GO** até a homologação hospedada e a aprovação do proprietário.
