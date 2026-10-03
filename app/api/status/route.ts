import { NextResponse } from "next/server";
import { getAllAdapters } from "@/lib/offers/adapters";
import { getMlCredentials, hasMlAuthorization } from "@/lib/mercadolivre/auth";
import { isAffiliateConfigured } from "@/lib/mercadolivre/affiliate";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Estado da configuração, usado pelo aviso no topo da página. */
export async function GET() {
  const mlConfigured = getMlCredentials() !== null;
  const mlAuthorized = mlConfigured ? await hasMlAuthorization().catch(() => false) : false;

  return NextResponse.json({
    demoMode: process.env.DEMO_MODE === "1" || !mlConfigured,
    marketplaces: getAllAdapters().map((a) => ({ id: a.id, name: a.name, configured: a.isConfigured() })),
    mercadolivre: {
      configured: mlConfigured,
      authorized: mlAuthorized,
      affiliate: isAffiliateConfigured(),
    },
    email: isEmailConfigured(),
  });
}
