/**
 * Navegador real (Chrome/Chromium via Playwright) para sites que bloqueiam
 * requisições simples e detectam automação: Mercado Livre (verificação
 * "tráfego suspeito"), Magazine Luiza (Akamai) e Amazon.
 *
 * Usa um perfil persistente em .browser-profile/ (cookies e verificações
 * ficam guardados entre buscas) e, por padrão, uma janela VISÍVEL, porque
 * o modo invisível ainda é detectado por esses sites.
 *
 * Variáveis:
 *   SCRAPE_MODE      auto (padrão) | browser | plain
 *   BROWSER_HEADLESS 0 (padrão, janela visível) | 1 (invisível, menos confiável)
 *   BROWSER_CHANNEL  chrome (Google Chrome instalado) | chromium (Playwright) | auto (padrão)
 */
import path from "node:path";
import type { BrowserContext } from "playwright";
import { ScrapeError } from "./html";

const NAV_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS ?? 30000);
const WAIT_SELECTOR_MS = Number(process.env.BROWSER_WAIT_MS ?? 15000);

let contextPromise: Promise<BrowserContext> | null = null;

export function scrapeMode(): "auto" | "browser" | "plain" {
  const mode = process.env.SCRAPE_MODE?.trim();
  return mode === "browser" || mode === "plain" ? mode : "auto";
}

function headless(): boolean {
  return process.env.BROWSER_HEADLESS?.trim() === "1";
}

async function launchContext(): Promise<BrowserContext> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    throw new ScrapeError("Playwright não instalado. Rode: npm run setup");
  }

  const userDataDir = path.join(process.cwd(), ".browser-profile");
  const wanted = process.env.BROWSER_CHANNEL?.trim() || "auto";
  const channels: (string | undefined)[] =
    wanted === "auto" ? ["chrome", "chromium", undefined] : wanted === "chromium" ? ["chromium", undefined] : [wanted, "chromium", undefined];

  let lastError: unknown = null;
  for (const channel of channels) {
    try {
      return await pw.chromium.launchPersistentContext(userDataDir, {
        channel,
        headless: headless(),
        viewport: { width: 1280, height: 860 },
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
        ignoreDefaultArgs: ["--enable-automation"],
      });
    } catch (err) {
      lastError = err;
    }
  }
  const msg = lastError instanceof Error ? lastError.message.split("\n")[0] : String(lastError);
  throw new ScrapeError(`Não foi possível abrir o navegador (${msg}). Rode: npm run setup`);
}

async function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = launchContext();
    contextPromise.catch(() => {
      contextPromise = null;
    });
    contextPromise.then((ctx) => {
      ctx.on("close", () => {
        contextPromise = null;
      });
    });
  }
  return contextPromise;
}

export interface BrowserPage {
  html: string;
  finalUrl: string;
}

/** Abre a URL num navegador real e devolve o HTML renderizado. */
export async function fetchHtmlWithBrowser(url: string, waitForSelector?: string): Promise<BrowserPage> {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    if (waitForSelector) {
      // Dá tempo para verificações em JavaScript redirecionarem para a listagem.
      await page.waitForSelector(waitForSelector, { timeout: WAIT_SELECTOR_MS }).catch(() => undefined);
    } else {
      await page.waitForLoadState("networkidle", { timeout: WAIT_SELECTOR_MS }).catch(() => undefined);
    }
    // Rolagem leve: alguns sites só montam os cards quando a página é rolada.
    await page.mouse.wheel(0, 1200).catch(() => undefined);
    await page.waitForTimeout(800);
    return { html: await page.content(), finalUrl: page.url() };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(`Navegador falhou em ${new URL(url).hostname}: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeBrowser(): Promise<void> {
  if (!contextPromise) return;
  const ctx = await contextPromise.catch(() => null);
  contextPromise = null;
  await ctx?.close().catch(() => undefined);
}
