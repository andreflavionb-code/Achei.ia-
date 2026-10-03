import type { Offer, SearchFilters } from "./types";

/** Aplica os filtros do usuário sobre a lista já normalizada. */
export function applyFilters(offers: Offer[], filters: SearchFilters): Offer[] {
  return offers.filter((offer) => {
    if (filters.maxPrice !== null && offer.price > filters.maxPrice) return false;

    if (filters.interestFreeOnly) {
      if (!offer.installments || !offer.installments.interestFree) return false;
    }

    if (filters.origin === "national" && offer.isInternational === true) return false;
    if (filters.origin === "international" && offer.isInternational !== true) return false;

    if (filters.freeShippingOnly && offer.freeShipping !== true) return false;
    if (filters.newOnly && offer.condition === "used") return false;

    return true;
  });
}

/** Ordena do menor para o maior preço. Empate: título, para resultado estável. */
export function sortByPriceAsc(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.price - b.price || a.title.localeCompare(b.title));
}
