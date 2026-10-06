import { fetchJson, ScrapeError } from "../html";
import { vtexProductToOffers } from "./vtex";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Americanas pela API pública de catálogo da plataforma VTEX
 * (a mesma que a página usa). Sem cadastro, sem navegador.
 * Pagina com _from/_to (máximo 50 por chamada, até 2500 no total).
 */
const PAGE = 50;

function url(query: string, from: number): string {
  return `https://www.americanas.com.br/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(query.trim())}&_from=${from}&_to=${from + PAGE - 1}`;
}

export function parseAmericanasJson(json: unknown, fetchedAt: string): Offer[] {
  if (!Array.isArray(json)) return [];
  const offers: Offer[] = [];
  for (const product of json) {
    if (product && typeof product === "object") {
      offers.push(
        ...vtexProductToOffers(product as Record<string, unknown>, {
          source: "americanas",
          sourceName: "Americanas",
          link: (p) => (typeof p.link === "string" ? p.link : `https://www.americanas.com.br/${p.linkText}/p`),
        }, fetchedAt),
      );
    }
  }
  return offers;
}

export const americanasAdapter: MarketplaceAdapter = {
  id: "americanas",
  name: "Americanas",
  transport: "plain",
  isConfigured: () => true,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(6, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let i = 0; i < pages; i++) {
      const res = await fetchJson(url(query, i * PAGE));
      if (res.status === 403 || res.status === 429) throw new ScrapeError(`Americanas bloqueou a requisição (HTTP ${res.status})`);
      if (res.status >= 400 && res.status !== 404) throw new ScrapeError(`Americanas respondeu HTTP ${res.status}`);
      const batch = parseAmericanasJson(res.json, fetchedAt);
      offers.push(...batch);
      if (!Array.isArray(res.json) || res.json.length < PAGE) break;
    }
    return offers;
  },
};
