/**
 * Navegador invisível (Chromium via Playwright) para sites que bloqueiam
 * requisições simples: Mercado Livre (verificação anti-robô), Magazine Luiza
 * (Akamai) e Amazon (bloqueio de servidores).
 *
 * Instalação: npm run browser:install  (baixa o Chromium uma vez).
 *
 * SCRAPE_MODE controla o uso:
 *   auto    (padrão) tenta requisição simples; se for bloqueada, usa o navegador
 *   browser sempre usa o navegador
 *   plain   nunca usa o navegador
 */
import type { Browser } from "playwright";
import { ScrapeError } from "./html";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const NAV_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS ?? 25000);

let browserPromise: Promise<Browser> | null = null;

export function scrapeMode(): "auto" | "browser" | "plain" {
  const mode = process.env.SCRAPE_MODE?.trim();
  return mode === "browser" || mode === "plain" ? mode : "auto";
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      let pw: typeof import("playwright");
      try {
        pw = await import("playwright");
      } catch {
        throw new ScrapeError("Playwright não instalado. Rode: npm install && npm run browser:install");
      }
      const args = ["--disable-blink-features=AutomationControlled", "--no-sandbox"];
      try {
        // "chromium" = Chromium completo em modo headless novo (mais parecido com um navegador real).
        return await pw.chromium.launch({ headless: true, channel: "chromium", args });
      } catch {
        try {
          return await pw.chromium.launch({ headless: true, args });
        } catch (err) {
          throw new ScrapeError(
            `Não foi possível abrir o Chromium (${(err as Error).message.split("\n")[0]}). Rode: npm run browser:install`,
          );
        }
      }
    })();
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export interface BrowserPage {
  html: string;
  finalUrl: string;
}

/** Abre a URL num navegador real e devolve o HTML renderizado. */
export async function fetchHtmlWithBrowser(url: string, waitForSelector?: string): Promise<BrowserPage> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
  });
  try {
    const page = await context.newPage();
    // Esconde o sinal mais óbvio de automação.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 12000 }).catch(() => undefined);
    } else {
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined);
    }
    return { html: await page.content(), finalUrl: page.url() };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(`Navegador falhou em ${new URL(url).hostname}: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => undefined);
}
