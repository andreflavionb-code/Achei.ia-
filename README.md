# Achei

Agregador de ofertas que busca em vários marketplaces ao mesmo tempo, ordena **de verdade** do menor para o maior preço (sem o corte de resultados que os sites aplicam), filtra por parcelamento sem juros, origem nacional/internacional e frete, e avisa por e-mail quando um produto aparece dentro do preço que você quer pagar.

## Como funciona

```
usuário -> /api/search -> adaptadores (Mercado Livre, ...) -> modelo único de oferta
                              |
                              v
                 filtros + ordenação no NOSSO servidor -> lista unificada
```

- **Adaptadores** (`lib/offers/adapters/`): um por marketplace. Cada um converte a resposta da API de origem para o modelo único `Offer` (`lib/offers/types.ts`).
- **Busca unificada** (`lib/offers/search.ts`): chama todos os adaptadores em paralelo, aplica os filtros e ordena por preço. Se um marketplace falhar, os outros continuam.
- **Alertas** (`lib/alerts/check.ts`): busca salva + preço máximo + e-mail. Um job agendado refaz a busca e envia e-mail quando acha oferta dentro do preço.
- **Links de afiliado** (`lib/mercadolivre/affiliate.ts`): a compra acontece no marketplace; a comissão vem do link rastreado.

### O que é e o que não é possível (leia antes de planejar)

| Desejo | Situação real |
| --- | --- |
| Ordenar do menor para o maior sem perder itens | Feito. Buscamos várias páginas sem ordenação e ordenamos aqui. |
| Filtrar "sem juros" e "nacional/internacional" | Funciona onde a API informa. Mercado Livre informa; outros marketplaces informam menos. |
| Buscar em vários sites sem cadastro | Mercado Livre, Magazine Luiza e Amazon: feito, lendo a página pública (frágil, veja abaixo). Shopee, AliExpress, Casas Bahia: só via API de afiliados. |
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

Sem nenhum cadastro o site já busca produtos reais lendo as páginas públicas de busca de **Mercado Livre, Magazine Luiza e Amazon**. Isso se chama scraping e tem limites que você precisa conhecer:

- **Os sites bloqueiam robôs.** Mercado Livre redireciona para uma "verificação de conta", Magazine Luiza usa Akamai (erro 403) e Amazon devolve 503 para servidores. Por isso o sistema tenta primeiro uma requisição simples e, se for bloqueado ou vier vazio, abre um **navegador de verdade** (Google Chrome, se instalado, ou o Chromium do Playwright) com perfil persistente em `.browser-profile/`. **Uma janela do navegador aparece por alguns segundos durante a busca**: é normal, é o sistema lendo as lojas. O modo invisível (`BROWSER_HEADLESS=1`) existe, mas esses sites costumam detectá-lo. Se um site mostrar uma verificação na janela, resolva uma vez; ela fica guardada no perfil.
- Depende do layout dos sites. Quando um site muda o HTML, o coletor para de reconhecer produtos, salva a página em `.debug/` e mostra o erro na interface (os outros sites continuam).
- Shopee, AliExpress e Casas Bahia ainda não entram. Esses só pela API de afiliados (etapa 2) ou pelo mesmo navegador invisível, depois que os três primeiros estiverem estáveis.
- Para produção, o caminho certo são as APIs oficiais. Os coletores de página servem para validar a ideia.

Para escolher as fontes: `SOURCES=mercadolivre,magalu` no `.env`. Para dados fictícios (teste de interface sem internet): `DEMO_MODE=1`.

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
npm test                 # testes dos parsers com HTML de exemplo
```

O `probe` mostra quantos itens cada site devolveu, o erro de cada um que falhou, e confere se a ordenação ficou crescente.

### Senha de acesso

Defina `APP_PASSWORD` no `.env` para que só quem tem a senha use o site. Sem essa variável o site fica aberto (bom para uso local, ruim para publicar).

## Conectando o Mercado Livre pela API oficial (opcional)

Mais estável que ler a página, e necessário quando o volume crescer. Ser afiliado **não** dá acesso à API de busca; o Mercado Livre exige um aplicativo registrado. É gratuito e leva alguns minutos:

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
3. Agende a verificação:
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

1. Crie `lib/offers/adapters/<nome>.ts` implementando `MarketplaceAdapter` (`id`, `name`, `isConfigured()`, `search()`).
2. Converta cada item para `Offer`. Campos que a API não informa ficam `null` (os filtros tratam `null` como "desconhecido").
3. Registre em `lib/offers/adapters/index.ts` e adicione o `SourceId` em `lib/offers/types.ts`.

Próximos candidatos, em ordem de facilidade: Shopee (API de afiliados), AliExpress (API de afiliados), Amazon (Product Advertising API, exige vendas prévias como associado), Magalu e Casas Bahia (via redes como Awin).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:push` | Cria/atualiza as tabelas do banco |
| `npm run alerts:check` | Verifica os alertas uma vez (linha de comando) |
| `npm run probe -- "termo"` | Busca pela linha de comando e mostra o resultado por site |
| `npm run browser:install` | Baixa o Chromium do navegador invisível |
| `npm run setup` | Instala tudo, baixa o Chromium, cria o banco e roda o doctor |
| `npm run doctor` | Verifica a instalação e diz o que falta |
| `npm test` | Testes dos parsers |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | Lint |
