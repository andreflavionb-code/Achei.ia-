import { parse, type HTMLElement } from "node-html-parser";
import { dumpDebug, parseBRL, parseInstallments, ScrapeError } from "../html";
import { loadAndParse, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Casas Bahia pela página pública de busca. O site bloqueia requisições
 * simples (Akamai) e carrega os preços por JavaScript, então usamos o
 * navegador escondido e lemos os cards já renderizados.
 */
const PAGE = 20;

function buildUrl(query: string, page: number): string {
  const slug = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return page > 1 ? `https://www.casasbahia.com.br/${slug}/b?page=${page}` : `https://www.casasbahia.com.br/${slug}/b`;
}

function text(el: HTMLElement | null | undefined): string {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

export function parseCasasBahiaHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const cards = root.querySelectorAll('[data-testid="product-card-desktop"], [data-testid="product-card-mobile"], .dsvia-product-card');
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const link = card.querySelector("h3.product-card__title a, h3 a, a[data-testid='product-card-link-overlay']");
    const href = link?.getAttribute("href") ?? "";
    const title = text(card.querySelector("h3.product-card__title, h3"));
    const id = href.match(/\/p\/(\d+)/)?.[1];
    if (!href || !title || !id || seen.has(id)) continue;

    // "por R$ 4.479,00 ou em até 6x de R$ 746,50 sem juros ou" (texto acessível, completo).
    const accessible = text(card.querySelector('[data-testid="product-card-installment"] .css-1vmkvrm, [data-testid="product-card-installment"]'));
    const highlight = text(card.querySelector(".product-card__highlight-price"));
    const highlightDesc = text(card.querySelector(".product-card__highlight-price-description"));
    const priceMatch = accessible.match(/por\s*R\$\s*([\d.]+,\d{2})/i);
    const cardPrice = parseBRL(priceMatch?.[1]) ?? parseBRL(highlight);
    if (!cardPrice || cardPrice <= 0) continue;

    // Destaque "no Pix" costuma ser o menor preço à vista.
    const highlightPrice = parseBRL(highlight);
    const price = highlightPrice && highlightPrice < cardPrice && /pix|vista|boleto/i.test(highlightDesc + accessible) ? highlightPrice : Math.min(cardPrice, highlightPrice ?? cardPrice);

    const instText = accessible.match(/(?:em\s*at[ée]\s*)?\d{1,2}x\s*de\s*R\$\s*[\d.]+,\d{2}(?:\s*sem juros)?/i)?.[0] ?? null;
    const installments = parseInstallments(instText, cardPrice);
    const original = parseBRL(text(card.querySelector(".product-card__discount-text")));
    const flags = text(card.querySelector(".product-card__flags-list"));
    const used = /usad[oa]|recondicionad|seminov/i.test(flags) || /^usado\b|\busad[oa]\b/i.test(title);
    const international = /internacional/i.test(flags);
    const img = card.querySelector("img.product-card__image, img");
    const seller = text(card.querySelector('[data-testid="product-card-seller"], .product-card__seller')).replace(/^vendido por\s*/i, "") || null;

    offers.push({
      id: `casasbahia:${id}`,
      source: "casasbahia",
      sourceName: "Casas Bahia",
      externalId: id,
      title: title.replace(/^usado:\s*/i, "").trim(),
      price,
      cardPrice: cardPrice > price ? cardPrice : null,
      originalPrice: original && original > cardPrice ? original : null,
      currency: "BRL",
      installments,
      isInternational: international ? true : false,
      freeShipping: /frete gr[áa]tis/i.test(text(card)) ? true : null,
      condition: used ? "used" : "new",
      sellerName: seller,
      imageUrl: img?.getAttribute("src") ?? null,
      url: href.startsWith("http") ? href : `https://www.casasbahia.com.br${href}`,
      fetchedAt,
    });
    seen.add(id);
  }
  return offers;
}

const CB_SOURCE: PageSource = {
  name: "Casas Bahia",
  waitFor: '[data-testid="product-card-installment"], [data-testid="product-card-desktop"]',
  isBlocked: (html, _url, status) => status === 403 || /Access Denied|akamai/i.test(html) && !/product-card/.test(html),
  isEmpty: (html) => /não encontramos|nenhum resultado|Ops! Não encontramos/i.test(html) && !/product-card-desktop/.test(html),
};

export const casasBahiaAdapter: MarketplaceAdapter = {
  id: "casasbahia",
  name: "Casas Bahia",
  transport: "browser",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / PAGE)));
    const parsePage = (html: string) => parseCasasBahiaHtml(html, fetchedAt);
    const first = await loadAndParse(buildUrl(query, 1), CB_SOURCE, parsePage);
    const offers = first.items;
    if (offers.length === 0) {
      if (CB_SOURCE.isEmpty?.(first.html)) return [];
      const file = await dumpDebug("casasbahia", first.html);
      throw new ScrapeError(`Nenhum produto reconhecido na página da Casas Bahia${file ? `. HTML salvo em ${file}` : ""}`);
    }
    for (let i = 2; i <= pages; i++) {
      try {
        const next = await loadAndParse(buildUrl(query, i), CB_SOURCE, parsePage);
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
