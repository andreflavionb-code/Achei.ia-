import { parse } from "node-html-parser";
import { dumpDebug, extractJsonScript, findProductArrays, parseBRL, parseInstallments, ScrapeError } from "../html";
import { loadSearchPage, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Magazine Luiza pela página pública de busca.
 * A página é Next.js e embute os produtos em <script id="__NEXT_DATA__">;
 * lemos esse JSON. Se não existir, caímos para o HTML dos cards.
 */

const ITEMS_PER_PAGE = 60;

function buildUrl(query: string, page: number): string {
  const q = encodeURIComponent(query.trim());
  return page > 1
    ? `https://www.magazineluiza.com.br/busca/${q}/?page=${page}`
    : `https://www.magazineluiza.com.br/busca/${q}/`;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseBRL(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function get(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), o);
}

function fromJson(product: Record<string, unknown>, fetchedAt: string): Offer | null {
  const title = str(product.title) ?? str(product.name);
  const id = str(product.id) ?? str(product.sku);
  if (!title || !id) return null;

  const price =
    num(get(product, "price.bestPrice")) ??
    num(get(product, "price.price")) ??
    num(get(product, "price.sellingPrice")) ??
    num(get(product, "prices.bestPrice")) ??
    num(product.bestPrice) ??
    num(product.price);
  if (price === null || price <= 0) return null;

  const fullPrice = num(get(product, "price.fullPrice")) ?? num(get(product, "price.listPrice")) ?? null;

  const instQty = num(get(product, "installment.quantity")) ?? num(get(product, "price.installment.quantity"));
  const instAmount = num(get(product, "installment.amount")) ?? num(get(product, "price.installment.amount"));
  const instText = str(get(product, "installment.description")) ?? str(get(product, "price.installmentText"));
  let installments = instText ? parseInstallments(instText) : null;
  if (!installments && instQty && instAmount) {
    const total = instQty * instAmount;
    const interestFree = Math.abs(total - price) < 0.05 * price;
    installments = { count: instQty, amount: instAmount, rate: interestFree ? 0 : null, interestFree };
  }

  const pathOrUrl = str(product.url) ?? str(product.path) ?? "";
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://www.magazineluiza.com.br${pathOrUrl}`;

  const sellerName = str(get(product, "seller.description")) ?? str(get(product, "seller.name")) ?? str(product.seller);
  const image = str(product.image) ?? str(get(product, "image.url")) ?? null;

  return {
    id: `magalu:${id}`,
    source: "magalu",
    sourceName: "Magazine Luiza",
    externalId: id,
    title,
    price,
    originalPrice: fullPrice && fullPrice > price ? fullPrice : null,
    currency: "BRL",
    installments,
    isInternational: false,
    freeShipping: null,
    condition: "new",
    sellerName,
    imageUrl: image && image.startsWith("http") ? image : null,
    url,
    fetchedAt,
  };
}

function fromHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const cards = root.querySelectorAll('li a[data-testid="product-card-container"], a[data-testid="product-card-container"]');
  const offers: Offer[] = [];
  for (const card of cards) {
    const title = card.querySelector('[data-testid="product-title"], h2')?.textContent.trim();
    const priceText = card.querySelector('[data-testid="price-value"]')?.textContent;
    const original = card.querySelector('[data-testid="price-original"]')?.textContent;
    const instText = card.querySelector('[data-testid="installment"]')?.textContent;
    const href = card.getAttribute("href") ?? "";
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
  const nextData = extractJsonScript(html, /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    const arrays = findProductArrays(nextData);
    const best = arrays.sort((a, b) => b.length - a.length)[0];
    if (best) {
      const offers = best.map((p) => fromJson(p, fetchedAt)).filter((o): o is Offer => o !== null);
      if (offers.length > 0) return offers;
    }
  }
  return fromHtml(html, fetchedAt);
}

const MAGALU_SOURCE: PageSource = {
  name: "Magazine Luiza",
  waitFor: '[data-testid="product-card-container"], script#__NEXT_DATA__',
  isBlocked: (html, _url, status) => status === 403 || /akamai-bot|Não é possível acessar a página/i.test(html),
};

export const magaluAdapter: MarketplaceAdapter = {
  id: "magalu",
  name: "Magazine Luiza",

  isConfigured() {
    return true;
  },

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(5, Math.ceil(options.maxResults / ITEMS_PER_PAGE)));

    const first = await loadSearchPage(buildUrl(query, 1), MAGALU_SOURCE);
    const offers = parseMagaluHtml(first.html, fetchedAt);
    if (offers.length === 0) {
      if (/não encontramos|nenhum resultado|não encontrou/i.test(first.html)) return [];
      const file = await dumpDebug("magalu", first.html);
      throw new ScrapeError(
        `Nenhum produto reconhecido na página da Magazine Luiza${file ? `. HTML salvo em ${file}` : ""}`,
      );
    }

    const rest = await Promise.allSettled(
      Array.from({ length: pages - 1 }, (_, i) => loadSearchPage(buildUrl(query, i + 2), MAGALU_SOURCE)),
    );
    for (const page of rest) {
      if (page.status === "fulfilled") offers.push(...parseMagaluHtml(page.value.html, fetchedAt));
    }

    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
