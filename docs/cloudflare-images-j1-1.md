# LPS Agenda — Cloudflare Images J1.1

25/11/2026 · `codex/cloudflare-j1` · base preservada em `a6c6919`

**GO técnico local para o processamento de imagens. NO-GO para publicação.**
Os dois runtimes produziram WebP válido e o gravaram no Supabase de QA. O
Workers foi exercitado com o Images Binding local de baixa fidelidade.
A confirmação do comportamento e da franquia da conta com o binding hospedado
continua condicionada à autorização e à homologação. O lançamento comercial
permanece em NO-GO.

## Bloqueio e solução

O Sharp 0.35.5 depende de um módulo nativo e do libvips. O build OpenNext da
J1 concluía em Linux, mas o carregamento do módulo nativo no workerd falhava.
A compatibilidade Node do Workers não fornece o carregador de add-ons
nativos exigido nesse caminho. A rota falhava antes de produzir WebP.
[Diagnóstico J1](qa-j1/sharp-workerd.log).

O upload autenticado seleciona um `ImageProcessor` no servidor. A configuração
Wrangler seleciona Cloudflare e declara o binding exclusivo `UPLOAD_IMAGES`
com `remote: false` para a prova. O processador obtém o binding com
`getCloudflareContext()`, consulta formato e dimensões e transforma o stream
em WebP. A seleção do Workers nunca chama Sharp, inclusive se o binding estiver
ausente. Node/Vercel continua a usar o Sharp com libvips e seus parâmetros
anteriores de qualidade, recorte e validação. Nenhum novo pacote foi necessário.
[Bindings no OpenNext](https://opennext.js.org/cloudflare/bindings).

### Caminho da imagem

1. A rota existente autentica o proprietário e valida origem, tenant, contexto,
   versão esperada e orçamento por tenant antes de decodificar. A leitura do
   corpo fica limitada a 2 MiB.
2. O pré-filtro compara MIME, assinatura literal e container JPG, PNG ou
   WebP. Limita a 16.000.000 pixels antes do decoder, recusa contêineres
   truncados, blocos de animação WebP/APNG, JPEG de vários quadros e CRC PNG
   inconsistente. O parser é estrutural. A confirmação de pixels exige
   decodificação e reencodificação pelo engine escolhido.
3. O binding compara o MIME e as dimensões declarados pelo decoder com a
   inspeção estrutural. `info()` não fornece uma garantia documentada de
   contagem de quadros, por isso a recusa de animação precede a chamada.
   `anim: false` é apenas defesa adicional na saída. O perfil da foto
   recorta no centro até 480 × 480 sem ampliar. O da logo preserva proporção
   e transparência até 1200 × 1200, sem cortar. A orientação é usada para
   validar as dimensões esperadas.
4. A saída precisa ser WebP estático bem formado, com dimensões coerentes
   e tamanho compatível com o bucket. Limite de 512 KiB para foto e 2 MiB para
   logo. EXIF, XMP e ICC são retirados da saída. O perfil de logo só tenta
   outra qualidade se a saída exceder o teto.
5. O WebP processado segue para o mesmo Supabase Storage, com chave
   versionada. As rotas e RPCs continuam decidindo CAS, substituição, remoção
   e reconciliação. A leitura usa o objeto pronto do Storage. O binding
   exclusivo de upload não é o binding `IMAGES` do otimizador de leitura do
   OpenNext.

Se o binding faltar, estiver indisponível, devolver resultado inválido ou
recusar por franquia, a rota falha antes de escrever no Storage e conserva a
referência atual. Formato inválido recebe 400. Indisponibilidade e franquia
esgotada recebem 503. Se o backend de Storage recusar a escrita, a troca da
referência não acontece. A reconciliação administrativa de logos e o
tratamento de perda de resposta seguem o fluxo anterior. A possibilidade de
fotos órfãs após falhas ambíguas de transporte continua como risco residual.
Não houve alteração nos buckets, nas permissões ou no banco hospedado.

## Arquivos

| Área | Arquivos |
| --- | --- |
| Limites, seleção e verificação de saída | `src/lib/security/image-decoder.ts`, `image-container.ts` |
| Engines separados | `src/lib/security/image-processor-node.ts`, `image-processor-cloudflare.ts` |
| Perfis e leitura de uploads | `src/features/barbers/photo.ts`, `src/features/barbershop/logo-image.ts` |
| Binding e tipos | `wrangler.j1.jsonc` e contrato mínimo de `UPLOAD_IMAGES` no processador Cloudflare, conferido com Wrangler types |
| Prova e regressões | `tests/fixtures/upload-images.mjs`, `tests/image-cloudflare.test.ts`, `tests/barbershop-logo.test.ts`, `tests/integration/j11-images.mjs` |
| Investigação de carga | `tests/integration/j11-timeout-probe.mjs` |

## Custos e alternativas

A tabela pública vigente informa até **5.000 transformações únicas/mês**
no Images Free e erro de franquia **9422** após o limite para transformações
novas. A cobrança do binding usa o mesmo modelo por transformação única e
`info()` é gratuito. No plano pago, o excedente publicado é US$ 0,50 por mil
transformações únicas, após as 5.000 incluídas. Formato e qualidade não
distinguem uma transformação para contagem. Workers e Images têm franquias
separadas. O armazenamento de saída permanece no custo atual do Supabase.
[Preços do Images](https://developers.cloudflare.com/images/pricing/).

O tutorial de upload para R2 exige Images Paid e inclui hospedagem que
este fluxo não utiliza. A documentação de preços descreve a franquia de
transformações e o changelog descreve a cobrança do binding. Confirmar na
conta aprovada se o binding pode ser habilitado no Free e se a assinatura
não é legada, antes de depender dessa franquia. A prova local não comprova
entitlement. [Tutorial](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/)
e [alteração da cobrança do binding](https://developers.cloudflare.com/changelog/post/2026-07-01-binding-unique-transformations/).

Se a homologação revelar diferenças de segurança ou custo, considerar
WASM com codecs mantidos e consumo de memória previsível, comparando tempo
de CPU, cold start, bundle, qualidade e política de atualização. A alternativa
é um serviço Node isolado com o Sharp existente, autenticação de serviço e
limites de bytes, pixels, concorrência e tempo. Ele facilita paridade de
decoder, acrescentando uma fronteira de confiança, latência e operação.
Nenhuma alternativa foi contratada.

## Verificação local

Os logs sanitizados ficam em [qa-j1-1](qa-j1-1/README.md). A suíte HTTP
usa somente o Supabase descartável. Prova os três formatos nas duas rotas e
valida os bytes recuperados, orientação, recorte, proporção, alpha e ausência
de metadados desnecessários. Verifica origens e papéis inválidos, acesso entre
tenants, limite de bytes e pixels, SVG, MIME divergente, arquivos corrompidos,
WebP de dois quadros e marcador APNG. Exercita substituição, dois uploads
concorrentes com mesma versão, exclusão obsoleta, exclusão válida e contagem
dos objetos após falhas. Vitest simula indisponibilidade, franquia 9422,
saída incorreta ou excessiva e falha de Storage, inclusive com referência
anterior. A reconciliação administrativa permanece coberta pela regressão
I3.1. [Evidência original de reconciliação](qa-i4/i4-http-i3-logo.log).

Build Next, build OpenNext em Linux, Vitest, TypeScript, ESLint e
`git diff --check` fazem parte da evidência. Para repetir, seguir o setup
do [QA J1](cloudflare-migration-j1.md#reprodução-local), usar a build atual e
rodar `node tests/integration/j11-images.mjs workers` com a porta 59331.
Para Node, rodar `node tests/integration/j11-images.mjs node` com a build
Next e a porta 59330. Ambos usam API Supabase local na porta 59321 e
variam apenas o processador.

### Medições locais

| Medida | Resultado |
| --- | --- |
| Latência HTTP dos seis uploads válidos em Node | 361 a 476 ms, mediana 384 ms |
| Latência HTTP dos seis uploads válidos no Workers local | 340 a 441 ms, mediana 393 ms |
| CPU acumulada dos dois processos workerd durante a suíte HTTP completa | 0,97 s, a partir de 97 ticks a 100 Hz |
| Maior pico de RSS registrado no processo workerd principal | 290.256 KiB |
| Handler OpenNext | 8.858.308 bytes, 2.397.065 com gzip. A base J1 tinha 8.847.734 bytes sem gzip |
| JavaScript do bundle local Wrangler | 13.760.881 bytes, 2.982.375 com gzip |

A latência inclui sessão, limitador e Supabase local. A CPU e a memória são
amostras de processos inteiros do ambiente de desenvolvimento. O emulador
executa o codec local fora do isolate. Esses números não representam CPU
por invocação, uso de memória do isolate ou limites do edge. Os 73 assets
públicos do build foram conferidos contra a chave administrativa do QA
e nenhum continha o valor.

### Quatro timeouts da I4

Mantido o prazo de 20 s. O probe aceita uma rota e um estágio por rodada:
`node tests/integration/j11-timeout-probe.mjs login 1`, por exemplo. Captura
ID de correlação sintético, status, tempo até os headers, tempo total, falha
antes dos headers ou no corpo, causa de transporte, atraso do loop do cliente
e amostras de backends/locks antes, durante e depois da rajada. O ensaio
de calibração usou uma requisição. Os 100 simultâneos não foram repetidos.

Na investigação, correlacionar o ID com logs do ingresso e spans temporários
por chamada para Auth e Data API no QA, além de CPU, RSS e I/O do servidor
Next/PostgreSQL. Começar pelo cenário específico que apresentar falha,
escalar 10, 25, 50 e 100 separadamente e parar em erro. A calibração não
atribui os quatro timeouts originais.

## Homologação obrigatória

- Com autorização, repetir positivos e negativos no binding real em ambiente
  protegido, incluindo PNG com CRC válido e dados comprimidos inválidos,
  JPEG progressivo com corrupção interna, WebP com quadro corrompido,
  animações e limites. O modo local usa a implementação offline de
  fidelidade reduzida. Garante o caminho da aplicação e os controles próprios,
  com cobertura parcial da implementação hospedada.
- Comparar recorte, orientação EXIF, gerenciamento de cor, transparência,
  qualidade e remoção de metadados. Validar fallback, custo real, ruptura
  de franquia, tempo, memória e CPU por invocação no edge.
- Exercitar Supabase Storage, CAS e reconciliação com falha de rede e
  resposta ambígua. Preservar a pendência de retenção de fotos privadas
  órfãs e a vulnerabilidade média das transições diretas de atendimentos.
- Homologar origem canônica e headers encaminhados, CSP estrita, rate
  limiting, autenticação, abuso e permissões efetivas da Data API.
  A rota de rollback para a Vercel continua conforme a J1.
