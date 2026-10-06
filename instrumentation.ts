/**
 * Roda uma vez quando o servidor sobe (Next.js). Liga o verificador de
 * alertas em segundo plano: a cada ALERTS_INTERVAL_MIN minutos (padrão 60)
 * refaz as buscas salvas e manda e-mail quando aparece preço dentro do
 * limite. Assim os alertas funcionam no seu Mac, sem cron externo.
 * ALERTS_INTERVAL_MIN=0 desliga (na Vercel, o cron do vercel.json cuida disso).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const minutes = Number(process.env.ALERTS_INTERVAL_MIN ?? 60);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const { checkAlerts } = await import("./lib/alerts/check");
  const run = async () => {
    try {
      const summary = await checkAlerts();
      if (summary.checked > 0) {
        console.log(`[alertas] ${summary.checked} verificado(s), ${summary.notified} aviso(s) enviado(s)${summary.errors.length ? `, ${summary.errors.length} erro(s)` : ""}`);
      }
    } catch (err) {
      console.error("[alertas] falha na verificação:", err instanceof Error ? err.message : err);
    }
  };
  // Primeira rodada 2 minutos depois de subir, para não disputar com a primeira busca do usuário.
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, minutes * 60 * 1000).unref();
  console.log(`[alertas] verificação automática a cada ${minutes} min`);
}
