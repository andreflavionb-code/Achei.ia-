import { createHash } from "node:crypto";
import { asNumber, asString, getPath, ScrapeError } from "../html";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Shopee pela Open API de afiliados (open-api.affiliate.shopee.com.br).
 *
 * O site da Shopee bloqueia qualquer acesso automatizado (até o Chrome
 * escondido cai em "verify/traffic"), então a única porta é a API do
 * programa de afiliados. Pegue o App ID e a Secret em
 * https://affiliate.shopee.com.br > Ferramentas > Open API, e coloque em
 * SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env. Os links já vêm com o
 * rastreio de afiliado (offerLink).
 *
 * Autenticação: header
 *   Authorization: SHA256 Credential=<appId>, Timestamp=<unix>, Signature=<sha256(appId+timestamp+payload+secret)>
 */
const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
const PAGE = 50;

export function getShopeeCredentials() {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret };
}

export function signShopee(appId: string, secret: string, payload: string, timestamp: number): string {
  return createHash("sha256").update(`${appId}${timestamp}${payload}${secret}`).digest("hex");
}

const QUERY = `query Busca($keyword: String!, $page: Int!, $limit: Int!) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
    nodes { itemId productName priceMin priceMax imageUrl shopName productLink offerLink sales ratingStar commissionRate }
    pageInfo { page limit hasNextPage }
  }
}`;

export async function shopeeRequest(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const creds = getShopeeCredentials();
  if (!creds) throw new ScrapeError("Shopee: defina SHOPEE_APP_ID e SHOPEE_APP_SECRET (API de afiliados).");
  const payload = JSON.stringify({ query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signShopee(creds.appId, creds.secret, payload, timestamp);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${creds.appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: { message?: string }[] } | null;
  if (!res.ok || !json) throw new ScrapeError(`Shopee respondeu HTTP ${res.status}`);
  if (json.errors?.length) throw new ScrapeError(`Shopee: ${json.errors[0]?.message ?? "erro na API"}`);
  return json.data;
}

export function parseShopeeNodes(nodes: unknown[], fetchedAt: string): Offer[] {
  const offers: Offer[] = [];
  for (const n of nodes) {
    const id = asString(getPath(n, "itemId")) ?? (asNumber(getPath(n, "itemId")) !== null ? String(asNumber(getPath(n, "itemId"))) : null);
    const title = asString(getPath(n, "productName"));
    const price = asNumber(getPath(n, "priceMin"));
    if (!id || !title || !price || price <= 0) continue;
    const url = asString(getPath(n, "offerLink")) ?? asString(getPath(n, "productLink"));
    if (!url) continue;
    offers.push({
      id: `shopee:${id}`,
      source: "shopee",
      sourceName: "Shopee",
      externalId: id,
      title,
      price,
      cardPrice: null,
      originalPrice: null,
      currency: "BRL",
      installments: null,
      isInternational: null,
      freeShipping: null,
      condition: "new",
      sellerName: asString(getPath(n, "shopName")),
      imageUrl: asString(getPath(n, "imageUrl")),
      url,
      fetchedAt,
    });
  }
  return offers;
}

export const shopeeAdapter: MarketplaceAdapter = {
  id: "shopee",
  name: "Shopee",
  transport: "api",
  isConfigured: () => getShopeeCredentials() !== null,

  async search(query, options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    const pages = Math.max(1, Math.min(4, Math.ceil(options.maxResults / PAGE)));
    const offers: Offer[] = [];
    for (let page = 1; page <= pages; page++) {
      const data = await shopeeRequest(QUERY, { keyword: query.trim(), page, limit: PAGE });
      const nodes = getPath(data, "productOfferV2.nodes");
      const batch = parseShopeeNodes(Array.isArray(nodes) ? nodes : [], fetchedAt);
      offers.push(...batch);
      if (!getPath(data, "productOfferV2.pageInfo.hasNextPage") || batch.length === 0) break;
    }
    return offers;
  },
};
