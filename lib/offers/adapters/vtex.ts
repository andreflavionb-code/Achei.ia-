import { asNumber, asString, getPath } from "../html";
import type { Installments, Offer, SourceId } from "../types";

/**
 * Lojas na plataforma VTEX (Americanas, Carrefour e muitas outras) devolvem
 * o mesmo formato de produto: items[] -> sellers[] -> commertialOffer.
 * Este módulo converte esse formato para Offer; cada loja só diz de onde
 * vêm os dados e como montar o link.
 */

interface VtexConfig {
  source: SourceId;
  sourceName: string;
  /** Monta a URL do produto a partir do objeto bruto. */
  link: (product: Record<string, unknown>) => string;
}

function bestInstallments(raw: unknown[], cardPrice: number): Installments | null {
  // Maior número de parcelas sem juros; se não houver, a maior com juros.
  let free: { count: number; amount: number } | null = null;
  let paid: { count: number; amount: number; rate: number } | null = null;
  for (const entry of raw) {
    const count = asNumber(getPath(entry, "NumberOfInstallments"));
    const amount = asNumber(getPath(entry, "Value"));
    const rate = asNumber(getPath(entry, "InterestRate")) ?? 0;
    const total = asNumber(getPath(entry, "TotalValuePlusInterestRate")) ?? (count && amount ? count * amount : null);
    if (!count || !amount || count < 2) continue;
    const interestFree = rate === 0 && (total === null || Math.abs(total - cardPrice) < 0.02 * cardPrice);
    if (interestFree) {
      if (!free || count > free.count) free = { count, amount };
    } else if (!paid || count > paid.count) {
      paid = { count, amount, rate };
    }
  }
  if (free) return { count: free.count, amount: free.amount, rate: 0, interestFree: true };
  if (paid) return { count: paid.count, amount: paid.amount, rate: paid.rate || null, interestFree: false };
  return null;
}

function firstOf(v: unknown): string | null {
  if (Array.isArray(v)) return asString(v[0]);
  return asString(v);
}

export function vtexProductToOffers(product: Record<string, unknown>, config: VtexConfig, fetchedAt: string): Offer[] {
  const title = asString(product.productName) ?? asString(product.productTitle);
  const productId = asString(product.productId);
  if (!title || !productId) return [];

  const international = firstOf(product["Produto Internacional"]);
  const isInternational = international ? /^sim$/i.test(international) : null;
  const conditionText = firstOf(product["Condição do Item"]);
  const condition: Offer["condition"] = conditionText ? (/usado|recondicionado|seminovo|vitrine|open ?box/i.test(conditionText) ? "used" : "new") : /\busad[oa]\b|recondicionad|seminov|vitrine|open ?box/i.test(title) ? "used" : "new";

  const url = config.link(product);
  const items = Array.isArray(product.items) ? product.items : [];
  const offers: Offer[] = [];

  for (const item of items) {
    const itemId = asString(getPath(item, "itemId")) ?? productId;
    const image = asString(getPath(item, "images.0.imageUrl"));
    const sellers = Array.isArray(getPath(item, "sellers")) ? (getPath(item, "sellers") as unknown[]) : [];
    // Uma oferta por vendedor disponível (marketplace: a mesma coisa pode ter vários preços).
    for (const seller of sellers) {
      const co = getPath(seller, "commertialOffer") as Record<string, unknown> | undefined;
      if (!co) continue;
      const available = (asNumber(co.AvailableQuantity) ?? 0) > 0 || co.IsAvailable === true;
      const cardPrice = asNumber(co.Price);
      if (!available || !cardPrice || cardPrice <= 0) continue;
      const listPrice = asNumber(co.ListPrice);
      const installments = bestInstallments(Array.isArray(co.Installments) ? co.Installments : [], cardPrice);
      // Preço à vista: o menor entre o preço e alguma parcela única com desconto (Pix/boleto).
      let price = cardPrice;
      for (const entry of Array.isArray(co.Installments) ? co.Installments : []) {
        const n = asNumber(getPath(entry, "NumberOfInstallments"));
        const v = asNumber(getPath(entry, "Value"));
        if (n === 1 && v && v > 0 && v < price) price = v;
      }
      const sellerId = asString(getPath(seller, "sellerId")) ?? "1";
      const sellerName = asString(getPath(seller, "sellerName"));
      const externalId = sellers.length > 1 ? `${itemId}:${sellerId}` : itemId;
      offers.push({
        id: `${config.source}:${externalId}`,
        source: config.source,
        sourceName: config.sourceName,
        externalId,
        title: asString(getPath(item, "nameComplete")) ?? title,
        price,
        cardPrice: cardPrice > price ? cardPrice : null,
        originalPrice: listPrice && listPrice > cardPrice ? listPrice : null,
        currency: "BRL",
        installments,
        isInternational,
        freeShipping: null,
        condition,
        sellerName,
        imageUrl: image && image.startsWith("http") ? image : null,
        url,
        fetchedAt,
      });
    }
  }
  return offers;
}
