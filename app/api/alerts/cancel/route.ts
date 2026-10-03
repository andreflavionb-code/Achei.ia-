import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/alerts/cancel?token=... (link enviado no e-mail). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return new NextResponse("Token ausente.", { status: 400 });

  const alert = await prisma.alert.findUnique({ where: { token } });
  if (!alert) return new NextResponse("Alerta não encontrado.", { status: 404 });

  await prisma.alert.update({ where: { id: alert.id }, data: { active: false } });

  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;padding:40px">
      <h2>Alerta cancelado</h2>
      <p>Você não receberá mais avisos sobre "<strong>${escape(alert.query)}</strong>".</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
