import { NextResponse } from "next/server";
import { checkAlerts } from "@/lib/alerts/check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/check-alerts
 *
 * Chamado pelo agendador (Vercel Cron, cron-job.org, crontab...).
 * Protegido por CRON_SECRET: envie o header "Authorization: Bearer <segredo>".
 * A Vercel envia esse header sozinha quando o cron está em vercel.json.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }

  const summary = await checkAlerts();
  return NextResponse.json(summary);
}
