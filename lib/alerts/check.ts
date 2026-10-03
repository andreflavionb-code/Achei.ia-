import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { searchAll } from "@/lib/offers/search";
import type { Offer, OriginFilter, SearchFilters } from "@/lib/offers/types";

export interface AlertCheckSummary {
  checked: number;
  notified: number;
  errors: { alertId: string; error: string }[];
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getAppUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function buildEmail(alert: { query: string; maxPrice: number; token: string }, offers: Offer[]) {
  const top = offers.slice(0, 10);
  const cancelUrl = `${getAppUrl()}/api/alerts/cancel?token=${alert.token}`;

  const textLines = top.map(
    (o) =>
      `- ${formatBRL(o.price)} | ${o.title} | ${o.sourceName}${o.sellerName ? ` (${o.sellerName})` : ""}\n  ${o.url}`,
  );
  const text = [
    `Encontramos ${offers.length} oferta(s) de "${alert.query}" por até ${formatBRL(alert.maxPrice)}.`,
    "",
    ...textLines,
    "",
    `Para cancelar este alerta: ${cancelUrl}`,
  ].join("\n");

  const rows = top
    .map(
      (o) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap"><strong>${formatBRL(o.price)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee"><a href="${o.url}">${escapeHtml(o.title)}</a></td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(o.sourceName)}${
          o.sellerName ? `<br><small>${escapeHtml(o.sellerName)}</small>` : ""
        }</td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px">
      <h2>Achou! "${escapeHtml(alert.query)}" por até ${formatBRL(alert.maxPrice)}</h2>
      <p>Encontramos ${offers.length} oferta(s). As mais baratas:</p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      <p style="color:#666;font-size:12px;margin-top:24px">
        <a href="${cancelUrl}">Cancelar este alerta</a>
      </p>
    </div>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Verifica todos os alertas ativos. Para cada um:
 *  - refaz a busca com os filtros salvos e o preço máximo;
 *  - se houver oferta dentro do preço, envia e-mail;
 *  - evita repetição: só avisa de novo se o menor preço cair abaixo do
 *    último avisado, ou se já se passaram 24h desde o último aviso.
 */
export async function checkAlerts(): Promise<AlertCheckSummary> {
  const alerts = await prisma.alert.findMany({ where: { active: true } });
  const summary: AlertCheckSummary = { checked: 0, notified: 0, errors: [] };
  const now = new Date();

  for (const alert of alerts) {
    summary.checked++;
    try {
      const filters: SearchFilters = {
        interestFreeOnly: alert.interestFreeOnly,
        origin: alert.origin as OriginFilter,
        maxPrice: alert.maxPrice,
        freeShippingOnly: alert.freeShippingOnly,
        newOnly: alert.newOnly,
        precise: alert.precise,
      };
      const result = await searchAll(alert.query, filters);
      const offers = result.offers;

      let shouldNotify = false;
      if (offers.length > 0) {
        const best = offers[0].price;
        const dayPassed =
          !alert.lastNotifiedAt || now.getTime() - alert.lastNotifiedAt.getTime() > 24 * 60 * 60 * 1000;
        const cheaper = alert.lastNotifiedPrice === null || best < alert.lastNotifiedPrice;
        shouldNotify = cheaper || dayPassed;
      }

      if (shouldNotify) {
        const { text, html } = buildEmail(alert, offers);
        await sendEmail({
          to: alert.email,
          subject: `Achei: "${alert.query}" por ${formatBRL(offers[0].price)}`,
          text,
          html,
        });
        summary.notified++;
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now, lastNotifiedAt: now, lastNotifiedPrice: offers[0].price },
        });
      } else {
        await prisma.alert.update({ where: { id: alert.id }, data: { lastCheckedAt: now } });
      }
    } catch (err) {
      summary.errors.push({ alertId: alert.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}
