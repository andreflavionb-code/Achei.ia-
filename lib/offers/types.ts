/**
 * Modelo único de oferta. Todo marketplace é convertido para este formato,
 * para que ordenação e filtros rodem no nosso lado, não na API de origem.
 */

export type SourceId = "mercadolivre" | "magalu" | "amazon" | "demo";

export interface Installments {
  /** Número de parcelas (ex.: 12). */
  count: number;
  /** Valor de cada parcela. */
  amount: number;
  /** Juros ao mês em %. 0 significa "sem juros". null = desconhecido. */
  rate: number | null;
  /** true quando a loja informa explicitamente que é sem juros. */
  interestFree: boolean;
}

export interface Offer {
  /** Identificador único no agregador (source + externalId). */
  id: string;
  source: SourceId;
  sourceName: string;
  externalId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: string;
  installments: Installments | null;
  /** null = o marketplace não informou. */
  isInternational: boolean | null;
  freeShipping: boolean | null;
  condition: "new" | "used" | "unknown";
  sellerName: string | null;
  imageUrl: string | null;
  /** Link final (com parâmetros de afiliado quando configurado). */
  url: string;
  fetchedAt: string;
}

export type OriginFilter = "all" | "national" | "international";

export interface SearchFilters {
  /** Só ofertas com parcelamento sem juros. */
  interestFreeOnly: boolean;
  origin: OriginFilter;
  /** Preço máximo, em reais. null = sem limite. */
  maxPrice: number | null;
  /** Só frete grátis. */
  freeShippingOnly: boolean;
  /** Só produtos novos. */
  newOnly: boolean;
  /** Modo preciso: esconde acessórios e itens que não batem com a busca. */
  precise: boolean;
}

export const DEFAULT_FILTERS: SearchFilters = {
  interestFreeOnly: false,
  origin: "all",
  maxPrice: null,
  freeShippingOnly: false,
  newOnly: false,
  precise: true,
};

export interface AdapterSearchOptions {
  /** Quantas ofertas, no máximo, buscar na origem antes de filtrar. */
  maxResults: number;
}

export interface MarketplaceAdapter {
  id: SourceId;
  name: string;
  /** false quando faltam credenciais; o adaptador fica inativo. */
  isConfigured(): boolean;
  search(query: string, options: AdapterSearchOptions): Promise<Offer[]>;
}

export interface SourceStatus {
  id: SourceId;
  name: string;
  status: "ok" | "error" | "inactive";
  /** Ofertas retornadas pela origem (antes dos filtros). */
  fetched: number;
  /** Ofertas que sobraram depois dos filtros. */
  shown: number;
  /** Escondidas pelo modo preciso (acessórios etc.). */
  hiddenByPrecision: number;
  error?: string;
}

export interface SearchResult {
  query: string;
  filters: SearchFilters;
  offers: Offer[];
  sources: SourceStatus[];
  /** true quando o resultado inclui dados de exemplo (sem credenciais reais). */
  demo: boolean;
}
