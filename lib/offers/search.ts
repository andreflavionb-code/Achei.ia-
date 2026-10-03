import { getActiveAdapters } from "./adapters";
import { applyFilters, sortByPriceAsc } from "./filters";
import { applyRelevance } from "./relevance";
import type { Offer, SearchFilters, SearchResult, SourceStatus } from "./types";

/** Quantas ofertas buscar por origem antes de filtrar. */
const MAX_RESULTS_PER_SOURCE = Number(process.env.MAX_RESULTS_PER_SOURCE ?? 200);

/**
 * Busca em todos os marketplaces ativos, em paralelo, e devolve a lista
 * unificada já filtrada e ordenada do menor para o maior preço.
 *
 * Uma origem que falhar não derruba as outras: ela aparece em `sources`
 * com status "error" e a mensagem do problema.
 */
export async function searchAll(query: string, filters: SearchFilters): Promise<SearchResult> {
  const { adapters, demo } = getActiveAdapters();

  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.search(query, { maxResults: MAX_RESULTS_PER_SOURCE })),
  );

  const sources: SourceStatus[] = [];
  const allOffers: Offer[] = [];

  settled.forEach((result, i) => {
    const adapter = adapters[i];
    if (result.status === "fulfilled") {
      const relevance = filters.precise ? applyRelevance(result.value, query) : { kept: result.value, hidden: [] };
      const filtered = applyFilters(relevance.kept, filters);
      allOffers.push(...filtered);
      sources.push({
        id: adapter.id,
        name: adapter.name,
        status: "ok",
        fetched: result.value.length,
        shown: filtered.length,
        hiddenByPrecision: relevance.hidden.length,
      });
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sources.push({
        id: adapter.id,
        name: adapter.name,
        status: "error",
        fetched: 0,
        shown: 0,
        hiddenByPrecision: 0,
        error: message,
      });
    }
  });

  return {
    query,
    filters,
    offers: sortByPriceAsc(allOffers),
    sources,
    demo,
  };
}
