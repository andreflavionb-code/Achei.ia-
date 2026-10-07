import { NextResponse } from "next/server";
import { closeLoginPages, loginPagesOpen, openLoginPages } from "@/lib/offers/browser";

export const dynamic = "force-dynamic";

const SITES: Record<string, string> = {
  mercadolivre: "https://www.mercadolivre.com.br/",
  magalu: "https://www.magazineluiza.com.br/",
  casasbahia: "https://www.casasbahia.com.br/",
};

/**
 * POST /api/browser/login { action: "open", sites?: ["magalu", ...] }
 *   Abre abas de login no Chrome do Achei e mostra a janela (sem parar o servidor).
 * POST /api/browser/login { action: "close" }
 *   Fecha as abas e esconde o Chrome de novo. Os logins ficam no perfil.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; sites?: string[] };
  try {
    if (body.action === "close") {
      await closeLoginPages();
      return NextResponse.json({ open: 0 });
    }
    const wanted = (body.sites ?? Object.keys(SITES)).filter((s) => SITES[s]);
    const open = await openLoginPages(wanted.map((s) => SITES[s]));
    return NextResponse.json({ open });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ open: loginPagesOpen() });
}
