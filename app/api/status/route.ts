import { NextResponse } from "next/server";
import { getActiveAdapters } from "@/lib/offers/adapters";
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
    mercadolivre: { configured: mlConfigured, authorized: mlAuthorized, affiliate: isAffiliateConfigured() },
    email: isEmailConfigured(),
    alertsIntervalMin: Number(process.env.ALERTS_INTERVAL_MIN ?? 60),
  });
}
