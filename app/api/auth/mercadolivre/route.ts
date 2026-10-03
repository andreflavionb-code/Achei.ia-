import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/mercadolivre/auth";

export const dynamic = "force-dynamic";

/** Passo 1 do OAuth: redireciona para a tela de autorização do Mercado Livre. */
export function GET() {
  const url = buildAuthorizationUrl();
  if (!url) {
    return NextResponse.json(
      {
        error:
          "Defina ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI no .env (veja o README).",
      },
      { status: 500 },
    );
  }
  return NextResponse.redirect(url);
}
