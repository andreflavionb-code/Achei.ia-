import { asNumber, asString, dumpDebug, extractNextData, fetchHtmlFull, getPath, ScrapeError } from "../html";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Buscapé pela página pública de busca (Next.js, dados em __NEXT_DATA__).
 * Cada resultado é um PRODUTO com a melhor oferta entre as lojas que o
 * Buscapé monitora (Fast Shop, Girafa, Magalu, Casas Bahia, Amazon...).
 * Serve como rede de segurança: cobre lojas que não lemos diretamente.
 */
const PAGE = 30;

function url(query: string, page: number): string {
  const q = encodeURIComponent(query.trim());
  return page > 1 ? `https://www.buscape.com.br/search?q=${q}&page=${page}` : `https://www.buscape.com.br/search?q=${q}`;
}

export function parseBuscapeHtml(html: string, fetchedAt: string): { offers: Offer[]; totalPages: number } {
  const next = extractNextData(html);
  const hits = getPath(next, "props.initialReduxState.hits.hits");
  const totalPages = asNumber(getPath(next, "props.initialReduxState.hits.pagination.nbPages")) ?? 1;
  const list = Array.isArray(hits) ? hits : [];
  const offers: Offer[] = [];
  for (const hit of list) {
    if (asString(getPath(hit, "type")) !== "product") continue;
    const id = asString(getPath(hit, "objectId")) ?? asString(getPath(hit, "sourceId"));
    const title = asString(getPath(hit, "name"));
    const price = asNumber(getPath(hit, "price"));
    if (!id || !title || !price || price <= 0) continue;
    const merchant = asString(getPath(hit, "bestOffer.merchantName"));
    const count = asNumber(getPath(hit, "installments.amount_months"));
    const amount = asNumber(getPath(hit, "installments.price"));
    const total = asNumber(getPath(hit, "installments.total_value"));
    const hasInterest = getPath(hit, "hasInterest");
    const installments =
      count && amount && count > 1
        ? { count, amount, rate: hasInterest === false ? 0 : null, interestFree: hasInterest === false }
        : null;
    const cardPrice = total && total > price * 1.005 ? total : null;
    const path = asString(getPath(hit, "url")) ?? `/${asString(getPath(hit, "categorySeoUrl")) ?? "produto"}/${asString(getPath(hit, "seoUrl")) ?? id}`;
    const stores = asNumber(getPath(hit, "storeCount"));
    offers.push({
      id: `buscape:${id}`,
      source: "buscape",
      sourceName: "Buscapé",
      externalId: id,
      title,
      price,
      cardPrice,
      originalPrice: null,
      currency: "BRL",
      installments,
      isInternational: null,
      freeShipping: null,
      condition: "new",
      sellerName: merchant ? `${merchant}${stores && stores > 1 ? ` (+${stores - 1} lojas)` : ""}` : null,
      imageUrl: asString(getPath(hit, "image")),
      url: path.startsWith("http") ? path : `https://www.buscape.com.br${path}`,
      fetchedAt,
    });
  }
  return { offers, totalPages };
}

export const buscapeAdapter: MarketplaceAdapter = {
  id: "buscape",
  name: "Buscapé",
  transport: "plain",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const maxPages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await fetchHtmlFull(url(query, i));
      if (page.status === 403 || page.status === 429) throw new ScrapeError(`Buscapé bloqueou a requisição (HTTP ${page.status})`);
      if (page.status >= 400) throw new ScrapeError(`Buscapé respondeu HTTP ${page.status}`);
      const { offers: batch, totalPages } = parseBuscapeHtml(page.html, fetchedAt);
      if (i === 1 && batch.length === 0) {
        if (!extractNextData(page.html)) {
          const file = await dumpDebug("buscape", page.html);
          throw new ScrapeError(`Nenhum produto reconhecido na página do Buscapé${file ? `. HTML salvo em ${file}` : ""}`);
        }
        return [];
      }
      offers.push(...batch);
      if (i >= totalPages || batch.length === 0) break;
    }
    const seen = new Set<string>();
    return offers.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  },
};
