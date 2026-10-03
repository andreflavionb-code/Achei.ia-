import type { MarketplaceAdapter, SourceId } from "../types";
import { mercadoLivreAdapter } from "./mercadolivre";
import { mercadoLivreWebAdapter } from "./mercadolivre-web";
import { magaluAdapter } from "./magalu";
import { amazonAdapter } from "./amazon";
import { demoAdapter } from "./demo";

/**
 * Registro de marketplaces.
 *
 * - Coletores de página pública (sem cadastro): Mercado Livre, Magazine
 *   Luiza, Amazon. Ligados por padrão; escolha com SOURCES=mercadolivre,magalu.
 * - API oficial do Mercado Livre: usada no lugar do coletor de página
 *   quando ML_CLIENT_ID/ML_CLIENT_SECRET estão definidos.
 * - DEMO_MODE=1 acrescenta dados de exemplo.
 *
 * Para adicionar um marketplace, crie um adaptador em ./ e inclua em
 * WEB_ADAPTERS (ou nos oficiais, se exigir credenciais).
 */
const WEB_ADAPTERS: MarketplaceAdapter[] = [mercadoLivreWebAdapter, magaluAdapter, amazonAdapter];

function enabledSourceIds(): Set<SourceId> | null {
  const raw = process.env.SOURCES?.trim();
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()) as SourceId[]);
}

export function getActiveAdapters(): { adapters: MarketplaceAdapter[]; demo: boolean } {
  const enabled = enabledSourceIds();
  const useMlApi = mercadoLivreAdapter.isConfigured();

  const adapters: MarketplaceAdapter[] = [];
  if (useMlApi) adapters.push(mercadoLivreAdapter);
  for (const adapter of WEB_ADAPTERS) {
    if (useMlApi && adapter.id === "mercadolivre") continue;
    adapters.push(adapter);
  }

  const filtered = enabled ? adapters.filter((a) => enabled.has(a.id)) : adapters;
  const demo = process.env.DEMO_MODE === "1" || filtered.length === 0;
  if (demo) filtered.push(demoAdapter);

  return { adapters: filtered, demo };
}

export function getAllAdapters(): MarketplaceAdapter[] {
  return [mercadoLivreAdapter, ...WEB_ADAPTERS, demoAdapter];
}
