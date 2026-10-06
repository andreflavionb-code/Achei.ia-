import type { Offer, SearchFilters, SortKey } from "./types";

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
    if (filters.condition === "new" && offer.condition === "used") return false;
    if (filters.condition === "used" && offer.condition !== "used") return false;

    return true;
  });
}

/** Valor usado para ordenar, conforme o critério. Sem informação cai para o preço à vista. */
export function sortValue(offer: Offer, key: SortKey): number {
  if (key === "card") return offer.cardPrice ?? offer.price;
  if (key === "installment") return offer.installments ? offer.installments.amount : offer.cardPrice ?? offer.price;
  return offer.price;
}

/** Ordena crescente pelo critério. Empate: preço à vista, depois título, para resultado estável. */
export function sortOffers(offers: Offer[], key: SortKey = "price"): Offer[] {
  return [...offers].sort(
    (a, b) => sortValue(a, key) - sortValue(b, key) || a.price - b.price || a.title.localeCompare(b.title),
  );
}

/** Ordena do menor para o maior preço à vista. */
export function sortByPriceAsc(offers: Offer[]): Offer[] {
  return sortOffers(offers, "price");
}
