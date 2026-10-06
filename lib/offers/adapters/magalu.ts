import { parse } from "node-html-parser";
import { asNumber, asString, dumpDebug, extractNextData, findProductArrays, getPath, parseBRL, parseInstallments, ScrapeError } from "../html";
import { loadAndParse, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Magazine Luiza pela página pública de busca (bloqueia requisição simples
 * com Akamai; funciona pelo navegador escondido).
 *
 * A página é Next.js e embute os produtos em __NEXT_DATA__ >
 * props.pageProps.data.search.items[] (cada item tem offers[] com preço no
 * cartão, melhor preço no Pix e melhor plano de parcelas). Se o formato
 * mudar, caímos para um leitor genérico de arrays e, por fim, para o HTML.
 */

const ITEMS_PER_PAGE = 40;

function buildUrl(query: string, page: number): string {
  const q = encodeURIComponent(query.trim());
  return page > 1
    ? `https://www.magazineluiza.com.br/busca/${q}/?page=${page}`
    : `https://www.magazineluiza.com.br/busca/${q}/`;
}

function imageUrl(raw: string | null): string | null {
  if (!raw) return null;
  const url = raw.replace("{w}x{h}", "280x210");
  return url.startsWith("http") ? url : null;
}

/** Formato atual: item.offers[0] com price / bestPrice / bestInstallmentPlan. */
function fromSearchItem(item: Record<string, unknown>, fetchedAt: string): Offer | null {
  const id = asString(item.id);
  const title = asString(item.title);
  if (!id || !title) return null;
  if (item.available === false) return null;
  const offer = (Array.isArray(item.offers) ? item.offers[0] : null) as Record<string, unknown> | null;
  if (!offer) return null;

  const cardPrice = asNumber(offer.price);
  if (!cardPrice || cardPrice <= 0) return null;
  const best = asNumber(getPath(offer, "bestPrice.totalAmount"));
  const price = best && best > 0 && best < cardPrice ? best : cardPrice;
  const listPrice = asNumber(offer.listPrice);

  const count = asNumber(getPath(offer, "bestInstallmentPlan.installment"));
  const amount = asNumber(getPath(offer, "bestInstallmentPlan.installmentAmount"));
  const desc = asString(getPath(offer, "bestInstallmentPlan.paymentMethodDescription")) ?? "";
  const total = asNumber(getPath(offer, "bestInstallmentPlan.totalAmount"));
  let installments: Offer["installments"] = null;
  if (count && amount && count > 1) {
    const interestFree = /sem juros/i.test(desc) || (total !== null && Math.abs(total - cardPrice) < 0.02 * cardPrice);
    installments = { count, amount, rate: interestFree ? 0 : null, interestFree };
  }

  const sellerId = asString(getPath(offer, "seller.id"));
  const path = asString(item.path) ?? "";
  const url = path.startsWith("http") ? path : `https://www.magazineluiza.com.br${path}`;
  const tags = JSON.stringify(item.tags ?? []) + JSON.stringify(offer.badges ?? []);
  const used = /usad[oa]|recondicionad|seminov/i.test(title) || /seminovo|usado/i.test(tags);

  return {
    id: `magalu:${id}`,
    source: "magalu",
    sourceName: "Magazine Luiza",
    externalId: id,
    title,
    price,
    cardPrice: cardPrice > price ? cardPrice : null,
    originalPrice: listPrice && listPrice > cardPrice ? listPrice : null,
    currency: asString(offer.currency) ?? "BRL",
    installments,
    isInternational: false,
    freeShipping: asNumber(getPath(item, "shippingTag.cost")) === 0 ? true : null,
    condition: used ? "used" : "new",
    sellerName: sellerId && sellerId !== "magazineluiza" ? sellerId : null,
    imageUrl: imageUrl(asString(item.image)),
    url,
    fetchedAt,
  };
}

/** Formato antigo/genérico: objeto com title e price/prices/bestPrice. */
function fromGenericJson(product: Record<string, unknown>, fetchedAt: string): Offer | null {
  const title = asString(product.title) ?? asString(product.name);
  const id = asString(product.id) ?? asString(product.sku);
  if (!title || !id) return null;

  const price =
    asNumber(getPath(product, "price.bestPrice")) ??
    asNumber(getPath(product, "price.price")) ??
    asNumber(getPath(product, "price.sellingPrice")) ??
    asNumber(getPath(product, "prices.bestPrice")) ??
    asNumber(product.bestPrice) ??
    asNumber(product.price);
  if (price === null || price <= 0) return null;

  const fullPrice = asNumber(getPath(product, "price.fullPrice")) ?? asNumber(getPath(product, "price.listPrice")) ?? null;
  const instQty = asNumber(getPath(product, "installment.quantity")) ?? asNumber(getPath(product, "price.installment.quantity"));
  const instAmount = asNumber(getPath(product, "installment.amount")) ?? asNumber(getPath(product, "price.installment.amount"));
  const instText = asString(getPath(product, "installment.description")) ?? asString(getPath(product, "price.installmentText"));
  let installments = instText ? parseInstallments(instText) : null;
  if (!installments && instQty && instAmount) {
    const total = instQty * instAmount;
    const interestFree = Math.abs(total - price) < 0.05 * price;
    installments = { count: instQty, amount: instAmount, rate: interestFree ? 0 : null, interestFree };
  }

  const pathOrUrl = asString(product.url) ?? asString(product.path) ?? "";
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://www.magazineluiza.com.br${pathOrUrl}`;
  const sellerName = asString(getPath(product, "seller.description")) ?? asString(getPath(product, "seller.name")) ?? asString(product.seller);
  const image = asString(product.image) ?? asString(getPath(product, "image.url")) ?? null;

  return {
    id: `magalu:${id}`,
    source: "magalu",
    sourceName: "Magazine Luiza",
    externalId: id,
    title,
    price,
    cardPrice: null,
    originalPrice: fullPrice && fullPrice > price ? fullPrice : null,
    currency: "BRL",
    installments,
    isInternational: false,
    freeShipping: null,
    condition: "new",
    sellerName,
    imageUrl: imageUrl(image),
    url,
    fetchedAt,
  };
}

function fromHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const cards = root.querySelectorAll('[data-testid="product-card-container"]');
  const offers: Offer[] = [];
  for (const card of cards) {
    const link = card.querySelector('a[data-testid="product-card-link"], a[href]');
    const title = card.querySelector('[data-testid="product-title"], h2')?.textContent.trim();
    const priceText = card.querySelector('[data-testid="price-value"]')?.textContent;
    const original = card.querySelector('[data-testid="price-original"]')?.textContent;
    const instText = card.querySelector('[data-testid="installment"]')?.textContent;
    const href = link?.getAttribute("href") ?? card.getAttribute("redirect") ?? "";
    const price = parseBRL(priceText);
    if (!title || price === null || !href) continue;
    const id = href.match(/\/p\/([a-z0-9]+)/i)?.[1] ?? href;
    offers.push({
      id: `magalu:${id}`,
      source: "magalu",
      sourceName: "Magazine Luiza",
      externalId: id,
      title,
      price,
      cardPrice: null,
      originalPrice: parseBRL(original),
      currency: "BRL",
      installments: parseInstallments(instText),
      isInternational: false,
      freeShipping: null,
      condition: "new",
      sellerName: null,
      imageUrl: card.querySelector("img")?.getAttribute("src") ?? null,
      url: href.startsWith("http") ? href : `https://www.magazineluiza.com.br${href}`,
      fetchedAt,
    });
  }
  return offers;
}

export function parseMagaluHtml(html: string, fetchedAt: string): Offer[] {
  const nextData = extractNextData(html);
  if (nextData) {
    const items = getPath(nextData, "props.pageProps.data.search.items");
    if (Array.isArray(items)) {
      const offers = items
        .map((p) => (p && typeof p === "object" ? fromSearchItem(p as Record<string, unknown>, fetchedAt) : null))
        .filter((o): o is Offer => o !== null);
      if (offers.length > 0) return offers;
    }
    const arrays = findProductArrays(nextData);
    const best = arrays.sort((a, b) => b.length - a.length)[0];
    if (best) {
      const offers = best.map((p) => fromGenericJson(p, fetchedAt)).filter((o): o is Offer => o !== null);
      if (offers.length > 0) return offers;
    }
  }
  return fromHtml(html, fetchedAt);
}

export function magaluTotalPages(html: string): number {
  return asNumber(getPath(extractNextData(html), "props.pageProps.data.search.pagination.pages")) ?? 1;
}

const MAGALU_SOURCE: PageSource = {
  name: "Magazine Luiza",
  waitFor: '[data-testid="product-card-container"], script#__NEXT_DATA__',
  isBlocked: (html, _url, status) => status === 403 || /akamai-bot|Não é possível acessar a página/i.test(html),
  isEmpty: (html) => /não encontramos|nenhum resultado|não encontrou/i.test(html) && !/product-card-container/.test(html),
};

export const magaluAdapter: MarketplaceAdapter = {
  id: "magalu",
  name: "Magazine Luiza",
  transport: "browser",

  isConfigured() {
    return true;
  },

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(5, Math.ceil(options.maxResults / ITEMS_PER_PAGE)));

    const parsePage = (html: string) => parseMagaluHtml(html, fetchedAt);
    const first = await loadAndParse(buildUrl(query, 1), MAGALU_SOURCE, parsePage);
    const offers = first.items;
    if (offers.length === 0) {
      if (MAGALU_SOURCE.isEmpty?.(first.html)) return [];
      const file = await dumpDebug("magalu", first.html);
      throw new ScrapeError(
        `Nenhum produto reconhecido na página da Magazine Luiza${file ? `. HTML salvo em ${file}` : ""}`,
      );
    }

    const total = magaluTotalPages(first.html);
    for (let i = 2; i <= Math.min(pages, total); i++) {
      try {
        const next = await loadAndParse(buildUrl(query, i), MAGALU_SOURCE, parsePage);
        if (next.items.length === 0) break;
        offers.push(...next.items);
      } catch {
        break;
      }
    }

    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
