import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { filtersSchema, querySchema } from "@/lib/offers/parse";

export const dynamic = "force-dynamic";

const createAlertSchema = z.object({
  email: z.email("E-mail inválido"),
  query: querySchema,
  maxPrice: z.coerce.number().positive("Informe um preço máximo"),
  filters: filtersSchema.optional(),
});

/** POST /api/alerts  { email, query, maxPrice, filters? } */
export async function POST(request: Request) {
  try {
    const body = createAlertSchema.parse(await request.json());
    const f = body.filters ?? {};

    const alert = await prisma.alert.create({
      data: {
        email: body.email.toLowerCase(),
        query: body.query,
        maxPrice: body.maxPrice,
        interestFreeOnly: f.interestFreeOnly ?? false,
        origin: f.origin ?? "all",
        freeShippingOnly: f.freeShippingOnly ?? false,
        newOnly: f.newOnly ?? false,
      },
    });

    return NextResponse.json({ id: alert.id, createdAt: alert.createdAt }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/alerts?email=... lista os alertas ativos de um e-mail. */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Informe o e-mail" }, { status: 400 });

  const alerts = await prisma.alert.findMany({
    where: { email, active: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      query: true,
      maxPrice: true,
      interestFreeOnly: true,
      origin: true,
      freeShippingOnly: true,
      newOnly: true,
      lastCheckedAt: true,
      lastNotifiedAt: true,
      lastNotifiedPrice: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ alerts });
}
