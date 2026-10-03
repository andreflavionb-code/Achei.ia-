/**
 * Roda a verificação de alertas pela linha de comando:
 *   npm run alerts:check
 * Útil para testar localmente ou agendar via crontab.
 */
import { checkAlerts } from "../lib/alerts/check";

checkAlerts()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.errors.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
