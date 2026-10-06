/**
 * Abre a janela do Chrome do Achei (perfil .browser-profile/) nas lojas
 * para você fazer login uma vez. Mercado Livre, Magalu e Casas Bahia
 * passam a exigir login/verificação depois de muitas buscas seguidas; com
 * a conta logada no perfil, as buscas escondidas voltam a funcionar.
 * Feche a janela (ou Ctrl+C aqui) quando terminar.
 *
 *   npm run login                 # abre Mercado Livre, Magalu e Casas Bahia, uma aba cada
 *   npm run login -- magalu       # só uma loja: mercadolivre | magalu | casasbahia
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
  const SITES: Record<string, string> = {
    mercadolivre: "https://www.mercadolivre.com.br/",
    magalu: "https://www.magazineluiza.com.br/",
    casasbahia: "https://www.casasbahia.com.br/",
  };
  const wanted = process.argv.slice(2).filter((a) => SITES[a]);
  const urls = (wanted.length ? wanted : Object.keys(SITES)).map((k) => SITES[k]);
  const pages: import("playwright").Page[] = [];
  for (const url of urls) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    pages.push(page);
  }
  console.log(`Janela aberta com ${urls.length} aba(s). Faça login e depois feche a janela.`);
  await new Promise<void>((resolve) => {
    let open = pages.length;
    for (const page of pages) page.on("close", () => (--open <= 0 ? setTimeout(resolve, 500) : undefined));
  });
  await ctx.close().catch(() => undefined);
  console.log("Login guardado no perfil. Pode iniciar o Achei.");
}

main();
