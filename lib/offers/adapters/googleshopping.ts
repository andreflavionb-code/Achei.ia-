import { parse, type HTMLElement } from "node-html-parser";
import { dumpDebug, parseBRL, ScrapeError } from "../html";
import { loadAndParse, type PageSource } from "../fetchPage";
import type { AdapterSearchOptions, MarketplaceAdapter, Offer } from "../types";

/**
 * Google Shopping (google.com/search?udm=28). Bloqueia requisição simples e
 * headless (captcha "sorry"), mas abre numa janela real: usamos o Chrome
 * escondido. A página traz dois tipos de resultado:
 *
 *  - cards orgânicos: título, preço, parcelas, loja e imagem, SEM link
 *    direto (o Google abre um painel por clique). O link vai para a busca
 *    do próprio Google Shopping com o título exato.
 *  - unidades patrocinadas ("Promoção"/anúncios): têm link direto para a
 *    loja (Mercado Livre, Magalu, Amazon, Shopee...).
 *
 * As classes do Google mudam com frequência; por isso lemos pela
 * estrutura e pelos aria-labels ("R$ 3.799,00 agora. 10 parcelas de R$ 422,11.").
 */

function buildUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}&udm=28&hl=pt-BR&gl=br`;
}

function text(el: HTMLElement | null | undefined): string {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

const HOST_NAMES: Record<string, string> = {
  "mercadolivre.com.br": "Mercado Livre",
  "produto.mercadolivre.com.br": "Mercado Livre",
  "magazineluiza.com.br": "Magalu",
  "amazon.com.br": "Amazon",
  "americanas.com.br": "Americanas",
  "shopee.com.br": "Shopee",
  "casasbahia.com.br": "Casas Bahia",
  "pontofrio.com.br": "Pontofrio",
  "extra.com.br": "Extra",
  "kabum.com.br": "KaBuM!",
  "carrefour.com.br": "Carrefour",
  "aliexpress.com": "AliExpress",
  "fastshop.com.br": "Fast Shop",
};

function merchantFromUrl(href: string): string | null {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return HOST_NAMES[host] ?? HOST_NAMES[host.replace(/^[a-z0-9-]+\./, "")] ?? host;
  } catch {
    return null;
  }
}

function cleanMerchant(raw: string): string | null {
  const m = raw.replace(/\s*e mais$/i, "").replace(/\s*-\s*Seller$/i, "").trim();
  return m || null;
}

function installmentsFrom(label: string, price: number): Offer["installments"] {
  const m = label.match(/(\d{1,2})\s*parcelas?\s*de\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!m) return null;
  const count = Number(m[1]);
  const amount = parseBRL(m[2]);
  if (!count || !amount) return null;
  const total = count * amount;
  // O preço do Google costuma ser o à vista; parcela maior que isso não diz se há juros sobre o preço no cartão.
  const interestFree = Math.abs(total - price) < 0.02 * price ? true : null;
  return { count, amount, rate: interestFree ? 0 : null, interestFree };
}

function searchUrl(title: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(title)}&udm=28&hl=pt-BR&gl=br`;
}

function makeOffer(fields: {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  installments: Offer["installments"];
  merchant: string | null;
  imageUrl: string | null;
  url: string;
  fetchedAt: string;
}): Offer {
  return {
    id: `googleshopping:${fields.id}`,
    source: "googleshopping",
    sourceName: "Google Shopping",
    externalId: fields.id,
    title: fields.title,
    price: fields.price,
    cardPrice: null,
    originalPrice: fields.originalPrice && fields.originalPrice > fields.price ? fields.originalPrice : null,
    currency: "BRL",
    installments: fields.installments,
    isInternational: null,
    freeShipping: null,
    condition: "new",
    sellerName: fields.merchant,
    imageUrl: fields.imageUrl && fields.imageUrl.startsWith("http") ? fields.imageUrl : null,
    url: fields.url,
    fetchedAt: fields.fetchedAt,
  };
}

export function parseGoogleShoppingHtml(html: string, fetchedAt: string): Offer[] {
  const root = parse(html);
  const offers: Offer[] = [];
  const seen = new Set<string>();

  // 1) Cards orgânicos: o bloco de preço tem role="group" e aria-label começando com "R$".
  const priceGroups = root
    .querySelectorAll('[role="group"][aria-label]')
    .filter((e) => /^R\$/.test((e.getAttribute("aria-label") ?? "").trim()));
  for (const group of priceGroups) {
    const label = (group.getAttribute("aria-label") ?? "").replace(/ /g, " ").trim();
    const price = parseBRL(label.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/)?.[1]);
    if (!price || price <= 0) continue;
    const priceRow = group.parentNode as HTMLElement | null;
    const body = priceRow?.parentNode as HTMLElement | null;
    if (!priceRow || !body) continue;
    const rows = body.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    const idx = rows.indexOf(priceRow);
    const title = text(body.querySelector('[style*="line-clamp"]')) || text(rows[0]);
    if (!title) continue;
    const merchant = cleanMerchant(text(rows[idx + 1] ?? null));
    const key = `${title}|${price}|${merchant ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let card: HTMLElement | null = body;
    for (let i = 0; i < 10 && card && card.tagName !== "G-INNER-CARD"; i++) card = card.parentNode as HTMLElement | null;
    const img = card?.querySelector("img")?.getAttribute("src") ?? null;
    offers.push(
      makeOffer({
        id: `org-${offers.length}-${title.slice(0, 40)}-${price}`.replace(/\s+/g, "_"),
        title,
        price,
        originalPrice: null,
        installments: installmentsFrom(label, price),
        merchant,
        imageUrl: img,
        url: searchUrl(title),
        fetchedAt,
      }),
    );
  }

  // 2) Unidades patrocinadas: link direto para a loja.
  for (const container of root.querySelectorAll(".pla-unit-container")) {
    const link = container.querySelector('a[href^="http"]:not([href*="google."])') ?? container.querySelector("a.pla-unit-single-clickable-target[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!/^https?:\/\//.test(href) || /google\./.test(href)) continue;
    const raw = text(container).replace(/ /g, " ");
    const priceMatch = raw.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
    const price = parseBRL(priceMatch?.[1]);
    if (!price || price <= 0 || !priceMatch) continue;
    // O título é o heading do anúncio; sem heading, o texto antes do preço.
    const heading = text(container.querySelector('[role="heading"]'));
    const title = heading || raw.slice(0, priceMatch.index).replace(/^Promoção\s*/i, "").trim();
    if (!title) continue;
    const after = raw.slice(priceMatch.index! + priceMatch[0].length);
    const original = parseBRL(after.match(/^\s*R?\$?\s*([\d.]+(?:,\d{1,2})?)/)?.[1]);
    const merchant = merchantFromUrl(href);
    const key = `${title}|${price}|${merchant ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const idMatch = container.querySelector("[data-offer-id]")?.getAttribute("data-offer-id") ?? null;
    offers.push(
      makeOffer({
        id: idMatch ?? `pla-${offers.length}-${price}`,
        title,
        price,
        originalPrice: original,
        installments: null,
        merchant,
        imageUrl: null,
        url: href,
        fetchedAt,
      }),
    );
  }
  return offers;
}

const GS_SOURCE: PageSource = {
  name: "Google Shopping",
  waitFor: '[role="group"][aria-label^="R$"], .pla-unit-container',
  isBlocked: (html, finalUrl, status) =>
    status === 429 || /\/sorry\//.test(finalUrl) || /tráfego incomum|unusual traffic|recaptcha\/api/i.test(html) && !/udm=28/.test(html),
  isEmpty: (html) => /Nenhum resultado encontrado|não encontrou nenhum resultado/i.test(html),
};

export const googleShoppingAdapter: MarketplaceAdapter = {
  id: "googleshopping",
  name: "Google Shopping",
  transport: "browser",
  isConfigured: () => true,

  async search(query, _options: AdapterSearchOptions) {
    const fetchedAt = new Date().toISOString();
    // Só pela janela real: a requisição simples cai no captcha. SCRAPE_MODE=plain desliga esta fonte.
    const page = await loadAndParse(buildUrl(query), GS_SOURCE, (html) => parseGoogleShoppingHtml(html, fetchedAt));
    if (page.items.length === 0) {
      if (GS_SOURCE.isEmpty?.(page.html)) return [];
      const file = await dumpDebug("googleshopping", page.html);
      throw new ScrapeError(`Nenhum produto reconhecido na página do Google Shopping${file ? `. HTML salvo em ${file}` : ""}`);
    }
    return page.items;
  },
};
