/**
 * Testes dos coletores novos (Casas Bahia, Americanas/Carrefour via VTEX,
 * KaBuM!, AliExpress, Buscapé, Magalu atual) com trechos no formato real
 * capturado em 06/10/2026. Rode: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCasasBahiaHtml } from "../lib/offers/adapters/casasbahia";
import { parseAmericanasJson } from "../lib/offers/adapters/americanas";
import { parseCarrefourJson } from "../lib/offers/adapters/carrefour";
import { parseKabumHtml } from "../lib/offers/adapters/kabum";
import { parseAliExpressHtml } from "../lib/offers/adapters/aliexpress";
import { parseBuscapeHtml } from "../lib/offers/adapters/buscape";
import { parseMagaluHtml } from "../lib/offers/adapters/magalu";
import { applyFilters, sortOffers } from "../lib/offers/filters";
import { parseFilters } from "../lib/offers/parse";

const NOW = "2026-10-06T00:00:00.000Z";

const CB_HTML = `
<div data-testid="product-card-desktop">
  <img class="product-card__image" src="https://imgs.casasbahia.com.br/1582418891/1xg.jpg">
  <h3 class="product-card__title"><a href="https://www.casasbahia.com.br/usado-iphone-15-128gb-preto/p/1582418891"><span>Usado: iPhone 15 128GB Preto Muito Bom - Trocafone</span></a></h3>
  <span class="product-card__discount-text"><span>de</span> <span>R$ 5.629,00</span></span>
  <div data-testid="product-card-installment"><span class="css-1vmkvrm">por R$ 4.479,00 ou em até 6x de R$ 746,50 sem juros ou</span><span aria-hidden="true">R$ 4.479,00</span></div>
  <div data-testid="product-card-highlight-price-section"><div class="product-card__highlight-price">R$ 4.479,00</div></div>
  <ul class="product-card__flags-list"><li><span>Produto Usado</span></li></ul>
</div>
<div data-testid="product-card-desktop">
  <h3 class="product-card__title"><a href="/iphone-15-128gb-azul/p/55555555"><span>iPhone 15 128GB Azul</span></a></h3>
  <div data-testid="product-card-installment"><span class="css-1vmkvrm">por R$ 4.999,00 ou em até 10x de R$ 499,90 sem juros ou</span></div>
  <div data-testid="product-card-highlight-price-section"><div class="product-card__highlight-price">R$ 4.599,00</div><div class="product-card__highlight-price-description">no Pix</div></div>
</div>`;

test("Casas Bahia: preço, parcelas, Pix e usado", () => {
  const offers = parseCasasBahiaHtml(CB_HTML, NOW);
  assert.equal(offers.length, 2);
  assert.equal(offers[0].price, 4479);
  assert.equal(offers[0].cardPrice, null);
  assert.equal(offers[0].originalPrice, 5629);
  assert.deepEqual(offers[0].installments, { count: 6, amount: 746.5, rate: 0, interestFree: true });
  assert.equal(offers[0].condition, "used");
  assert.equal(offers[0].title, "iPhone 15 128GB Preto Muito Bom - Trocafone");
  assert.equal(offers[1].price, 4599);
  assert.equal(offers[1].cardPrice, 4999);
  assert.equal(offers[1].condition, "new");
  assert.equal(offers[1].url, "https://www.casasbahia.com.br/iphone-15-128gb-azul/p/55555555");
});

const VTEX_PRODUCT = {
  productId: "3708791",
  productName: "Apple iPhone 15 de 256GB - Preto",
  linkText: "apple-iphone-15-de-256gb-preto-7494887036",
  link: "https://www.americanas.com.br/apple-iphone-15-de-256gb-preto-7494887036/p",
  "Produto Internacional": ["Não"],
  "Condição do Item": ["Novo"],
  items: [
    {
      itemId: "3708792",
      nameComplete: "Apple iPhone 15 de 256GB - Preto",
      images: [{ imageUrl: "https://americanas.vteximg.com.br/arquivos/ids/426442/x.jpg" }],
      sellers: [
        {
          sellerId: "TALD48872083814834",
          sellerName: "Loja iPlace",
          commertialOffer: {
            Price: 5349, ListPrice: 5990.88, AvailableQuantity: 1,
            Installments: [
              { NumberOfInstallments: 1, Value: 5349, InterestRate: 0, TotalValuePlusInterestRate: 5349, PaymentSystemName: "Visa" },
              { NumberOfInstallments: 1, Value: 5081.55, InterestRate: 0, TotalValuePlusInterestRate: 5081.55, PaymentSystemName: "Pix" },
              { NumberOfInstallments: 8, Value: 668.62, InterestRate: 0, TotalValuePlusInterestRate: 5349, PaymentSystemName: "Visa" },
              { NumberOfInstallments: 12, Value: 500.84, InterestRate: 1.84, TotalValuePlusInterestRate: 6010.08, PaymentSystemName: "Visa" },
            ],
          },
        },
        { sellerId: "2", sellerName: "Esgotado", commertialOffer: { Price: 100, AvailableQuantity: 0, Installments: [] } },
      ],
    },
  ],
};

test("VTEX (Americanas): à vista no Pix, cartão, maior parcela sem juros, internacional e condição", () => {
  const offers = parseAmericanasJson([VTEX_PRODUCT], NOW);
  assert.equal(offers.length, 1);
  const o = offers[0];
  assert.equal(o.price, 5081.55);
  assert.equal(o.cardPrice, 5349);
  assert.equal(o.originalPrice, 5990.88);
  assert.deepEqual(o.installments, { count: 8, amount: 668.62, rate: 0, interestFree: true });
  assert.equal(o.isInternational, false);
  assert.equal(o.condition, "new");
  assert.equal(o.sellerName, "Loja iPlace");
  assert.equal(o.url, VTEX_PRODUCT.link);
});

test("VTEX (Carrefour): lê products[] e monta o link; vitrine conta como usado", () => {
  const product = { ...VTEX_PRODUCT, productName: "iPhone 15 128GB Rosa - Vitrine Apple", link: "/iphone-15-vitrine/p" };
  delete (product as Record<string, unknown>)["Condição do Item"];
  const offers = parseCarrefourJson({ products: [product], recordsFiltered: 1 }, NOW);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].url, "https://www.carrefour.com.br/iphone-15-vitrine/p");
  assert.equal(offers[0].condition, "used");
});

const KABUM_HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      data: JSON.stringify({
        catalogServer: {
          meta: { totalPagesCount: 1 },
          data: [
            { code: 519144, name: "Apple Iphone 15 128GB Rosa", friendlyName: "apple-iphone-15-128gb-rosa", sellerName: "Magalu", image: "https://images.kabum.com.br/x.jpg", price: 4221.11, priceWithDiscount: 3799, oldPrice: 0, maxInstallment: "10x de R$ 422,11" },
            { code: 1, name: "Produto indisponível", price: 10, available: false },
          ],
        },
      }),
    },
  },
})}</script></body></html>`;

test("KaBuM!: Pix como à vista, cartão como base da parcela sem juros", () => {
  const { offers, totalPages } = parseKabumHtml(KABUM_HTML, NOW);
  assert.equal(totalPages, 1);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 3799);
  assert.equal(offers[0].cardPrice, 4221.11);
  assert.deepEqual(offers[0].installments, { count: 10, amount: 422.11, rate: 0, interestFree: true });
  assert.equal(offers[0].sellerName, "Magalu");
  assert.equal(offers[0].url, "https://www.kabum.com.br/produto/519144/apple-iphone-15-128gb-rosa");
});

const ALI_HTML = `<script>window._dida_config_ = {"x":1,"itemList":{"content":[{"productId":"1005007488760200","title":{"displayTitle":"Apple iPhone 15 128GB Azul"},"image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/a.jpg"},"prices":{"originalPrice":{"currencyCode":"BRL","minPrice":7299},"salePrice":{"currencyCode":"BRL","minPrice":4094.11,"formattedPrice":"R$ 4.094,11"}},"store":{"storeName":"Loja X"}},{"productId":"2","title":{"displayTitle":"Sem preço"}}]}};</script>`;

test("AliExpress: lê itemList.content, internacional, preço em reais", () => {
  const offers = parseAliExpressHtml(ALI_HTML, NOW);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 4094.11);
  assert.equal(offers[0].originalPrice, 7299);
  assert.equal(offers[0].isInternational, true);
  assert.equal(offers[0].imageUrl, "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg");
  assert.equal(offers[0].url, "https://pt.aliexpress.com/item/1005007488760200.html");
});

const BUSCAPE_HTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    initialReduxState: {
      hits: {
        pagination: { nbPages: 3 },
        hits: [
          { type: "product", objectId: "product12534144", name: "iPhone 15 128GB 6GB", price: 3799, hasInterest: false, installments: { amount_months: 10, price: 379.9, total_value: 3799 }, bestOffer: { merchantName: "Magazine Luiza" }, storeCount: 6, image: "https://i.zst.com.br/a.jpg", url: "/celular/smartphone-apple-iphone-15" },
          { type: "article", objectId: "a1", name: "Vale a pena?", price: 0 },
        ],
      },
    },
  },
})}</script>`;

test("Buscapé: lê hits de produto, ignora artigos", () => {
  const { offers, totalPages } = parseBuscapeHtml(BUSCAPE_HTML, NOW);
  assert.equal(totalPages, 3);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 3799);
  assert.equal(offers[0].sellerName, "Magazine Luiza (+5 lojas)");
  assert.deepEqual(offers[0].installments, { count: 10, amount: 379.9, rate: 0, interestFree: true });
  assert.equal(offers[0].url, "https://www.buscape.com.br/celular/smartphone-apple-iphone-15");
});

const MAGALU_HTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      data: {
        search: {
          pagination: { page: 1, pages: 25 },
          items: [
            {
              id: "238035700", title: 'Apple iPhone 15 256GB Azul 6,1" 48MP iOS 5G', available: true,
              image: "https://a-static.mlcdn.com.br/{w}x{h}/apple/238035700/a.jpg", path: "/apple-iphone-15-256gb-azul/p/238035700/te/ip15/",
              offers: [{ price: 5443, listPrice: 8099, bestPrice: { paymentMethodId: "pix", totalAmount: 4898.7 }, bestInstallmentPlan: { installment: 10, installmentAmount: 544.3, paymentMethodDescription: "sem juros", totalAmount: 5443 }, seller: { id: "lojaiplace" } }],
            },
            { id: "1", title: "Indisponível", available: false, offers: [{ price: 1 }] },
          ],
        },
      },
    },
  },
})}</script>`;

test("Magazine Luiza (formato atual): Pix à vista, cartão, parcelas sem juros, vendedor", () => {
  const offers = parseMagaluHtml(MAGALU_HTML, NOW);
  assert.equal(offers.length, 1);
  const o = offers[0];
  assert.equal(o.price, 4898.7);
  assert.equal(o.cardPrice, 5443);
  assert.equal(o.originalPrice, 8099);
  assert.deepEqual(o.installments, { count: 10, amount: 544.3, rate: 0, interestFree: true });
  assert.equal(o.sellerName, "lojaiplace");
  assert.equal(o.imageUrl, "https://a-static.mlcdn.com.br/280x210/apple/238035700/a.jpg");
  assert.equal(o.url, "https://www.magazineluiza.com.br/apple-iphone-15-256gb-azul/p/238035700/te/ip15/");
});

test("ordenação por cartão e por parcela; filtro de usados", () => {
  const all = [
    ...parseCasasBahiaHtml(CB_HTML, NOW),
    ...parseKabumHtml(KABUM_HTML, NOW).offers,
    ...parseMagaluHtml(MAGALU_HTML, NOW),
  ];
  const byCard = sortOffers(all, "card").map((o) => o.cardPrice ?? o.price);
  for (let i = 1; i < byCard.length; i++) assert.ok(byCard[i - 1] <= byCard[i]);
  const byInst = sortOffers(all, "installment").map((o) => o.installments?.amount ?? o.price);
  for (let i = 1; i < byInst.length; i++) assert.ok(byInst[i - 1] <= byInst[i]);

  const usados = applyFilters(all, { ...parseFilters({ condition: "used" }) });
  assert.equal(usados.length, 1);
  assert.equal(usados[0].source, "casasbahia");
});

test("parseFilters: newOnly antigo vira condition=new; sources e sort", () => {
  const f = parseFilters({ newOnly: "1", sort: "card", sources: "mercadolivre,amazon,invalida" });
  assert.equal(f.condition, "new");
  assert.equal(f.sort, "card");
  assert.deepEqual(f.sources, ["mercadolivre", "amazon"]);
  assert.equal(parseFilters({}).sources, null);
});

import { parseGoogleShoppingHtml } from "../lib/offers/adapters/googleshopping";
import { parseShopeeNodes, signShopee } from "../lib/offers/adapters/shopee";

const GS_HTML = `
<g-inner-card><div><div>
  <div><div style="-webkit-line-clamp:1">Apple iPhone 15</div></div>
  <div><div aria-label="R$&nbsp;3.799,00 agora. 10 parcelas de R$&nbsp;422,11. " role="group"><span>R$&nbsp;3.799,00 agora</span></div></div>
  <div><span>Magalu e mais</span></div>
  <div>Devolução em até 7 dia(s)</div>
</div></div><img src="https://encrypted-tbn0.gstatic.com/x.jpg"></g-inner-card>
<g-inner-card><div><div>
  <div><div style="-webkit-line-clamp:1">Apple iPhone 15</div></div>
  <div><div aria-label="R$&nbsp;3.799,00 agora. 10 parcelas de R$&nbsp;422,11. " role="group"></div></div>
  <div><span>Magalu e mais</span></div>
</div></div></g-inner-card>
<div class="pla-unit-container"><div><div><span>Promoção</span></div></div>
  <div><a href="https://www.mercadolivre.com.br/apple-iphone-15-128-gb-azul/p/MLB2000087240?from=gshop"><div><img src="data:image/png;base64,xx"></div></a></div>
  <div><span>Apple iPhone 15 (128 GB) - Azul - Excelente (Recondicionado)</span></div>
  <div><span>R$&nbsp;2.835,00</span><span>&nbsp;3.035</span></div>
  <div><span>Mercado Livre</span> (9k+)</div>
</div>`;

test("Google Shopping: cards orgânicos (sem link direto) e anúncios (link da loja), sem duplicar", () => {
  const offers = parseGoogleShoppingHtml(GS_HTML, NOW);
  assert.equal(offers.length, 2);
  const [org, pla] = offers;
  assert.equal(org.title, "Apple iPhone 15");
  assert.equal(org.price, 3799);
  assert.equal(org.sellerName, "Magalu");
  assert.deepEqual(org.installments, { count: 10, amount: 422.11, rate: null, interestFree: null });
  assert.ok(org.url.includes("udm=28"));
  assert.equal(org.imageUrl, "https://encrypted-tbn0.gstatic.com/x.jpg");
  assert.equal(pla.title, "Apple iPhone 15 (128 GB) - Azul - Excelente (Recondicionado)");
  assert.equal(pla.price, 2835);
  assert.equal(pla.originalPrice, 3035);
  assert.equal(pla.sellerName, "Mercado Livre");
  assert.ok(pla.url.startsWith("https://www.mercadolivre.com.br/"));
});

test("Shopee (API de afiliados): nós viram ofertas com offerLink; assinatura SHA256", () => {
  const offers = parseShopeeNodes(
    [
      { itemId: 123, productName: "iPhone 15 128GB", priceMin: 3899.9, priceMax: 4100, imageUrl: "https://cf.shopee.com.br/a.jpg", shopName: "Loja X", productLink: "https://shopee.com.br/p/123", offerLink: "https://s.shopee.com.br/abc" },
      { itemId: 124, productName: "Sem preço", priceMin: 0 },
    ],
    NOW,
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 3899.9);
  assert.equal(offers[0].url, "https://s.shopee.com.br/abc");
  assert.equal(offers[0].sellerName, "Loja X");
  assert.equal(signShopee("1", "s", "{}", 10), signShopee("1", "s", "{}", 10));
  assert.notEqual(signShopee("1", "s", "{}", 10), signShopee("1", "s", "{}", 11));
});
