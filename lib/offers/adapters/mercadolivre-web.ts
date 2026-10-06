import { parse, type HTMLElement } from "node-html-parser";
import { toAffiliateUrl } from "@/lib/mercadolivre/affiliate";
import { dumpDebug, parseBRL, parseInstallments, ScrapeError } from "../html";
import { loadAndParse, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Mercado Livre pela página pública de busca (lista.mercadolivre.com.br).
 * Não precisa de cadastro. Lê o HTML dos cards de produto.
 *
 * Paginação: a URL recebe o sufixo _Desde_<n> (1, 51, 101, ...).
 */

const ITEMS_PER_PAGE = 50;

function buildUrl(query: string, offset: number): string {
  const slug = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
  return offset > 0 ? `${base}_Desde_${offset + 1}_NoIndex_True` : base;
}

function text(el: HTMLElement | null | undefined): string {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function first(card: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = card.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Extrai o id do anúncio (MLB123...) da URL. */
function extractId(href: string): string | null {
  const m = href.match(/MLB-?(\d{6,})/i);
  return m ? `MLB${m[1]}` : null;
}

function parseCard(card: HTMLElement, fetchedAt: string): Offer | null {
  const titleEl = first(card, ["a.poly-component__title", ".poly-component__title", "h2.ui-search-item__title", "h2"]);
  const linkEl = titleEl?.tagName === "A" ? titleEl : first(card, ["a.poly-component__title", "a.ui-search-link", "a[href]"]);
  const title = text(titleEl);
  const href = linkEl?.getAttribute("href") ?? "";
  if (!title || !href) return null;

  // Preço atual: dentro do bloco de preço corrente; nunca o riscado (<s>).
  const priceBlock = first(card, [".poly-price__current", ".ui-search-price__second-line", ".ui-search-price"]);
  const priceEl = priceBlock
    ? first(priceBlock, [".andes-money-amount__fraction"])
    : card.querySelectorAll(".andes-money-amount__fraction").find((el) => !el.closest("s"));
  const cents = priceBlock ? first(priceBlock, [".andes-money-amount__cents"]) : null;
  const price = parseBRL(`${text(priceEl)}${cents ? `,${text(cents)}` : ""}`);
  if (price === null || price <= 0) return null;

  const previousEl = first(card, ["s.andes-money-amount--previous .andes-money-amount__fraction", "s .andes-money-amount__fraction"]);
  const originalPrice = parseBRL(text(previousEl));

  const installmentsEl = first(card, [".poly-price__installments", ".ui-search-installments", "[class*=installments]"]);
  const installments = parseInstallments(text(installmentsEl));

  const cardText = text(card);
  const freeShipping = /frete gr[áa]tis/i.test(cardText) ? true : null;

  // "Internacional" aparece em um selo próprio quando o vendedor é de fora.
  const shippedFrom = first(card, [".poly-component__shipped-from", ".ui-search-item__international", "[class*=international]"]);
  const isInternational = shippedFrom
    ? /internacional/i.test(text(shippedFrom))
    : /compra internacional|produto internacional/i.test(cardText)
      ? true
      : false;

  const conditionEl = first(card, [".poly-component__item-condition", ".ui-search-item__details", "[class*=condition]"]);
  const smallTexts = card.querySelectorAll("span, p").map(text);
  const used =
    /\busado\b/i.test(text(conditionEl)) || smallTexts.some((t) => /^usado(\s*\||$)/i.test(t));

  const sellerEl = first(card, [".poly-component__seller", ".ui-search-official-store-label", ".ui-search-item__brand-discoverability"]);
  const seller = text(sellerEl).replace(/^por\s+/i, "") || null;

  const img = first(card, ["img.poly-component__picture", "img.ui-search-result-image__element", "img"]);
  const imageUrl = img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? null;

  const cleanHref = href.split("#")[0];
  const externalId = extractId(cleanHref) ?? cleanHref;

  return {
    id: `mercadolivre:${externalId}`,
    source: "mercadolivre",
    sourceName: "Mercado Livre",
    externalId,
    title,
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
    currency: "BRL",
    installments,
    isInternational,
    freeShipping,
    condition: used ? "used" : "new",
    sellerName: seller,
    imageUrl: imageUrl && imageUrl.startsWith("http") ? imageUrl : null,
    url: toAffiliateUrl(cleanHref),
    fetchedAt,
  };
}

export function parseMercadoLivreHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const cards = root.querySelectorAll("li.ui-search-layout__item, .ui-search-result__wrapper, .poly-card");
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const offer = parseCard(card, fetchedAt);
    if (offer && !seen.has(offer.id)) {
      seen.add(offer.id);
      offers.push(offer);
    }
  }
  return offers;
}

const ML_SOURCE: PageSource = {
  name: "Mercado Livre",
  waitFor: "li.ui-search-layout__item, .poly-card, .ui-search-result__wrapper",
  isBlocked: (html, finalUrl) =>
    /account-verification|\/gz\//i.test(finalUrl) ||
    /suspicious-traffic-frontend|gz-account-verification/i.test(html),
  isEmpty: (html) => /não encontramos|nenhum resultado|Não há anúncios/i.test(html),
};

export const mercadoLivreWebAdapter: MarketplaceAdapter = {
  id: "mercadolivre",
  name: "Mercado Livre",

  isConfigured() {
    return true;
  },

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.ceil(options.maxResults / ITEMS_PER_PAGE));

    const parse = (html: string) => parseMercadoLivreHtml(html, fetchedAt);
    const first = await loadAndParse(buildUrl(query, 0), ML_SOURCE, parse);
    const offers = first.items;

    if (offers.length === 0) {
      if (ML_SOURCE.isEmpty?.(first.html)) return [];
      const file = await dumpDebug("mercadolivre", first.html);
      throw new ScrapeError(
        `Nenhum produto reconhecido na página do Mercado Livre (layout pode ter mudado)${file ? `. HTML salvo em ${file}` : ""}`,
      );
    }

    // Páginas seguintes em sequência (o navegador é compartilhado).
    for (let i = 1; i < pages; i++) {
      try {
        const next = await loadAndParse(buildUrl(query, i * ITEMS_PER_PAGE), ML_SOURCE, parse);
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
