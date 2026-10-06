import { z } from "zod";
import { DEFAULT_FILTERS, type SearchFilters, type SourceId } from "./types";

const boolParam = z
  .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false"), z.boolean()])
  .transform((v) => v === true || v === "1" || v === "true");

export const SOURCE_IDS: SourceId[] = [
  "mercadolivre", "magalu", "amazon", "casasbahia", "americanas", "carrefour", "kabum", "aliexpress", "buscape", "demo",
];

const sourcesParam = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter((s): s is SourceId => (SOURCE_IDS as string[]).includes(s)));

export const filtersSchema = z.object({
  interestFreeOnly: boolParam.optional(),
  origin: z.enum(["all", "national", "international"]).optional(),
  maxPrice: z.coerce.number().positive().optional().nullable(),
  freeShippingOnly: boolParam.optional(),
  condition: z.enum(["all", "new", "used"]).optional(),
  /** Compatibilidade com links antigos (newOnly=1 equivale a condition=new). */
  newOnly: boolParam.optional(),
  precise: boolParam.optional(),
  sort: z.enum(["price", "card", "installment"]).optional(),
  sources: sourcesParam.optional(),
});

export const querySchema = z.string().trim().min(2, "Digite pelo menos 2 caracteres").max(120);

/** Lê filtros de query string (?interestFreeOnly=1&origin=national...) ou de um body JSON. */
export function parseFilters(input: Record<string, unknown>): SearchFilters {
  const parsed = filtersSchema.parse(input);
  return {
    interestFreeOnly: parsed.interestFreeOnly ?? DEFAULT_FILTERS.interestFreeOnly,
    origin: parsed.origin ?? DEFAULT_FILTERS.origin,
    maxPrice: parsed.maxPrice ?? null,
    freeShippingOnly: parsed.freeShippingOnly ?? DEFAULT_FILTERS.freeShippingOnly,
    condition: parsed.condition ?? (parsed.newOnly ? "new" : DEFAULT_FILTERS.condition),
    precise: parsed.precise ?? DEFAULT_FILTERS.precise,
    sort: parsed.sort ?? DEFAULT_FILTERS.sort,
    sources: parsed.sources && parsed.sources.length > 0 ? parsed.sources : null,
  };
}

export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => {
    if (value !== "") obj[key] = value;
  });
  return obj;
}
