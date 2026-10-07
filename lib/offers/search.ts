import { getActiveAdapters } from "./adapters";
import { applyFilters, sortOffers } from "./filters";
import { applyRelevance } from "./relevance";
import type { MarketplaceAdapter, Offer, SearchFilters, SearchResult, SourceStatus } from "./types";

/** Palavras no título que indicam produto usado/recondicionado, mesmo quando a loja não marca. */
const USED_IN_TITLE = /\b(usad[oa]s?|recondicionad[oa]s?|seminov[oa]s?|vitrine|open ?box|refurbished|renewed)\b/i;

/**
 * Normaliza o que vem dos coletores: condição inferida pelo título e
 * remoção de duplicatas (mesma loja, mesmo título, mesmo preço e vendedor:
 * variações de cor que a loja lista separadamente).
 */
function normalize(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  const out: Offer[] = [];
  for (const raw of offers) {
    const offer = raw.condition !== "used" && USED_IN_TITLE.test(raw.title) ? { ...raw, condition: "used" as const } : raw;
    const key = `${offer.source}|${offer.title.toLowerCase().replace(/\s+/g, " ").trim()}|${offer.price}|${offer.cardPrice ?? ""}|${offer.sellerName ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(offer);
  }
  return out;
}

/** Quantas ofertas buscar por origem antes de filtrar. */
const MAX_RESULTS_PER_SOURCE = Number(process.env.MAX_RESULTS_PER_SOURCE ?? 200);

/**
 * Cache dos resultados BRUTOS por loja e termo (antes de filtros). Mudar um
 * filtro ou a ordenação não volta às lojas: aplica sobre o que já veio.
 * Isso deixa os filtros instantâneos e evita bater nas lojas em rajada
 * (o que aciona a verificação anti-robô do Mercado Livre).
 * SEARCH_CACHE_MIN controla a validade (padrão 15 min; 0 desliga).
 */
const CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_MIN ?? 15) * 60 * 1000;
// Em globalThis para sobreviver ao hot reload do `next dev` (senão cada edição zera o cache).
const cacheState = globalThis as unknown as { __acheiRawCache?: Map<string, { at: number; offers: Offer[] }> };
const rawCache = (cacheState.__acheiRawCache ??= new Map());

function cacheKey(adapterId: string, query: string): string {
  return `${adapterId}|${query.trim().toLowerCase()}`;
}

async function fetchRaw(adapter: MarketplaceAdapter, query: string): Promise<{ offers: Offer[]; cached: boolean }> {
  const key = cacheKey(adapter.id, query);
  const hit = rawCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { offers: hit.offers, cached: true };
  const offers = await adapter.search(query, { maxResults: MAX_RESULTS_PER_SOURCE });
  if (CACHE_TTL_MS > 0) {
    rawCache.set(key, { at: Date.now(), offers });
    for (const [k, v] of rawCache) if (Date.now() - v.at > CACHE_TTL_MS) rawCache.delete(k);
  }
  return { offers, cached: false };
}

/** Esvazia o cache (usado pelos alertas, que querem preço fresco, e pelo botão "Buscar de novo"). */
export function clearSearchCache(query?: string): void {
  if (!query) return rawCache.clear();
  for (const k of rawCache.keys()) if (k.endsWith(`|${query.trim().toLowerCase()}`)) rawCache.delete(k);
}

/**
 * Busca em todos os marketplaces ativos, em paralelo, e devolve a lista
 * unificada já filtrada e ordenada (menor para maior, pelo critério escolhido).
 *
 * Uma origem que falhar não derruba as outras: ela aparece em `sources`
 * com status "error" e a mensagem do problema.
 */
export async function searchAll(query: string, filters: SearchFilters, options: { fresh?: boolean } = {}): Promise<SearchResult> {
  if (options.fresh) clearSearchCache(query);
  const active = getActiveAdapters();
  const adapters = filters.sources ? active.adapters.filter((a) => filters.sources!.includes(a.id)) : active.adapters;

  const started = adapters.map(() => Date.now());
  const settled = await Promise.allSettled(adapters.map((adapter) => fetchRaw(adapter, query)));

  const sources: SourceStatus[] = [];
  const allOffers: Offer[] = [];
  const seen = new Set<string>();

  settled.forEach((result, i) => {
    const adapter = adapters[i];
    const ms = Date.now() - started[i];
    if (result.status === "fulfilled") {
      const normalized = normalize(result.value.offers);
      const relevance = filters.precise ? applyRelevance(normalized, query) : { kept: normalized, hidden: [] };
      const filtered = applyFilters(relevance.kept, filters).filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
      allOffers.push(...filtered);
      sources.push({
        id: adapter.id,
        name: adapter.name,
        status: "ok",
        fetched: result.value.offers.length,
        shown: filtered.length,
        hiddenByPrecision: relevance.hidden.length,
        ms,
        cached: result.value.cached,
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
        ms,
        error: message,
      });
    }
  });

  return {
    query,
    filters,
    offers: sortOffers(allOffers, filters.sort),
    sources,
    demo: active.demo,
  };
}
