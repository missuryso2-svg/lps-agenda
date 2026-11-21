# F3 · Operação da agenda

## Atendimento presencial e disponibilidade

Em **Agenda → Agendar cliente presencial**, a equipe seleciona um cliente existente ou informa o nome de um cliente novo. Escolhe serviço, profissional habilitado, data e horário e pode registrar uma observação. O novo cliente é cadastrado na própria barbearia, junto com a reserva, em uma transação. Uma colisão ao salvar desfaz o cadastro rápido. O fluxo usa os mesmos horários, status inicial `scheduled` e agenda do agendamento público. O cliente presencial dispensa uma conta de acesso.

Em **Horários → Pausa recorrente**, o proprietário configura um intervalo por profissional e dia da semana. A configuração usa o fuso da barbearia. Horários adjacentes de expediente formam um período contínuo. Os limites do intervalo são fechados no início e abertos no fim. Um atendimento pode terminar exatamente no começo da pausa ou começar exatamente no fim.

A migration `20261120180000_scheduling_operations.sql` adiciona `barber_breaks` com vínculo composto entre barbearia e profissional, leitura por membro e escrita pelo proprietário. A agenda diária mostra a pausa e a disponibilidade compartilhada a desconta. No PostgreSQL, a criação e o reagendamento validam cliente e profissionais ativos, serviço e vínculo, duração, funcionamento, jornada, grade de 15 minutos, bloqueios e pausas. A exclusão de sobreposição e os controles anteriores de cobertura e de ativação de profissionais continuam aplicáveis. Os horários já ocupados impedem a ativação de uma pausa conflitante. Uma redução de expediente que invalide uma pausa ativa também exige resolver o conflito primeiro.

Uma revisão privada por barbearia serializa as transações que podem alterar a disponibilidade. Em isolamento de snapshot, uma escrita concorrente baseada em uma revisão desatualizada precisa ser repetida. A arbitragem acontece também quando os pedidos chegam por rotas diferentes.

## Conclusão e indicadores

O modal **Concluir atendimento** identifica cliente, serviço, profissional e horário. O funcionário pode registrar apenas uma das notas, ambas ou nenhuma. As duas notas aceitam inteiros de 0 a 10 e começam vazias. **Não avaliar** conclui sem registrar notas.

A RPC `complete_rated_appointment` verifica o vínculo ativo, bloqueia a linha do atendimento e grava a conclusão e as notas juntas. A tabela `appointment_ratings` admite uma linha por atendimento, identifica o profissional, a barbearia e o responsável autenticado e registra o instante da gravação. Repetir a mesma conclusão mantém o resultado. Uma tentativa de substituir a avaliação de um atendimento já concluído é recusada. O banco também impede a reabertura do atendimento concluído e a troca posterior de seu cliente, profissional, serviço ou período. A gravação das avaliações não lê nem grava valores pagos.

Em **Equipe**, o proprietário consulta média e quantidade por critério. A contagem considera apenas notas informadas. A RLS restringe a consulta ao proprietário, e o navegador da equipe não tem permissão de escrita direta na tabela. A interface identifica a origem como “Avaliações informadas pelos clientes e registradas pela equipe.”

## Notificações

A criação de uma nova reserva agendada insere uma notificação na tabela existente `notifications` para cada proprietário ou funcionário com vínculo ativo na barbearia. Esses papéis já podem operar a agenda. A chave estrangeira composta fixa o tenant e a restrição única garante uma notificação por destinatário e reserva. A transação da reserva inclui a criação das notificações.

O sino apresenta até 20 itens, com prioridade para os não lidos. Os dados do cliente, serviço, profissional, horário e estado são consultados a partir da reserva vigente. O destinatário pode marcar como lida, abrir os detalhes no dia correspondente ou confirmar uma reserva que ainda está agendada. A ação de confirmação exige a sessão e compara o estado no momento da escrita. A leitura é individual e persiste depois de recarregar. A interface consulta o servidor nas navegações, atualizações e ações. A versão não exige Realtime ou serviço externo de mensagens.

## Verificação e implantação

| Verificação | Cobertura |
| --- | --- |
| Vitest | Schema das notas, ausência e zero, nome do cliente e regressões dos módulos existentes. |
| PostgreSQL | `tests/postgres/operations-f3.sql` valida permissões, expediente, pausas, bloqueios, limites e rollback após falha durante a gravação de nota. |
| Concorrência | `tests/postgres/operations-f3-concurrency.sql` usa conexões independentes para verificar a espera pelo commit e a recusa de um snapshot obsoleto. `manual-trial-access-concurrency.sql` verifica o bloqueio financeiro concorrente. |
| Next, Auth e Data API | `tests/integration/operations-f3.mjs` usa dois tenants, clientes existentes e novos, agendamento público, colisões concorrentes, RLS, confirmação, leitura, avaliações, cobertura e telas em Chrome. |
| Migração | Instalação limpa até a 29ª migration e atualização de 28 para 29 em bancos locais descartáveis. A comparação da linha completa de um atendimento histórico sintético antes e depois da atualização produziu o mesmo hash. |

Para implantação, a F3 depende da cadeia anterior, incluindo a F1. Aplicar as migrations pendentes no ambiente de destino em uma janela autorizada, antes de servir a nova versão. Não há retroalimentação de notificações nem atribuição de notas a atendimentos anteriores. A criação presencial segue o limite atual de profissionais ativos. Esta fase usa Next.js e Supabase já presentes no projeto e não acrescenta serviços pagos.
