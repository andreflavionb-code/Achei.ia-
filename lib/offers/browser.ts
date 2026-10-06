/**
 * Navegador real (Google Chrome via Playwright) para sites que bloqueiam
 * requisições simples e detectam automação: Mercado Livre (verificação
 * "tráfego suspeito"), Magazine Luiza e Casas Bahia (Akamai).
 *
 * Esses sites detectam o modo headless (até o "novo"). O que funciona é
 * uma janela de verdade. Para não atrapalhar, a janela é aberta FORA DA
 * TELA (posição -20000,-20000): existe, mas você não a vê. O perfil fica
 * em .browser-profile/ (cookies e verificações guardados entre buscas).
 *
 * Variáveis:
 *   SCRAPE_MODE      auto (padrão) | browser | plain
 *   BROWSER_VISIBLE  1 mostra a janela (útil se um site pedir verificação manual)
 *   BROWSER_HEADLESS 1 força modo headless (costuma ser bloqueado)
 *   BROWSER_CHANNEL  chrome (Google Chrome instalado) | chromium (Playwright) | auto (padrão)
 */
import path from "node:path";
import type { BrowserContext } from "playwright";
import { ScrapeError } from "./html";

const NAV_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS ?? 30000);
const WAIT_SELECTOR_MS = Number(process.env.BROWSER_WAIT_MS ?? 15000);

/**
 * O contexto fica em globalThis: em `next dev`, o hot reload recria este
 * módulo a cada edição e, sem isso, abriria um segundo Chrome no mesmo
 * perfil (o primeiro continuaria aberto e as páginas em uso quebrariam).
 */
const globalState = globalThis as unknown as { __acheiBrowser?: Promise<BrowserContext> | null };

export function scrapeMode(): "auto" | "browser" | "plain" {
  const mode = process.env.SCRAPE_MODE?.trim();
  return mode === "browser" || mode === "plain" ? mode : "auto";
}

function headless(): boolean {
  return process.env.BROWSER_HEADLESS?.trim() === "1";
}

function visible(): boolean {
  return process.env.BROWSER_VISIBLE?.trim() === "1";
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

  const args = ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"];
  if (!headless() && !visible()) args.push("--window-position=-20000,-20000", "--window-size=1280,860");

  let lastError: unknown = null;
  for (const channel of channels) {
    try {
      return await pw.chromium.launchPersistentContext(userDataDir, {
        channel,
        headless: headless(),
        viewport: { width: 1280, height: 860 },
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        args,
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
  if (!globalState.__acheiBrowser) {
    const promise = launchContext();
    globalState.__acheiBrowser = promise;
    promise.catch(() => {
      if (globalState.__acheiBrowser === promise) globalState.__acheiBrowser = null;
    });
    promise.then((ctx) => {
      ctx.on("close", () => {
        if (globalState.__acheiBrowser === promise) globalState.__acheiBrowser = null;
      });
    });
  }
  return globalState.__acheiBrowser;
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
    // Rolagem leve: alguns sites só montam os cards (e preços) quando a página é rolada.
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1500).catch(() => undefined);
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(600);
    return { html: await page.content(), finalUrl: page.url() };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(`Navegador falhou em ${new URL(url).hostname}: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeBrowser(): Promise<void> {
  const promise = globalState.__acheiBrowser;
  if (!promise) return;
  globalState.__acheiBrowser = null;
  const ctx = await promise.catch(() => null);
  await ctx?.close().catch(() => undefined);
}
