import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/mercadolivre/auth";

export const dynamic = "force-dynamic";

/** Passo 2 do OAuth: o Mercado Livre volta aqui com ?code=... */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.json({ error: error ?? "Código de autorização ausente" }, { status: 400 });
  }

  try {
    await exchangeCodeForToken(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao trocar o código";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/?ml=conectado", url.origin));
}
