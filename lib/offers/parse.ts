import { z } from "zod";
import { DEFAULT_FILTERS, type SearchFilters } from "./types";

const boolParam = z
  .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false"), z.boolean()])
  .transform((v) => v === true || v === "1" || v === "true");

export const filtersSchema = z.object({
  interestFreeOnly: boolParam.optional(),
  origin: z.enum(["all", "national", "international"]).optional(),
  maxPrice: z.coerce.number().positive().optional().nullable(),
  freeShippingOnly: boolParam.optional(),
  newOnly: boolParam.optional(),
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
    newOnly: parsed.newOnly ?? DEFAULT_FILTERS.newOnly,
  };
}

export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => {
    if (value !== "") obj[key] = value;
  });
  return obj;
}
