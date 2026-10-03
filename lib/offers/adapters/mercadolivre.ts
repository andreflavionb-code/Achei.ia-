import { getValidAccessToken, getMlCredentials } from "@/lib/mercadolivre/auth";
import { toAffiliateUrl } from "@/lib/mercadolivre/affiliate";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

const SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";
/** Limite máximo por página aceito pela API. */
const PAGE_SIZE = 50;

/** Campos que usamos da resposta da API. O restante é ignorado. */
interface MlItem {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  currency_id: string;
  permalink: string;
  thumbnail?: string;
  condition?: string;
  installments?: {
    quantity: number;
    amount: number;
    rate: number;
    currency_id: string;
  } | null;
  shipping?: { free_shipping?: boolean } | null;
  seller?: { nickname?: string } | null;
  official_store_name?: string | null;
  seller_address?: { country?: { id?: string } } | null;
  international_delivery_mode?: string | null;
  tags?: string[];
}

interface MlSearchResponse {
  paging: { total: number; offset: number; limit: number };
  results: MlItem[];
}

/**
 * Decide se o anúncio é internacional.
 * A API não tem um campo único para isso; combinamos os sinais que existem.
 */
function detectInternational(item: MlItem): boolean | null {
  const country = item.seller_address?.country?.id;
  if (country) return country !== "BR";
  if (item.international_delivery_mode && item.international_delivery_mode !== "none") return true;
  if (item.tags?.some((t) => t === "cbt_item" || t.includes("international"))) return true;
  return null;
}

function toOffer(item: MlItem, fetchedAt: string): Offer {
  const inst = item.installments;
  return {
    id: `mercadolivre:${item.id}`,
    source: "mercadolivre",
    sourceName: "Mercado Livre",
    externalId: item.id,
    title: item.title,
    price: item.price,
    originalPrice: item.original_price ?? null,
    currency: item.currency_id,
    installments: inst
      ? {
          count: inst.quantity,
          amount: inst.amount,
          rate: inst.rate,
          interestFree: inst.rate === 0,
        }
      : null,
    isInternational: detectInternational(item),
    freeShipping: item.shipping?.free_shipping ?? null,
    condition: item.condition === "new" ? "new" : item.condition === "used" ? "used" : "unknown",
    sellerName: item.official_store_name ?? item.seller?.nickname ?? null,
    imageUrl: item.thumbnail?.replace(/^http:/, "https:") ?? null,
    url: toAffiliateUrl(item.permalink),
    fetchedAt,
  };
}

async function fetchPage(query: string, offset: number, token: string): Promise<MlSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mercado Livre respondeu ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as MlSearchResponse;
}

export const mercadoLivreAdapter: MarketplaceAdapter = {
  id: "mercadolivre",
  name: "Mercado Livre",

  isConfigured() {
    return getMlCredentials() !== null;
  },

  /**
   * Busca SEM pedir ordenação à API. Pegamos várias páginas e ordenamos
   * nós mesmos, para não cair no corte de resultados que o site aplica
   * quando se ordena por preço.
   */
  async search(query, options: AdapterSearchOptions) {
    const token = await getValidAccessToken();
    if (!token) {
      throw new Error(
        "Aplicativo não autorizado. Abra /api/auth/mercadolivre para conectar sua conta.",
      );
    }

    const fetchedAt = new Date().toISOString();
    const first = await fetchPage(query, 0, token);
    const total = Math.min(first.paging.total, options.maxResults);
    const items: MlItem[] = [...first.results];

    const remainingOffsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) remainingOffsets.push(offset);

    // Páginas restantes em paralelo (poucas; o limite vem de maxResults).
    const pages = await Promise.allSettled(remainingOffsets.map((o) => fetchPage(query, o, token)));
    for (const page of pages) {
      if (page.status === "fulfilled") items.push(...page.value.results);
    }

    const seen = new Set<string>();
    const offers: Offer[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      offers.push(toOffer(item, fetchedAt));
    }
    return offers;
  },
};
