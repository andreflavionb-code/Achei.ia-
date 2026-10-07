/**
 * Modelo único de oferta. Todo marketplace é convertido para este formato,
 * para que ordenação e filtros rodem no nosso lado, não na API de origem.
 */

export type SourceId =
  | "mercadolivre"
  | "magalu"
  | "amazon"
  | "casasbahia"
  | "americanas"
  | "carrefour"
  | "kabum"
  | "aliexpress"
  | "buscape"
  | "googleshopping"
  | "shopee"
  | "demo";

export interface Installments {
  /** Número de parcelas (ex.: 12). */
  count: number;
  /** Valor de cada parcela. */
  amount: number;
  /** Juros ao mês em %. 0 significa "sem juros". null = desconhecido. */
  rate: number | null;
  /** true = sem juros; false = com juros; null = a loja não informou (ex.: parcela anunciada sobre preço à vista com desconto). */
  interestFree: boolean | null;
}

export interface Offer {
  /** Identificador único no agregador (source + externalId). */
  id: string;
  source: SourceId;
  sourceName: string;
  externalId: string;
  title: string;
  /** Menor preço à vista (Pix/boleto quando a loja dá desconto; senão o preço normal). */
  price: number;
  /** Preço no cartão quando é diferente do à vista (base do parcelamento). null = igual ao price. */
  cardPrice: number | null;
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
export type ConditionFilter = "all" | "new" | "used";
/**
 * Critério de ordenação (sempre crescente):
 *  - price: menor preço à vista;
 *  - card: menor preço no cartão (total parcelado);
 *  - installment: menor valor da parcela.
 */
export type SortKey = "price" | "card" | "installment";

export interface SearchFilters {
  /** Só ofertas com parcelamento sem juros. */
  interestFreeOnly: boolean;
  origin: OriginFilter;
  /** Preço máximo, em reais. null = sem limite. */
  maxPrice: number | null;
  /** Só frete grátis. */
  freeShippingOnly: boolean;
  /** Novo, usado ou ambos. */
  condition: ConditionFilter;
  /** Modo preciso: esconde acessórios e itens que não batem com a busca. */
  precise: boolean;
  sort: SortKey;
  /** Lojas a consultar. null = todas as ativas. */
  sources: SourceId[] | null;
}

export const DEFAULT_FILTERS: SearchFilters = {
  interestFreeOnly: false,
  origin: "all",
  maxPrice: null,
  freeShippingOnly: false,
  condition: "all",
  precise: true,
  sort: "price",
  sources: null,
};

export interface AdapterSearchOptions {
  /** Quantas ofertas, no máximo, buscar na origem antes de filtrar. */
  maxResults: number;
}

export interface MarketplaceAdapter {
  id: SourceId;
  name: string;
  /** Como a origem é lida: "api" (oficial), "plain" (página/JSON público), "browser" (Chrome escondido). */
  transport: "api" | "plain" | "browser" | "demo";
  /** false quando faltam credenciais; o adaptador fica inativo. */
  isConfigured(): boolean;
  search(query: string, options: AdapterSearchOptions): Promise<Offer[]>;
}

export interface FilterReasons {
  /** Parcelamento com juros. */
  interest: number;
  /** Loja não informou se tem juros. */
  unknownInstallments: number;
  origin: number;
  condition: number;
  shipping: number;
  price: number;
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
  /** Tempo da coleta, em ms. */
  ms?: number;
  /** true quando veio do cache (busca recente com o mesmo termo). */
  cached?: boolean;
  /** Quantas ofertas cada filtro tirou (depois do modo preciso). */
  filtered?: FilterReasons;
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
