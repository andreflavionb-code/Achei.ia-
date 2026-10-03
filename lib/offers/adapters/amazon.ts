import { parse, type HTMLElement } from "node-html-parser";
import { dumpDebug, parseBRL, parseInstallments, ScrapeError } from "../html";
import { loadSearchPage, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Amazon Brasil pela página pública de busca.
 *
 * A Amazon bloqueia robôs com frequência (captcha). De um computador
 * doméstico costuma funcionar; de servidores em nuvem, raramente. Quando
 * bloquear, a origem aparece com erro e as outras continuam.
 */

const ITEMS_PER_PAGE = 48;

function buildUrl(query: string, page: number): string {
  const q = encodeURIComponent(query.trim());
  return page > 1 ? `https://www.amazon.com.br/s?k=${q}&page=${page}` : `https://www.amazon.com.br/s?k=${q}`;
}

function text(el: HTMLElement | null | undefined): string {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function parseCard(card: HTMLElement, fetchedAt: string): Offer | null {
  const asin = card.getAttribute("data-asin");
  if (!asin) return null;

  const title = text(card.querySelector("h2 span, h2 a span, h2"));
  const price = parseBRL(text(card.querySelector(".a-price:not(.a-text-price) .a-offscreen, .a-price .a-offscreen")));
  if (!title || price === null || price <= 0) return null;

  const original = parseBRL(text(card.querySelector(".a-price.a-text-price .a-offscreen")));
  const cardText = text(card);

  const installments = parseInstallments(cardText.match(/(?:em\s*at[ée]\s*)?\d{1,2}x\s*(?:de\s*)?R\$\s*[\d.,]+(?:\s*sem juros)?/i)?.[0]);
  const freeShipping = /frete gr[áa]tis/i.test(cardText) ? true : null;
  const used = /\busado\b/i.test(cardText) && !/\busado\b/i.test(title) ? "unknown" : "new";

  const img = card.querySelector("img.s-image");

  return {
    id: `amazon:${asin}`,
    source: "amazon",
    sourceName: "Amazon",
    externalId: asin,
    title,
    price,
    originalPrice: original && original > price ? original : null,
    currency: "BRL",
    installments,
    isInternational: null,
    freeShipping,
    condition: used,
    sellerName: null,
    imageUrl: img?.getAttribute("src") ?? null,
    url: `https://www.amazon.com.br/dp/${asin}`,
    fetchedAt,
  };
}

export function parseAmazonHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const cards = root.querySelectorAll('div[data-component-type="s-search-result"]');
  const offers: Offer[] = [];
  for (const card of cards) {
    const offer = parseCard(card, fetchedAt);
    if (offer) offers.push(offer);
  }
  return offers;
}

const AMAZON_SOURCE: PageSource = {
  name: "Amazon",
  waitFor: 'div[data-component-type="s-search-result"]',
  isBlocked: (html, _url, status) =>
    status === 503 || /captcha|Digite os caracteres|api-services-support@amazon\.com|Algo deu errado/i.test(html),
};

export const amazonAdapter: MarketplaceAdapter = {
  id: "amazon",
  name: "Amazon",

  isConfigured() {
    return true;
  },

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / ITEMS_PER_PAGE)));

    const first = await loadSearchPage(buildUrl(query, 1), AMAZON_SOURCE);
    const offers = parseAmazonHtml(first.html, fetchedAt);
    if (offers.length === 0) {
      if (/Nenhum resultado|não encontrou|não encontramos/i.test(first.html)) return [];
      const file = await dumpDebug("amazon", first.html);
      throw new ScrapeError(`Nenhum produto reconhecido na página da Amazon${file ? `. HTML salvo em ${file}` : ""}`);
    }

    const rest = await Promise.allSettled(
      Array.from({ length: pages - 1 }, (_, i) => loadSearchPage(buildUrl(query, i + 2), AMAZON_SOURCE)),
    );
    for (const page of rest) {
      if (page.status === "fulfilled") offers.push(...parseAmazonHtml(page.value.html, fetchedAt));
    }

    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
