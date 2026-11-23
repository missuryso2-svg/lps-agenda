# G2 · Preparação técnica para Google AdSense

**Estado:** preparação inativa. Nenhum anúncio real é carregado nesta versão. A aprovação do domínio, a conta/publisher da LPS Solutions e a CMP não foram comprovados ou configurados.

## Arquitetura

- A integração fica isolada da tela de reserva. O candidato a posicionamento é o documento independente `/agendar/[slug]/sobre`, renderizado por `src/app/agendar/[slug]/sobre/route.ts`.
- A ficha contém somente nome e descrição pública da barbearia, descrição/duração dos serviços e horários. A consulta usa o fluxo público existente; a resposta não renderiza clientes, contatos, reservas, tokens, equipe privada ou dados financeiros.
- O link **Sobre a barbearia** aparece no rodapé de `/agendar/[slug]` quando há conteúdo público básico. Nenhum código de anúncio é inserido no formulário, no botão de reserva, na confirmação, no QR (`/dashboard/qr`), em páginas privadas ou no layout global.
- Quando todos os gates de servidor passam, o HTML pode conter apenas a área escondida e o adaptador local `public/booking-ad-preferences.js`. A tag AdSense só é criada após ação explícita, API TCF disponível e consentimento validado. A área fica escondida se o script falhar ou o inventário não preencher.
- `public/booking-guide.css` limita o espaço à largura disponível e mantém a ficha utilizável em telas pequenas e grandes.

## Bloqueios e elegibilidade

A ficha é uma composição automática de descrição comercial, catálogo e horário; isso **não comprova conteúdo original ou valor suficiente para aprovação AdSense**. A documentação do Google recomenda conteúdo próprio, relevante e útil, navegação clara e boa experiência. No estado atual, não presumimos elegibilidade. Um responsável deve avaliar conteúdo e políticas página a página; qualquer mudança nos campos exibidos invalida a revisão pela nova revisão SHA-256.

Também não existe no repositório uma CMP certificada, a sua inicialização web, nem a ponte de preferências `window.lpsOpenAdPreferences`. Não criar um banner próprio para simular consentimento. Enquanto essa integração real não for escolhida, instalada e homologada, `ADSENSE_CMP_READY` deve permanecer `false`; mesmo que a configuração esteja incompleta, o adaptador falha fechado e não carrega AdSense.

## Configuração de ambiente

Os valores do `.env.example` são deliberadamente vazios/desligados:

| Variável | Requisito para futura ativação |
| --- | --- |
| `ADSENSE_ENABLED` | `false` agora; `true` somente após todos os itens deste documento. |
| `ADSENSE_PUBLISHER_ID` | ID oficial da conta AdSense da LPS Solutions (`ca-pub-` seguido dos 16 dígitos fornecidos pelo Google). Não usar ID de exemplo ou de terceiro. |
| `ADSENSE_BOOKING_SLOT` | Slot numérico criado na mesma conta LPS Solutions. |
| `ADSENSE_DOMAIN_APPROVED` | `true` somente depois que o site/domínio estiver aprovado na conta AdSense. |
| `ADSENSE_APPROVED_ORIGIN` | Origem HTTPS exata aprovada, sem caminho, porta ou credenciais; deve coincidir com `NEXT_PUBLIC_APP_URL`. |
| `ADSENSE_REVIEWED_SHOPS` | Lista separada por vírgulas no formato `slug@<sha256>` para revisões editoriais atuais. Obter o hash no cabeçalho `X-LPS-Content-Revision` da ficha. Qualquer alteração de descrição, serviço/duração ou horário exige nova revisão. |
| `ADSENSE_PRIVACY_REVIEWED` | `true` apenas após revisão jurídica e operacional da política, fornecedores, finalidades, retenção e mecanismo de escolha/retirada. Não é certificação jurídica por si só. |
| `ADSENSE_CMP_READY` | `true` apenas depois de integrar uma CMP web real, certificada pelo Google quando aplicável, carregar a sua API antes da publicidade e testar a ponte de abertura de preferências. O ID sozinho não é prova de certificação. |
| `ADSENSE_CMP_ID` | ID IAB da CMP selecionada, confirmado na lista atual do Google. Não inventar. |

`src/features/monetization/placement.ts` exige `NODE_ENV=production`, flag de ativação, aprovação de domínio, origem exata, conteúdo disponível e revisão por hash, revisão de privacidade, CMP pronta e Publisher/slot/ID em formato válido. A rota ainda suprime os controles publicitários quando identifica cookie de sessão. O exemplo de ambiente mantém todos os bloqueios desligados e vazios.

## Privacidade e LGPD

- A ficha e o formulário são documentos diferentes. A integração não consulta nem transmite dados de cliente, telefone, e-mail, dados de reserva ou histórico de uso para criar públicos.
- Se ativado, o Google receberá pelo menos solicitações de rede e poderá receber endereço IP, identificadores do navegador, URL/conteúdo contextual da ficha e sinais da CMP. Isso precisa ser descrito de modo transparente, com fornecedores, propósitos, cookies/identificadores, retenção e mecanismo funcional para mudar/retirar escolhas.
- Não se presume que consentimento seja a única base legal adequada nem que a política atual baste. A LPS Solutions deve validar os papéis de controlador/operador, base legal, contratos, transferências internacionais e direitos dos titulares com assessoria competente; a barbearia continua responsável por seus dados operacionais.
- O código trata Global Privacy Control como bloqueio, exige interação explícita, não inicia anúncios em páginas embutidas ou em URLs com query/hash/referer e não tenta cliques, impressões ou redirecionamentos.
- Para tráfego do EEE, Reino Unido e Suíça, o Google exige CMP certificada integrada ao TCF ao servir anúncios personalizados. Esta preparação exige uma CMP verificada antes de qualquer anúncio, de forma conservadora, mas não substitui análise regional, configuração TCF/TCF vigente nem confirmação da lista de CMPs certificadas.
- A política em `src/app/privacidade/page.tsx` informa que a integração está inativa e descreve, em termos gerais, o tratamento futuro. Ela precisa ser completada com dados reais da CMP/conta antes da ativação.

## Aprovação do domínio e `ads.txt`

1. A LPS Solutions deve adicionar e verificar o domínio em sua própria conta AdSense, aguardar a decisão do Google e confirmar que o conteúdo publicado satisfaz os requisitos atuais.
2. Confirmar que a ficha pública é acessível ao crawler e que a origem HTTPS é a mesma que será configurada em `ADSENSE_APPROVED_ORIGIN`.
3. Depois de obter o ID oficial, adicionar à raiz pública (`/ads.txt`) exatamente a linha de autorização fornecida pelo AdSense. O formato usual é `google.com, pub-<ID_OFICIAL_DA_LPS>, DIRECT, f08c47fec0942fa0`; não publicar o placeholder nem criar `ads.txt` antes de obter os dados oficiais. Verificar a resposta pública e o status no painel AdSense.
4. Revisar periodicamente as instruções e o estado de `ads.txt` no painel; não copiar um arquivo de outra conta.

Referências oficiais:

- [Páginas prontas para AdSense](https://support.google.com/adsense/answer/7299563?hl=pt-BR)
- [Requisitos de CMP certificada no EEE, Reino Unido e Suíça](https://support.google.com/adsense/answer/13554116?hl=pt-BR)
- [Configurar e gerir uma CMP](https://support.google.com/adsense/answer/7670013?hl=pt-BR)
- [Guia de `ads.txt`](https://support.google.com/adsense/answer/12171612?hl=pt-BR)
- [Políticas do programa AdSense](https://support.google.com/adsense/answer/48182?hl=pt-BR)

## Testes e limitações

Os testes automatizados verificam gates de configuração, revisão por hash, escape/renderização da ficha, ausência de script e espaço vazio com anúncios desligados, isolamento de sessão, ausência de dados privados na resposta, pedido de rede apenas depois de escolha/TCF, falha de rede, GPC, largura estreita, CSS responsivo e ausência de código publicitário na reserva e no QR. Nesta execução, `tests/adsense-g2.test.ts` passou (23 testes), a suíte QR passou (19), a reserva pública passou (48) e F3 passou (10).

Validações finais executadas: `npm run typecheck` passou; `npm run lint` passou; `npm run build` passou e gerou `/agendar/[slug]/sobre` como rota dinâmica; `git diff --check` não apontou erros de whitespace. `npm test` executou 762 testes em 36 arquivos: **762 passaram**.

Os testes do adaptador de navegador usam um DOM simulado; **não** comprovam integração com uma CMP certificada, resposta real do Google, elegibilidade do domínio, preenchimento de inventário ou comportamento de anúncios em produção. O build também não equivale à revisão do Google ou jurídica. Antes de configurar CMP, revisar a Content Security Policy do endpoint com os domínios exigidos pelo fornecedor e pelos recursos AdSense escolhidos.

## Checklist de ativação futura

- [ ] Conteúdo original e experiência da ficha revisados por pessoa responsável; aprovação não inferida a partir de campos preenchidos.
- [ ] Domínio da LPS Solutions aprovado no painel AdSense; Publisher ID e slot oficiais conferidos.
- [ ] `ads.txt` contém somente a linha oficial da conta da LPS e está acessível na raiz.
- [ ] CMP selecionada na lista atual de CMPs certificadas do Google para Web, configurada para tráfego/regiões aplicáveis e integrada antes de qualquer solicitação publicitária.
- [ ] `window.__tcfapi` e a ponte de preferências são testadas com recusa, consentimento, alteração e retirada; bloqueio por GPC e falhas de CMP continuam sem anúncios.
- [ ] Política, avisos, fornecedores, finalidades, cookies, bases legais, retenção, contratos e transferência internacional revisados e publicados.
- [ ] Política de segurança/CSP e Network tab revisadas; confirmar que rota de reserva e páginas privadas não fazem requisições a provedores de anúncios.
- [ ] Testes, lint, typecheck e build executados; smoke tests com bloqueador de anúncios e em celular/desktop.
- [ ] Só então configurar origem e revisão hash exatas e, como última etapa operacional, considerar `ADSENSE_ENABLED=true` em produção.

Até o checklist ser aprovado, anúncios reais permanecem desligados. Esta entrega não executa deploy, não publica `ads.txt`, não configura conta Google e não habilita monetização.
