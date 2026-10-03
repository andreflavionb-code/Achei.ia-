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
| Buscar em Shopee, Amazon, AliExpress, Magalu | Possível via APIs de afiliados. Cada uma precisa de aprovação própria. Ainda não implementado (veja "Adicionando um marketplace"). |
| Comprar sem sair do site | **Não é possível.** Nenhum marketplace permite checkout por terceiros. O caminho é o link de afiliado, com comissão por venda. |
| Cobrar por clique das lojas | Exige contrato direto e volume. Comece pela comissão de afiliado. |

## Rodando localmente

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env     # preencha o que tiver (pode deixar vazio no começo)
npm run db:push          # cria o banco SQLite local (achei.db)
npm run dev              # http://localhost:3000
```

Sem credenciais o site roda em **modo de exemplo**: os resultados são fictícios, mas a interface, filtros, ordenação e alertas funcionam. Isso serve para testar o fluxo inteiro.

## Conectando o Mercado Livre (dados reais)

Ser afiliado **não** dá acesso à API de busca. Para o sistema consultar produtos, o Mercado Livre exige um aplicativo registrado. É gratuito e leva alguns minutos:

1. Acesse <https://developers.mercadolivre.com.br/> e entre com sua conta normal do Mercado Livre.
2. Vá em **Minhas aplicações** e crie uma aplicação.
3. Em **URI de redirect**, coloque exatamente: `http://localhost:3000/api/auth/mercadolivre/callback` (em produção, troque pelo seu domínio).
4. Copie o **App ID** para `ML_CLIENT_ID` e a **Secret Key** para `ML_CLIENT_SECRET` no `.env`.
5. Reinicie o `npm run dev` e abra <http://localhost:3000/api/auth/mercadolivre>. Autorize o aplicativo. O token fica salvo no banco e é renovado sozinho.

Depois disso, a busca passa a trazer resultados reais do Mercado Livre.

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
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | Lint |
