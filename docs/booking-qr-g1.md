# G1 · QR Code de agendamento

O atalho **QR Code de agendamento** fica na Agenda e nas Configurações. A página privada `/dashboard/qr` usa a sessão e a barbearia ativa. Proprietário e funcionário podem apresentar ou baixar o código. A edição de configurações continua restrita. A página ignora parâmetros de tenant na URL.

A origem vem de `NEXT_PUBLIC_APP_URL` na compilação do Next.js. Configure a origem HTTPS do domínio definitivo antes de compilar para distribuição. O endereço codificado contém somente a origem, `/agendar/` e o slug público validado. A imagem PNG é gerada no servidor com o pacote `qrcode`, em preto sobre branco, com margem de quatro módulos. Alterar o domínio ou o slug exige gerar outro cartaz. Em desenvolvimento, um endereço de loopback recebe indicação de prévia e o botão de PDF fica desabilitado. Em produção uma configuração inválida mostra a orientação de configuração.

O cartaz PDF A4 é produzido no navegador com `pdf-lib` quando solicitado. O nome, o convite para agendar, o QR e o link aparecem também em impressão monocromática. O cartaz pode usar a logo pública já cadastrada se for uma imagem raster de até 2 MB em assets da aplicação ou no Storage público configurado. O navegador busca a imagem sem credenciais, com limite de tempo, e mantém o cartaz utilizável se a imagem falhar.

O QR abre o mesmo agendamento público, com as validações de horário, cobertura, rate limit e notificações da agenda existente. A G1 dispensa migration e armazenamento persistente do QR.

## Homologação

- `tests/booking-qr.test.ts` cobre origem, slug, preview, dados indevidos e logos permitidas.
- `tests/integration/booking-qr-g1.mjs` espera uma build com a URL pública de teste `https://agenda.example.org` e o Supabase local exigido por `local-next-qa.mjs`. Usa sessões reais de dois tenants, lê o PNG por jsQR e abre a URL decodificada no navegador. O domínio reservado é interceptado e servido por loopback. O teste preenche o formulário sem login, verifica a exclusão do almoço, confirma a reserva e confere as notificações.
- O teste também baixa o PDF, verifica o A4 e pode salvar os exemplos em `QA_SCREENS`. Na homologação, a página do PDF foi renderizada e seu QR também foi decodificado. A leitura em câmera física e a prova em papel ficam para o domínio e o material definitivos.
