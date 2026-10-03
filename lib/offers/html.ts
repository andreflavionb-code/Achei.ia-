import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Utilidades para os coletores que leem páginas públicas (scraping).
 *
 * AVISO: scraping depende do HTML dos sites, que muda sem aviso, e alguns
 * sites bloqueiam robôs (captcha, 403). É o caminho para validar a ideia
 * sem cadastro; para produção, use as APIs oficiais/afiliados.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 15000);

export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

export async function fetchHtml(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        ...extraHeaders,
      },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    const html = await res.text();
    if (!res.ok) {
      throw new ScrapeError(`${new URL(url).hostname} respondeu HTTP ${res.status}`, res.status);
    }
    return html;
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ScrapeError(`${new URL(url).hostname} demorou mais de ${TIMEOUT_MS / 1000}s`);
    }
    throw new ScrapeError(`Falha ao acessar ${new URL(url).hostname}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** "R$ 1.234,56" -> 1234.56. Devolve null se não achar número. */
export function parseBRL(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/\s+/g, " ").match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!match) return null;
  const whole = match[1].replace(/\./g, "");
  const cents = match[2] ?? "0";
  const value = Number(`${whole}.${cents.padEnd(2, "0")}`);
  return Number.isFinite(value) ? value : null;
}

/** "em 12x R$ 103,25 sem juros" -> { count: 12, amount: 103.25, interestFree: true } */
export function parseInstallments(text: string | null | undefined) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ");
  const match = normalized.match(/(\d{1,2})\s*x\s*(?:de\s*)?R?\$?\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!match) return null;
  const count = Number(match[1]);
  const amount = parseBRL(match[2]);
  if (!count || amount === null) return null;
  const interestFree = /sem juros/i.test(normalized);
  return { count, amount, rate: interestFree ? 0 : null, interestFree };
}

/**
 * Salva o HTML bruto em .debug/<nome>.html quando um coletor não encontra
 * nada. Serve para investigar mudanças de layout sem precisar reproduzir.
 */
export async function dumpDebug(name: string, content: string): Promise<string | null> {
  if (process.env.SCRAPE_DEBUG === "0") return null;
  try {
    const dir = path.join(process.cwd(), ".debug");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${name}-${Date.now()}.html`);
    await writeFile(file, content, "utf8");
    return file;
  } catch {
    return null;
  }
}

/**
 * Procura, dentro de um JSON qualquer, arrays de objetos que pareçam
 * produtos (têm título e algum campo de preço). Usado para ler os dados
 * que sites em React/Next embutem na página (__NEXT_DATA__ etc.).
 */
export function findProductArrays(root: unknown, minLength = 3): Record<string, unknown>[][] {
  const found: Record<string, unknown>[][] = [];
  const seen = new Set<unknown>();

  const looksLikeProduct = (v: unknown) => {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    const hasTitle = typeof o.title === "string" || typeof o.name === "string";
    const hasPrice = "price" in o || "prices" in o || "bestPrice" in o || "sellingPrice" in o;
    return hasTitle && hasPrice;
  };

  const walk = (node: unknown, depth: number) => {
    if (depth > 25 || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length >= minLength && node.every(looksLikeProduct)) {
        found.push(node as Record<string, unknown>[]);
        return;
      }
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1);
  };

  walk(root, 0);
  return found;
}

export function extractJsonScript(html: string, pattern: RegExp): unknown | null {
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
