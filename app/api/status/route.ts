import { NextResponse } from "next/server";
import { getActiveAdapters, getAllAdapters } from "@/lib/offers/adapters";
import { getMlCredentials, hasMlAuthorization } from "@/lib/mercadolivre/auth";
import { isAffiliateConfigured } from "@/lib/mercadolivre/affiliate";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Estado da configuração, usado pela faixa no topo da página. */
export async function GET() {
  const mlConfigured = getMlCredentials() !== null;
  const mlAuthorized = mlConfigured ? await hasMlAuthorization().catch(() => false) : false;
  const { adapters, demo } = getActiveAdapters();

  return NextResponse.json({
    demoMode: demo,
    passwordProtected: Boolean(process.env.APP_PASSWORD?.trim()),
    sources: adapters.map((a) => ({ id: a.id, name: a.name, kind: a.transport })),
    inactive: getAllAdapters()
      .filter((a) => a.transport === "api" && !a.isConfigured() && !adapters.some((b) => b.id === a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        reason: a.id === "shopee" ? "precisa de SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env (API de afiliados)" : "precisa de credenciais no .env",
      })),
    mercadolivre: { configured: mlConfigured, authorized: mlAuthorized, affiliate: isAffiliateConfigured() },
    email: isEmailConfigured(),
    alertsIntervalMin: Number(process.env.ALERTS_INTERVAL_MIN ?? 60),
  });
}
