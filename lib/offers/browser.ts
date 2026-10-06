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

/**
 * Contexto descartável: perfil novo numa pasta temporária, para quando o
 * perfil principal ficou "marcado" por um site (bloqueio que persiste em
 * cookies/armazenamento). Fecha e apaga ao terminar.
 */
async function withFreshContext<T>(fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const pw = await import("playwright");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const dir = await mkdtemp(path.join(os.tmpdir(), "achei-chrome-"));
  const args = ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"];
  if (!headless() && !visible()) args.push("--window-position=-20000,-20000", "--window-size=1280,860");
  const ctx = await pw.chromium.launchPersistentContext(dir, {
    channel: process.env.BROWSER_CHANNEL?.trim() === "chromium" ? "chromium" : "chrome",
    headless: headless(),
    viewport: { width: 1280, height: 860 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    args,
    ignoreDefaultArgs: ["--enable-automation"],
  });
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Abre a URL num navegador real e devolve o HTML renderizado. `fresh` usa um perfil limpo e descartável. */
export async function fetchHtmlWithBrowser(url: string, waitForSelector?: string, options: { fresh?: boolean } = {}): Promise<BrowserPage> {
  if (options.fresh) return withFreshContext((ctx) => fetchInContext(ctx, url, waitForSelector));
  return fetchInContext(await getContext(), url, waitForSelector);
}

async function fetchInContext(context: BrowserContext, url: string, waitForSelector?: string): Promise<BrowserPage> {
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
    const scrollAndRead = async () => {
      // Rolagem leve: alguns sites só montam os cards (e preços) quando a página é rolada.
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 1500).catch(() => undefined);
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(600);
      return page.content();
    };
    let html = await scrollAndRead();
    // Página em branco (desafio anti-robô que ainda não resolveu): espera e recarrega uma vez.
    if (html.length < 1000) {
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
      if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: WAIT_SELECTOR_MS }).catch(() => undefined);
      html = await scrollAndRead();
    }
    return { html, finalUrl: page.url() };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(`Navegador falhou em ${new URL(url).hostname}: ${(err as Error).message.split("\n")[0]}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Apaga os cookies de um domínio no perfil. Depois de um bloqueio, alguns
 * sites (Casas Bahia/Akamai, Mercado Livre) gravam cookies que mantêm o
 * perfil "marcado" mesmo quando o bloqueio já passou; limpar e tentar de
 * novo costuma resolver.
 */
export async function clearCookiesFor(hostname: string): Promise<void> {
  const root = hostname.split(".").slice(-3).join(".").replace(/^www\./, "");
  const context = await getContext();
  await context.clearCookies({ domain: new RegExp(`(^|\\.)${root.replace(/\./g, "\\.")}$`) }).catch(() => undefined);
}

export async function closeBrowser(): Promise<void> {
  const promise = globalState.__acheiBrowser;
  if (!promise) return;
  globalState.__acheiBrowser = null;
  const ctx = await promise.catch(() => null);
  await ctx?.close().catch(() => undefined);
}
