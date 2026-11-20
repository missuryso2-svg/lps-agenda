# F1 · Planos, fotos da equipe e contato com clientes

A landing page, o cadastro e o painel do proprietário explicam o teste de 168 horas no Básico. A apresentação compartilhada dos planos reúne os benefícios disponíveis e os limites de 1, 5 e 10 profissionais. A área do proprietário consulta a assinatura, a cobertura e o limite efetivos. A consulta comercial usa o WhatsApp configurado e uma mensagem por plano. O visitante escolhe se quer enviá-la. A divulgação não inicia onboarding nem cria cobrança.

Em Equipe, o proprietário edita a foto de um profissional já cadastrado. O formulário exibe a imagem atual, uma prévia local e o resultado de salvar, substituir ou remover. A API exige sessão, vínculo ativo, origem da aplicação e versão esperada da imagem. O banco verifica novamente o proprietário e a versão. Um funcionário com acesso à equipe pode ver a foto. As novas fotos são privadas e não integram o catálogo público.

A migration `20261120170000_private_barber_photos.sql` cria o bucket privado `barber-photos`, sua política de leitura e a operação de substituição. O campo existente `barbers.avatar_url` aponta para um objeto imutável da barbearia e do profissional. Os clientes autenticados não têm escrita direta nesse bucket nem podem alterar o campo de foto. O servidor limita os bytes lidos a 2 MiB, decodifica e verifica o formato JPEG, PNG ou WebP e limita a entrada a 16 megapixels. O Sharp gera uma versão WebP de até 480 × 480 sem metadados da origem.

O ponteiro no banco muda antes de remover a versão antiga. Uma falha de rede de resultado incerto ou uma falha na exclusão pode deixar um objeto sem referência. A política de leitura oculta esses objetos. A reconciliação operacional do Storage deve comparar as referências antes de remover arquivos. URLs HTTPS preexistentes mantêm o tratamento legado.

Em Clientes, o atalho individual abre uma conversa com o telefone validado da ficha. A lista e os detalhes respeitam as permissões existentes. Uma ficha sem número utilizável continua acessível sem ação de WhatsApp.

## Homologação e implantação

- `tests/product-f1.test.ts` cobre normalização de telefones, benefícios e validação/decodificação de imagens.
- `tests/postgres/product-f1.sql` verifica privilégios e isolamento em instalação limpa e atualização de banco descartável.
- `tests/integration/product-f1.mjs` usa sessões reais no Supabase local, Storage e Next. Exercita envio, concorrência na troca, isolamento, remoção e telas a 375 e 1280 pixels.
- Para implantação, aplicar a migration antes da versão que usa o bucket. Configurar a origem pública da aplicação e a chave administrativa exclusivamente no servidor. A comunicação comercial usa `LPS_COMMERCIAL_WHATSAPP`. Onboarding e execução agendada de inadimplência mantêm seus controles próprios.
