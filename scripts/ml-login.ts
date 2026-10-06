/**
 * Abre a janela do Chrome do Achei (perfil .browser-profile/) no Mercado
 * Livre para você fazer login uma vez. O ML exige login depois de muitas
 * buscas seguidas; com a conta logada no perfil, as buscas escondidas
 * voltam a funcionar. Feche a janela (ou Ctrl+C aqui) quando terminar.
 *
 *   npm run ml:login
 *
 * Pare o servidor (iniciar.command / npm run dev) antes: ele segura o perfil.
 */
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  const userDataDir = path.join(process.cwd(), ".browser-profile");
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1280, height: 860 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "--window-position=100,60"],
      ignoreDefaultArgs: ["--enable-automation"],
    });
  } catch (err) {
    console.error(`Não abriu o Chrome (${(err as Error).message.split("\n")[0]}). Pare o servidor do Achei e tente de novo.`);
    process.exit(1);
  }
  const page = await ctx.newPage();
  await page.goto("https://www.mercadolivre.com.br/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  console.log("Janela aberta. Faça login no Mercado Livre e depois feche a janela.");
  await new Promise<void>((resolve) => {
    page.on("close", () => setTimeout(resolve, 500));
  });
  await ctx.close().catch(() => undefined);
  console.log("Login guardado no perfil. Pode iniciar o Achei.");
}

main();
