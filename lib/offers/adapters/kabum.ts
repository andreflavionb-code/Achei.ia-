import { asNumber, asString, dumpDebug, extractNextData, fetchHtmlFull, getPath, parseInstallments, ScrapeError } from "../html";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * KaBuM! pela página pública de busca (Next.js). Os produtos vêm em
 * __NEXT_DATA__ > pageProps.data (string JSON) > catalogServer.data[].
 * Sem cadastro, sem navegador.
 */
const PAGE = 60;

function url(query: string, page: number): string {
  const q = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
  return `https://www.kabum.com.br/busca/${q}?page_number=${page}&page_size=${PAGE}&sort=most_searched`;
}

export function parseKabumHtml(html: string, fetchedAt: string): { offers: Offer[]; totalPages: number } {
  const next = extractNextData(html);
  let data = getPath(next, "props.pageProps.data");
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const catalog = getPath(data, "catalogServer") as Record<string, unknown> | undefined;
  const list = Array.isArray(catalog?.data) ? (catalog!.data as unknown[]) : [];
  const totalPages = asNumber(getPath(catalog, "meta.totalPagesCount")) ?? 1;
  const offers: Offer[] = [];
  for (const p of list) {
    const code = asNumber(getPath(p, "code"));
    const name = asString(getPath(p, "name"));
    const cardPrice = asNumber(getPath(p, "price"));
    if (!code || !name || !cardPrice || cardPrice <= 0) continue;
    if (getPath(p, "available") === false) continue;
    const pix = asNumber(getPath(p, "priceWithDiscount"));
    const price = pix && pix > 0 && pix < cardPrice ? pix : cardPrice;
    const old = asNumber(getPath(p, "oldPrice"));
    const instText = asString(getPath(p, "maxInstallment"));
    let installments = parseInstallments(instText, cardPrice);
    if (installments && !installments.interestFree && Math.abs(installments.count * installments.amount - cardPrice) < 0.02 * cardPrice) {
      installments = { ...installments, rate: 0, interestFree: true };
    }
    const slug = asString(getPath(p, "friendlyName")) ?? String(code);
    const seller = asString(getPath(p, "sellerName"));
    const openBox = /open ?box|seminovo|usad[oa]/i.test(name);
    offers.push({
      id: `kabum:${code}`,
      source: "kabum",
      sourceName: "KaBuM!",
      externalId: String(code),
      title: name,
      price,
      cardPrice: cardPrice > price ? cardPrice : null,
      originalPrice: old && old > cardPrice ? old : null,
      currency: "BRL",
      installments,
      isInternational: false,
      freeShipping: null,
      condition: openBox ? "used" : "new",
      sellerName: seller && !/^kabum/i.test(seller) ? seller : null,
      imageUrl: asString(getPath(p, "image")),
      url: `https://www.kabum.com.br/produto/${code}/${slug}`,
      fetchedAt,
    });
  }
  return { offers, totalPages };
}

export const kabumAdapter: MarketplaceAdapter = {
  id: "kabum",
  name: "KaBuM!",
  transport: "plain",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const maxPages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await fetchHtmlFull(url(query, i));
      if (page.status === 403 || page.status === 429) throw new ScrapeError(`KaBuM! bloqueou a requisição (HTTP ${page.status})`);
      if (page.status >= 400) throw new ScrapeError(`KaBuM! respondeu HTTP ${page.status}`);
      const { offers: batch, totalPages } = parseKabumHtml(page.html, fetchedAt);
      if (i === 1 && batch.length === 0) {
        if (/nenhum resultado|não encontramos|não achamos/i.test(page.html)) return [];
        const file = await dumpDebug("kabum", page.html);
        throw new ScrapeError(`Nenhum produto reconhecido na página do KaBuM!${file ? `. HTML salvo em ${file}` : ""}`);
      }
      offers.push(...batch);
      if (i >= totalPages || batch.length === 0) break;
    }
    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
