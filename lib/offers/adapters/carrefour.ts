import { fetchJson, ScrapeError } from "../html";
import { vtexProductToOffers } from "./vtex";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Carrefour pela API de busca da plataforma VTEX (Intelligent Search),
 * a mesma que a página do site chama. Sem cadastro, sem navegador.
 */
const PAGE = 50;

function url(query: string, page: number): string {
  const q = encodeURIComponent(query.trim());
  return `https://www.carrefour.com.br/api/io/_v/api/intelligent-search/product_search/?query=${q}&page=${page}&count=${PAGE}&locale=pt-BR&hideUnavailableItems=true`;
}

export function parseCarrefourJson(json: unknown, fetchedAt: string): Offer[] {
  const products = json && typeof json === "object" ? (json as { products?: unknown }).products : null;
  if (!Array.isArray(products)) return [];
  const offers: Offer[] = [];
  for (const product of products) {
    if (product && typeof product === "object") {
      offers.push(
        ...vtexProductToOffers(product as Record<string, unknown>, {
          source: "carrefour",
          sourceName: "Carrefour",
          link: (p) => `https://www.carrefour.com.br${typeof p.link === "string" ? p.link : `/${p.linkText}/p`}`,
        }, fetchedAt),
      );
    }
  }
  return offers;
}

export const carrefourAdapter: MarketplaceAdapter = {
  id: "carrefour",
  name: "Carrefour",
  transport: "plain",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let i = 1; i <= pages; i++) {
      const res = await fetchJson(url(query, i));
      if (res.status === 403 || res.status === 429) throw new ScrapeError(`Carrefour bloqueou a requisição (HTTP ${res.status})`);
      if (res.status >= 400) throw new ScrapeError(`Carrefour respondeu HTTP ${res.status}`);
      const batch = parseCarrefourJson(res.json, fetchedAt);
      offers.push(...batch);
      const total = (res.json as { recordsFiltered?: number } | null)?.recordsFiltered ?? 0;
      if (batch.length === 0 || i * PAGE >= total) break;
    }
    return offers;
  },
};
