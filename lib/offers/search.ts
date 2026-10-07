import { getActiveAdapters } from "./adapters";
import { filterWithReasons, sortOffers } from "./filters";
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
    let offer = raw.condition !== "used" && USED_IN_TITLE.test(raw.title) ? { ...raw, condition: "used" as const } : raw;
    // Parcelas cujo total bate com o preço no cartão (ou à vista, sem desconto) são sem juros,
    // mesmo quando a loja não escreve "sem juros" (Amazon, Google Shopping).
    const inst = offer.installments;
    if (inst && inst.interestFree !== true && inst.count > 1) {
      const base = offer.cardPrice ?? offer.price;
      if (Math.abs(inst.count * inst.amount - base) <= 0.01 * base + 0.05) {
        offer = { ...offer, installments: { ...inst, rate: 0, interestFree: true } };
      }
    }
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
/** Loja que bloqueou/falhou: não insiste por alguns minutos (insistir prolonga o bloqueio). */
const ERROR_TTL_MS = Number(process.env.SEARCH_ERROR_CACHE_MIN ?? 5) * 60 * 1000;
const errorCache = ((globalThis as unknown as { __acheiErrCache?: Map<string, { at: number; message: string }> }).__acheiErrCache ??= new Map());

function cacheKey(adapterId: string, query: string): string {
  return `${adapterId}|${query.trim().toLowerCase()}`;
}

async function fetchRaw(adapter: MarketplaceAdapter, query: string): Promise<{ offers: Offer[]; cached: boolean }> {
  const key = cacheKey(adapter.id, query);
  const hit = rawCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { offers: hit.offers, cached: true };
  const failed = errorCache.get(key);
  if (failed && Date.now() - failed.at < ERROR_TTL_MS) {
    const min = Math.ceil((ERROR_TTL_MS - (Date.now() - failed.at)) / 60000);
    throw new Error(`${failed.message} (nova tentativa automática em ${min} min; "Buscar de novo" força agora)`);
  }
  let offers: Offer[];
  try {
    offers = await adapter.search(query, { maxResults: MAX_RESULTS_PER_SOURCE });
  } catch (err) {
    if (ERROR_TTL_MS > 0) errorCache.set(key, { at: Date.now(), message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  errorCache.delete(key);
  if (CACHE_TTL_MS > 0) {
    rawCache.set(key, { at: Date.now(), offers });
    for (const [k, v] of rawCache) if (Date.now() - v.at > CACHE_TTL_MS) rawCache.delete(k);
  }
  return { offers, cached: false };
}

/** Esvazia o cache (usado pelos alertas, que querem preço fresco, e pelo botão "Buscar de novo"). */
export function clearSearchCache(query?: string): void {
  if (!query) {
    rawCache.clear();
    errorCache.clear();
    return;
  }
  const suffix = `|${query.trim().toLowerCase()}`;
  for (const k of rawCache.keys()) if (k.endsWith(suffix)) rawCache.delete(k);
  for (const k of errorCache.keys()) if (k.endsWith(suffix)) errorCache.delete(k);
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
      const { kept, reasons } = filterWithReasons(relevance.kept, filters);
      const filtered = kept.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
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
        filtered: reasons,
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
