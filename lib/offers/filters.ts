import type { FilterReasons, Offer, SearchFilters, SortKey } from "./types";

export function emptyReasons(): FilterReasons {
  return { interest: 0, unknownInstallments: 0, origin: 0, condition: 0, shipping: 0, price: 0 };
}

/** Aplica os filtros e conta por que cada oferta saiu (para a tabela por loja). */
export function filterWithReasons(offers: Offer[], filters: SearchFilters): { kept: Offer[]; reasons: FilterReasons } {
  const reasons = emptyReasons();
  const kept = offers.filter((offer) => {
    if (filters.maxPrice !== null && offer.price > filters.maxPrice) return reasons.price++, false;

    if (filters.interestFreeOnly) {
      const ok = offer.installments?.interestFree;
      if (ok === false) return reasons.interest++, false;
      if (ok !== true) return reasons.unknownInstallments++, false;
    }

    if (filters.origin === "national" && offer.isInternational === true) return reasons.origin++, false;
    if (filters.origin === "international" && offer.isInternational !== true) return reasons.origin++, false;

    if (filters.freeShippingOnly && offer.freeShipping !== true) return reasons.shipping++, false;
    if (filters.condition === "new" && offer.condition === "used") return reasons.condition++, false;
    if (filters.condition === "used" && offer.condition !== "used") return reasons.condition++, false;

    return true;
  });
  return { kept, reasons };
}

/** Aplica os filtros do usuário sobre a lista já normalizada. */
export function applyFilters(offers: Offer[], filters: SearchFilters): Offer[] {
  return filterWithReasons(offers, filters).kept;
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
