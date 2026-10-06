import { asNumber, asString, dumpDebug, fetchHtmlFull, getPath, ScrapeError } from "../html";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * AliExpress (site em português, preços em reais) pela página pública de
 * busca. Os produtos vêm num JSON embutido: window._dida_config_ ... "itemList":{"content":[...]}.
 * Tudo aqui é importado (internacional).
 */
const PAGE = 60;

function url(query: string, page: number): string {
  const slug = query.trim().toLowerCase().replace(/[^a-z0-9à-ú]+/gi, "-").replace(/^-+|-+$/g, "");
  const base = `https://pt.aliexpress.com/w/wholesale-${encodeURIComponent(slug)}.html`;
  return page > 1 ? `${base}?page=${page}` : base;
}

/** Extrai o objeto JSON que começa em `start` (índice do "{"), equilibrando chaves. */
function balancedJson(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseAliExpressHtml(html: string, fetchedAt: string): Offer[] {
  const marker = '"itemList":';
  const idx = html.indexOf(marker);
  if (idx < 0) return [];
  const itemList = balancedJson(html, idx + marker.length) as { content?: unknown[] } | null;
  const content = Array.isArray(itemList?.content) ? itemList!.content : [];
  const offers: Offer[] = [];
  for (const item of content) {
    const id = asString(getPath(item, "productId"));
    const title = asString(getPath(item, "title.displayTitle")) ?? asString(getPath(item, "title.seoTitle"));
    const price = asNumber(getPath(item, "prices.salePrice.minPrice"));
    const currency = asString(getPath(item, "prices.salePrice.currencyCode")) ?? "BRL";
    if (!id || !title || !price || price <= 0) continue;
    const original = asNumber(getPath(item, "prices.originalPrice.minPrice"));
    const img = asString(getPath(item, "image.imgUrl"));
    const store = asString(getPath(item, "store.storeName"));
    offers.push({
      id: `aliexpress:${id}`,
      source: "aliexpress",
      sourceName: "AliExpress",
      externalId: id,
      title,
      price,
      cardPrice: null,
      originalPrice: original && original > price ? original : null,
      currency,
      installments: null,
      isInternational: true,
      freeShipping: /frete gr[áa]tis|free shipping/i.test(JSON.stringify(getPath(item, "logistics") ?? "")) ? true : null,
      condition: "new",
      sellerName: store,
      imageUrl: img ? (img.startsWith("//") ? `https:${img}` : img) : null,
      url: `https://pt.aliexpress.com/item/${id}.html`,
      fetchedAt,
    });
  }
  return offers;
}

export const aliExpressAdapter: MarketplaceAdapter = {
  id: "aliexpress",
  name: "AliExpress",
  transport: "plain",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(3, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await fetchHtmlFull(url(query, i));
      if (page.status === 403 || page.status === 429 || /punish|captcha|_____tmd_____/i.test(page.finalUrl)) {
        throw new ScrapeError(`AliExpress bloqueou a requisição (HTTP ${page.status})`);
      }
      if (page.status >= 400) throw new ScrapeError(`AliExpress respondeu HTTP ${page.status}`);
      const batch = parseAliExpressHtml(page.html, fetchedAt);
      if (i === 1 && batch.length === 0) {
        if (/nenhum resultado|não encontramos|No results/i.test(page.html)) return [];
        const file = await dumpDebug("aliexpress", page.html);
        throw new ScrapeError(`Nenhum produto reconhecido na página do AliExpress${file ? `. HTML salvo em ${file}` : ""}`);
      }
      offers.push(...batch);
      if (batch.length < PAGE / 2) break;
    }
    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
