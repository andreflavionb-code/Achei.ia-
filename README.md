# Achei

Agregador de ofertas que busca em **10 lojas ao mesmo tempo** (Mercado Livre, Amazon, Magazine Luiza, Casas Bahia, Americanas, Carrefour, KaBuM!, AliExpress, Buscapé e Google Shopping; Shopee pela API de afiliados), ordena **de verdade** do menor para o maior preço (sem o corte de resultados que os sites aplicam), filtra por parcelamento sem juros, novo/usado, origem nacional/internacional e frete, e avisa por e-mail quando um produto aparece dentro do preço que você quer pagar.

## Como funciona

```
usuário -> /api/search -> 10+ coletores em paralelo -> modelo único de oferta
                               |
                               v
             normalização + filtros + ordenação no NOSSO servidor -> lista unificada
```

- **Coletores** (`lib/offers/adapters/`): um por loja. Cada um converte a página ou API da loja para o modelo único `Offer` (`lib/offers/types.ts`), com **preço à vista** (Pix/boleto quando a loja dá desconto) e **preço no cartão** separados, parcelas (com ou sem juros), origem e condição.
- **Busca unificada** (`lib/offers/search.ts`): chama todos em paralelo (20 a 40s), infere "usado" pelo título quando a loja não marca, remove duplicatas, aplica os filtros e ordena pelo critério escolhido (à vista, no cartão ou menor parcela). Se uma loja falhar, as outras continuam e o erro aparece por loja.
- **Cache de 15 minutos** por loja e termo: mudar filtro ou ordenação é instantâneo e não volta às lojas (o botão "Buscar de novo" força). Isso também evita a verificação anti-robô do Mercado Livre, que aparece quando se faz muitas buscas em rajada.
- **Modo preciso** (`lib/offers/relevance.ts`): esconde acessórios e outros modelos (quem busca "iphone 15" não vê iPhone 16 nem capinha). Botão "Mostrar tudo" desliga.
- **Alertas** (`lib/alerts/check.ts` + `instrumentation.ts`): busca salva + preço máximo + e-mail. Enquanto o servidor estiver aberto, refaz as buscas a cada hora e envia e-mail quando acha oferta dentro do preço.
- **Links de afiliado** (`lib/mercadolivre/affiliate.ts`): a compra acontece no marketplace; a comissão vem do link rastreado (etapa 2).

### De onde vêm os dados (verificado em 06/10/2026)

| Loja | Como é lida | Observação |
| --- | --- | --- |
| Amazon | Página pública, requisição direta | Rápida (2-5s). Às vezes a Amazon pede verificação; aí cai para o Chrome escondido. |
| Americanas | API de catálogo (VTEX) | Rápida. Informa "Produto Internacional" e condição. |
| Carrefour | API de busca (VTEX) | Rápida. Vários vendedores (marketplace). |
| KaBuM! | Página pública (JSON embutido) | Rápida. Pix vs. cartão. |
| AliExpress | Página pública em português (JSON embutido) | Rápida. Tudo internacional, preço em reais. |
| Buscapé | Página pública (JSON embutido) | Rede de segurança: melhor oferta por produto entre as lojas que ele monitora. |
| Mercado Livre | **Chrome escondido** | Bloqueia robôs (verificação de conta). Até 200 anúncios por busca. Depois de muitas buscas seguidas pede verificação por alguns minutos; o sistema espera e tenta de novo. Alternativa estável: API oficial (abaixo). |
| Magazine Luiza | **Chrome escondido** | Bloqueia robôs (Akamai). |
| Casas Bahia | **Chrome escondido** | Bloqueia robôs (Akamai); preços carregados por JavaScript. |
| Google Shopping | **Chrome escondido** | Captcha em requisição simples e headless; abre em janela real. Cards orgânicos (preço, loja, parcelas; link para o próprio Google Shopping) + anúncios com link direto para a loja (inclui Mercado Livre, Magalu, Amazon, Shopee). |
| Shopee | API de afiliados | O site bloqueia qualquer automação. Preencha `SHOPEE_APP_ID` e `SHOPEE_APP_SECRET` (affiliate.shopee.com.br > Open API); os links já saem com seu rastreio de afiliado. |

**Chrome escondido**: esses três sites detectam qualquer navegador automatizado em modo invisível (headless), mas aceitam uma janela real. O sistema abre o Google Chrome instalado no seu Mac com um perfil próprio (`.browser-profile/`) e **posiciona a janela fora da tela**: ela existe, mas você não a vê. Se algum site pedir uma verificação manual, rode uma vez com `BROWSER_VISIBLE=1` no `.env`, resolva na janela e volte ao normal; a verificação fica guardada no perfil.

**Mercado Livre e login**: depois de muitas buscas seguidas o ML passa a exigir login ("verificação de conta"). Solução definitiva: `npm run ml:login` abre a janela do Chrome do Achei no Mercado Livre; entre com sua conta uma vez e feche a janela. O login fica salvo no perfil e as buscas voltam a funcionar escondidas. Alternativa sem navegador: API oficial (abaixo).

### O que é e o que não é possível (leia antes de planejar)

| Desejo | Situação real |
| --- | --- |
| Ordenar do menor para o maior sem perder itens | Feito. Buscamos várias páginas de cada loja e ordenamos aqui. |
| Filtrar "sem juros", "novo/usado", "nacional/internacional" | Feito. Onde a loja não informa, o item não é excluído (origem "?"). |
| Comparar preço à vista e no cartão | Feito. Cada oferta mostra os dois quando diferem; a ordenação pode ser por qualquer um ou pela parcela. |
| Comprar sem sair do site | **Não é possível.** Nenhum marketplace permite checkout por terceiros. O caminho é o link de afiliado, com comissão por venda. |
| Cobrar por clique das lojas | Exige contrato direto e volume. Comece pela comissão de afiliado. |

## Rodando localmente

Requisitos: Node 20+.

**No macOS, o jeito mais simples**: dê duplo clique em `iniciar.command` dentro da pasta do projeto. Ele atualiza o código, instala o que faltar, cria o banco, sobe o servidor e abre o navegador. Na primeira vez o macOS pode pedir para liberar o arquivo: clique com o botão direito, "Abrir".

**Pelo terminal** (sempre dentro da pasta do projeto, por exemplo `cd ~/Achei.ia-`):

```bash
npm run setup            # instala tudo, baixa o Chromium, cria o banco e verifica
npm run dev              # http://localhost:3000
```

Depois de cada `git pull`, rode `npm run setup` de novo (dependências e banco podem ter mudado).

Se a porta 3000 estiver ocupada por outro programa, o Next avisa no terminal e usa outra (por exemplo 3001). Abra o endereço que aparece na linha "Local:". O `iniciar.command` já escolhe uma porta livre e abre o navegador no endereço certo.

Se algo não funcionar, `npm run doctor` lista o que está faltando e o comando para corrigir. Para pedir ajuda, mande a saída do `npm run doctor`, a saída completa do `npm run dev` e o que aparece no navegador.

Sem nenhum cadastro o site já busca produtos reais nas 9 lojas da tabela acima. Isso se chama scraping e tem limites:

- Depende do layout dos sites. Quando um site muda o HTML, o coletor para de reconhecer produtos, salva a página em `.debug/` e mostra o erro na interface (os outros sites continuam). Os testes (`npm test`) guardam o formato de cada site para detectar isso.
- O Chrome escondido precisa do Google Chrome instalado (ou do Chromium que `npm run setup` baixa). Ele fica aberto entre buscas enquanto o servidor roda, para ser rápido.
- Para produção com muitos usuários, o caminho certo são as APIs oficiais/afiliados.

Para escolher as fontes: `SOURCES=mercadolivre,magalu` no `.env`, ou pelo botão "Lojas" na interface. Para dados fictícios (teste de interface sem internet): `DEMO_MODE=1`.

### Modo preciso

Os sites misturam acessórios (capa, cabo, bateria, cage) com o produto buscado. O modo preciso, ligado por padrão, mantém só o que:

1. contém no título todos os termos específicos da busca (marca, modelo, qualquer termo com número; palavras genéricas como "camera" não são exigidas);
2. não tem palavra típica de acessório no título (a menos que a própria busca tenha, como "capa iphone 15");
3. não custa menos de 10% da mediana do grupo (pega acessório que escapou das regras anteriores).

A interface mostra quantos itens foram escondidos e tem o botão "Mostrar tudo". Na linha de comando, use `--tudo`.

### Testando pela linha de comando

```bash
npm run probe -- "iphone 15"
npm run probe -- "iphone 15" --sem-juros --nacional --max 4000 --novo
npm run probe -- "iphone 15" --usado --cartao            # só usados, ordenado pelo preço no cartão
npm run probe -- "notebook" --parcela --fontes kabum,amazon   # menor parcela, só nessas lojas
npm test                 # testes dos parsers com HTML de exemplo
```

O `probe` mostra quantos itens cada site devolveu, o erro de cada um que falhou, e confere se a ordenação ficou crescente.

### Senha de acesso

Defina `APP_PASSWORD` no `.env` para que só quem tem a senha use o site. Sem essa variável o site fica aberto (bom para uso local, ruim para publicar).

## Conectando o Mercado Livre pela API oficial (opcional)

Mais estável que ler a página (não depende do Chrome nem sofre a verificação anti-robô), e necessário quando o volume crescer. Ser afiliado **não** dá acesso à API de busca; o Mercado Livre exige um aplicativo registrado. É gratuito e leva alguns minutos. **Basta o App ID e a Secret Key**: com eles no `.env` a busca já funciona com um token de aplicativo, sem precisar autorizar a conta (passo 5, opcional).

1. Acesse <https://developers.mercadolivre.com.br/> e entre com sua conta normal do Mercado Livre.
2. Vá em **Minhas aplicações** e crie uma aplicação.
3. Em **URI de redirect**, coloque exatamente: `http://localhost:3000/api/auth/mercadolivre/callback` (em produção, troque pelo seu domínio).
4. Copie o **App ID** para `ML_CLIENT_ID` e a **Secret Key** para `ML_CLIENT_SECRET` no `.env`.
5. Reinicie o `npm run dev` e abra <http://localhost:3000/api/auth/mercadolivre>. Autorize o aplicativo. O token fica salvo no banco e é renovado sozinho.

Depois disso, a busca do Mercado Livre passa a usar a API no lugar da leitura da página.

### Links de afiliado

1. No painel de afiliados (<https://www.mercadolivre.com.br/afiliados>), gere um link para qualquer produto.
2. Na URL gerada, copie os valores dos parâmetros `matt_word` e `matt_tool` para `ML_AFFILIATE_MATT_WORD` e `ML_AFFILIATE_MATT_TOOL`.
3. Confira no painel se os cliques feitos pelo site estão sendo atribuídos. O formato dos links do programa pode mudar; se não atribuir, compare com um link gerado pelo painel e ajuste.

## Alertas por e-mail

1. Preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`. Com Gmail, use uma **senha de app** (Conta Google > Segurança > Senhas de app).
2. Defina `CRON_SECRET` com qualquer texto longo.
3. Pronto: enquanto o servidor estiver aberto (`iniciar.command` ou `npm run dev`), os alertas são verificados sozinhos a cada hora (`ALERTS_INTERVAL_MIN`, 0 desliga). Em outros ambientes:
   - **Vercel**: o `vercel.json` já agenda `/api/cron/check-alerts` de hora em hora. Basta definir `CRON_SECRET` nas variáveis do projeto.
   - **Outro servidor**: chame `GET /api/cron/check-alerts` com o header `Authorization: Bearer <CRON_SECRET>`, ou rode `npm run alerts:check` no crontab.

Sem SMTP, o e-mail é impresso no console (útil para testar).

Regras do alerta: avisa quando aparece oferta dentro do preço máximo; depois só avisa de novo se o preço cair abaixo do último avisado, ou após 24h. O e-mail tem link para cancelar.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Banco: o SQLite local não persiste na Vercel. Crie um banco gratuito no [Turso](https://turso.tech) e defina `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`. Rode `npm run db:push` uma vez apontando para ele.
3. Defina as outras variáveis do `.env.example`. Em `ML_REDIRECT_URI` e `APP_URL`, use o domínio de produção, e cadastre a mesma redirect URI no aplicativo do Mercado Livre.
4. Depois do deploy, abra `https://seu-dominio/api/auth/mercadolivre` para autorizar.

## Adicionando um marketplace

1. Crie `lib/offers/adapters/<nome>.ts` implementando `MarketplaceAdapter` (`id`, `name`, `transport`, `isConfigured()`, `search()`). Lojas na plataforma VTEX (Americanas, Carrefour, Extra, Pontofrio...) reaproveitam `vtex.ts`; sites que bloqueiam robôs usam `loadAndParse` (requisição direta e, se bloqueado, Chrome escondido).
2. Converta cada item para `Offer`. Campos que a loja não informa ficam `null` (os filtros tratam `null` como "desconhecido").
3. Registre em `lib/offers/adapters/index.ts`, adicione o `SourceId` em `lib/offers/types.ts` e em `SOURCE_IDS` (`lib/offers/parse.ts`), e um teste em `tests/fontes.test.ts` com um trecho real da página.

Próximos candidatos: Shopee (API de afiliados), Pontofrio e Extra (mesmo sistema da Casas Bahia), Fast Shop, Pichau/Terabyte (bloqueiam; Chrome escondido).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:push` | Cria/atualiza as tabelas do banco |
| `npm run alerts:check` | Verifica os alertas uma vez (linha de comando) |
| `npm run probe -- "termo"` | Busca pela linha de comando e mostra o resultado por site |
| `npm run browser:install` | Baixa o Chromium do navegador invisível |
| `npm run ml:login` | Abre a janela do Chrome do Achei no Mercado Livre para você fazer login uma vez |
| `npm run setup` | Instala tudo, baixa o Chromium, cria o banco e roda o doctor |
| `npm run doctor` | Verifica a instalação e diz o que falta |
| `npm test` | Testes dos parsers |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | Lint |
