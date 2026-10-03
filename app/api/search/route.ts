import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { searchAll } from "@/lib/offers/search";
import { parseFilters, querySchema, searchParamsToObject } from "@/lib/offers/parse";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=iphone&interestFreeOnly=1&origin=national&maxPrice=3000
 * Devolve a lista unificada, filtrada e ordenada do menor para o maior preço.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const query = querySchema.parse(params.get("q") ?? "");
    const filters = parseFilters(searchParamsToObject(params));
    const result = await searchAll(query, filters);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Parâmetros inválidos" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
