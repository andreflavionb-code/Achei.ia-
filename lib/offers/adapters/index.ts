import type { MarketplaceAdapter } from "../types";
import { mercadoLivreAdapter } from "./mercadolivre";
import { demoAdapter } from "./demo";

/**
 * Registro de marketplaces. Para adicionar um novo (Shopee, Amazon,
 * AliExpress...), crie um arquivo em ./adapters que implemente
 * MarketplaceAdapter e inclua aqui.
 */
const REAL_ADAPTERS: MarketplaceAdapter[] = [mercadoLivreAdapter];

export function getActiveAdapters(): { adapters: MarketplaceAdapter[]; demo: boolean } {
  const configured = REAL_ADAPTERS.filter((a) => a.isConfigured());
  const forceDemo = process.env.DEMO_MODE === "1";

  if (configured.length === 0 || forceDemo) {
    return { adapters: [...configured, demoAdapter], demo: true };
  }
  return { adapters: configured, demo: false };
}

export function getAllAdapters(): MarketplaceAdapter[] {
  return [...REAL_ADAPTERS, demoAdapter];
}
