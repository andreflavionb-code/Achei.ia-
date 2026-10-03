import type { MarketplaceAdapter, Offer } from "../types";

/**
 * Adaptador de demonstração.
 *
 * Gera ofertas de exemplo, determinísticas a partir do termo buscado, para
 * que a interface, os filtros, a ordenação e os alertas possam ser testados
 * sem credenciais de nenhum marketplace. Fica ativo quando nenhum adaptador
 * real está configurado, ou quando DEMO_MODE=1.
 */

const STORES = ["Loja Central", "TechMais", "Importados BR", "MegaShop", "Oficial Store"];
const SUFFIXES = ["", " Pro", " Max", " Lite", " 128GB", " 256GB", " Preto", " Branco", " Kit", " Plus"];

/** Hash simples e estável (FNV-1a) para tornar o resultado reprodutível. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const demoAdapter: MarketplaceAdapter = {
  id: "demo",
  name: "Dados de exemplo",

  isConfigured() {
    return true;
  },

  async search(query, options) {
    const seed = hash(query.trim().toLowerCase());
    const next = rng(seed);
    const basePrice = 80 + (seed % 4000);
    const count = Math.min(options.maxResults, 36);
    const fetchedAt = new Date().toISOString();

    const offers: Offer[] = [];
    for (let i = 0; i < count; i++) {
      const price = Math.round(basePrice * (0.6 + next() * 1.4) * 100) / 100;
      const hasDiscount = next() < 0.3;
      const installmentsCount = [1, 3, 6, 10, 12][Math.floor(next() * 5)];
      const rate = next() < 0.55 ? 0 : Math.round((1 + next() * 3) * 100) / 100;
      const international = next() < 0.3;
      const amount =
        rate === 0
          ? price / installmentsCount
          : (price * Math.pow(1 + rate / 100, installmentsCount)) / installmentsCount;

      offers.push({
        id: `demo:${seed}-${i}`,
        source: "demo",
        sourceName: "Dados de exemplo",
        externalId: `${seed}-${i}`,
        title: `${query.trim()}${SUFFIXES[i % SUFFIXES.length]}`,
        price,
        originalPrice: hasDiscount ? Math.round(price * 1.2 * 100) / 100 : null,
        currency: "BRL",
        installments:
          installmentsCount > 1
            ? {
                count: installmentsCount,
                amount: Math.round(amount * 100) / 100,
                rate,
                interestFree: rate === 0,
              }
            : null,
        isInternational: international,
        freeShipping: next() < 0.5,
        condition: next() < 0.9 ? "new" : "used",
        sellerName: STORES[Math.floor(next() * STORES.length)],
        imageUrl: null,
        url: `https://example.com/produto/${seed}-${i}`,
        fetchedAt,
      });
    }
    return offers;
  },
};
