/**
 * Testes dos parsers com trechos de HTML no formato que os sites usam.
 * Rode: npm test
 *
 * Eles provam que a extração (preço, parcelas, origem, condição) funciona
 * para esse formato. Se um site mudar o layout, o coletor salva o HTML em
 * .debug/ e o fixture aqui deve ser atualizado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBRL, parseInstallments, findProductArrays } from "../lib/offers/html";
import { parseMercadoLivreHtml } from "../lib/offers/adapters/mercadolivre-web";
import { parseAmazonHtml } from "../lib/offers/adapters/amazon";
import { parseMagaluHtml } from "../lib/offers/adapters/magalu";
import { applyFilters, sortByPriceAsc } from "../lib/offers/filters";

const NOW = "2026-01-01T00:00:00.000Z";

test("parseBRL entende formatos brasileiros", () => {
  assert.equal(parseBRL("R$ 1.234,56"), 1234.56);
  assert.equal(parseBRL("1.234"), 1234);
  assert.equal(parseBRL("R$ 99,9"), 99.9);
  assert.equal(parseBRL("sem preço"), null);
});

test("parseInstallments lê parcelas com e sem juros", () => {
  assert.deepEqual(parseInstallments("em 12x R$ 103,25 sem juros"), {
    count: 12,
    amount: 103.25,
    rate: 0,
    interestFree: true,
  });
  const comJuros = parseInstallments("em 10x de R$ 150,00");
  assert.equal(comJuros?.count, 10);
  assert.equal(comJuros?.interestFree, false);
  assert.equal(parseInstallments("à vista"), null);
});

const ML_HTML = `
<ol class="ui-search-layout">
  <li class="ui-search-layout__item">
    <div class="poly-card">
      <img class="poly-component__picture" src="https://http2.mlstatic.com/a.jpg">
      <span class="poly-component__seller">Por Apple Store</span>
      <h3 class="poly-component__title-wrapper"><a class="poly-component__title" href="https://www.mercadolivre.com.br/apple-iphone-15-128-gb/p/MLB27385364#polycard">Apple iPhone 15 (128 GB) - Preto</a></h3>
      <s class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__fraction">5.999</span></s>
      <div class="poly-price__current"><span class="andes-money-amount"><span class="andes-money-amount__fraction">4.299</span><span class="andes-money-amount__cents">90</span></span></div>
      <span class="poly-price__installments">em 12x R$ 358,33 sem juros</span>
      <div class="poly-component__shipping">Frete grátis</div>
    </div>
  </li>
  <li class="ui-search-layout__item">
    <div class="poly-card">
      <a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-3456789012-iphone-15-usado-_JM">iPhone 15 128gb</a>
      <span class="poly-component__item-condition">Usado</span>
      <div class="poly-price__current"><span class="andes-money-amount__fraction">2.850</span></div>
      <span class="poly-price__installments">em 10x R$ 330,00</span>
      <span class="poly-component__shipped-from">Internacional</span>
    </div>
  </li>
</ol>`;

test("Mercado Livre: extrai preço, parcelas, origem e condição", () => {
  const offers = parseMercadoLivreHtml(ML_HTML, NOW);
  assert.equal(offers.length, 2);

  const [novo, usado] = offers;
  assert.equal(novo.externalId, "MLB27385364");
  assert.equal(novo.price, 4299.9);
  assert.equal(novo.originalPrice, 5999);
  assert.equal(novo.installments?.count, 12);
  assert.equal(novo.installments?.interestFree, true);
  assert.equal(novo.freeShipping, true);
  assert.equal(novo.isInternational, false);
  assert.equal(novo.condition, "new");
  assert.equal(novo.sellerName, "Apple Store");

  assert.equal(usado.externalId, "MLB3456789012");
  assert.equal(usado.price, 2850);
  assert.equal(usado.installments?.interestFree, false);
  assert.equal(usado.isInternational, true);
  assert.equal(usado.condition, "used");
});

const AMAZON_HTML = `
<div data-component-type="s-search-result" data-asin="B0CHX1W1XY">
  <h2><a><span>Apple iPhone 15 (128 GB) — Preto</span></a></h2>
  <img class="s-image" src="https://m.media-amazon.com/x.jpg">
  <span class="a-price"><span class="a-offscreen">R$ 4.499,00</span></span>
  <span class="a-price a-text-price"><span class="a-offscreen">R$ 5.299,00</span></span>
  <div class="a-row">em até 10x R$ 449,90 sem juros</div>
  <div class="a-row">Frete GRÁTIS</div>
</div>
<div data-component-type="s-search-result" data-asin="B0ABCDEFGH">
  <h2><span>Capa para iPhone 15</span></h2>
  <span class="a-price"><span class="a-offscreen">R$ 39,90</span></span>
</div>`;

test("Amazon: extrai cards e ignora preço riscado", () => {
  const offers = parseAmazonHtml(AMAZON_HTML, NOW);
  assert.equal(offers.length, 2);
  assert.equal(offers[0].externalId, "B0CHX1W1XY");
  assert.equal(offers[0].price, 4499);
  assert.equal(offers[0].originalPrice, 5299);
  assert.equal(offers[0].installments?.count, 10);
  assert.equal(offers[0].installments?.interestFree, true);
  assert.equal(offers[0].freeShipping, true);
  assert.equal(offers[1].price, 39.9);
  assert.equal(offers[1].installments, null);
});

const MAGALU_HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      data: {
        search: {
          products: [
            {
              id: "237184400",
              title: "iPhone 15 Apple 128GB Preto",
              url: "/iphone-15-apple-128gb-preto/p/237184400/te/ip15/",
              image: "https://a-static.mlcdn.com.br/x.jpg",
              price: { bestPrice: 4399.9, fullPrice: 5999 },
              installment: { quantity: 10, amount: 439.99 },
              seller: { description: "Magazine Luiza" },
            },
            {
              id: "111",
              title: "Capa iPhone 15",
              path: "/capa/p/111/",
              price: { bestPrice: 29.9 },
              installment: { quantity: 2, amount: 16.5 },
            },
            {
              id: "222",
              title: "Película iPhone 15",
              url: "https://www.magazineluiza.com.br/pelicula/p/222/",
              price: { bestPrice: 19.9 },
            },
          ],
        },
      },
    },
  },
})}</script></body></html>`;

test("Magazine Luiza: lê produtos do __NEXT_DATA__", () => {
  const offers = parseMagaluHtml(MAGALU_HTML, NOW);
  assert.equal(offers.length, 3);
  assert.equal(offers[0].price, 4399.9);
  assert.equal(offers[0].originalPrice, 5999);
  assert.equal(offers[0].installments?.count, 10);
  assert.equal(offers[0].installments?.interestFree, true); // 10 x 439,99 ≈ 4399,90
  assert.equal(offers[0].url, "https://www.magazineluiza.com.br/iphone-15-apple-128gb-preto/p/237184400/te/ip15/");
  assert.equal(offers[1].installments?.interestFree, false); // 2 x 16,50 = 33 > 29,90
  assert.equal(offers[2].installments, null);
});

test("findProductArrays acha o maior array de produtos", () => {
  const arrays = findProductArrays({ a: { b: [{ title: "x", price: 1 }, { title: "y", price: 2 }, { title: "z", price: 3 }] } });
  assert.equal(arrays.length, 1);
  assert.equal(arrays[0].length, 3);
});

test("filtros e ordenação combinados sobre várias origens", () => {
  const all = [
    ...parseMercadoLivreHtml(ML_HTML, NOW),
    ...parseAmazonHtml(AMAZON_HTML, NOW),
    ...parseMagaluHtml(MAGALU_HTML, NOW),
  ];
  const sorted = sortByPriceAsc(all);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].price <= sorted[i].price);

  const semJuros = applyFilters(all, { interestFreeOnly: true, origin: "all", maxPrice: null, freeShippingOnly: false, newOnly: false });
  assert.ok(semJuros.every((o) => o.installments?.interestFree));
  assert.equal(semJuros.length, 3);

  const nacionalNovo = applyFilters(all, { interestFreeOnly: false, origin: "national", maxPrice: 4400, freeShippingOnly: false, newOnly: true });
  // Origem desconhecida (null) não é excluída pelo filtro "nacional"; só o que é sabidamente internacional.
  assert.ok(nacionalNovo.every((o) => o.isInternational !== true && o.condition !== "used" && o.price <= 4400));
  assert.ok(!nacionalNovo.some((o) => o.externalId === "MLB3456789012"));

  const internacional = applyFilters(all, { interestFreeOnly: false, origin: "international", maxPrice: null, freeShippingOnly: false, newOnly: false });
  assert.deepEqual(internacional.map((o) => o.externalId), ["MLB3456789012"]);
});
