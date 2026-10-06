import { fetchHtmlFull, ScrapeError } from "./html";
import { clearCookiesFor, fetchHtmlWithBrowser, scrapeMode } from "./browser";

export interface PageSource {
  /** Seletor que indica que a listagem carregou (usado pelo navegador). */
  waitFor: string;
  /** Diz se a resposta foi um bloqueio (captcha, verificação, 403...). */
  isBlocked: (html: string, finalUrl: string, status: number) => boolean;
  /** Diz se a página é uma busca legítima sem resultados. */
  isEmpty?: (html: string) => boolean;
  /** Nome amigável para mensagens. */
  name: string;
}

export interface LoadedPage<T> {
  html: string;
  finalUrl: string;
  via: "plain" | "browser";
  items: T[];
}

/**
 * Carrega a página de busca e extrai os itens, respeitando SCRAPE_MODE:
 *  1. requisição simples; se não for bloqueada e render itens, pronto;
 *  2. senão, navegador real; se ainda vier bloqueado ou vazio, erro claro.
 */
export async function loadAndParse<T>(
  url: string,
  source: PageSource,
  parse: (html: string) => T[],
): Promise<LoadedPage<T>> {
  const mode = scrapeMode();
  let plainHtml = "";

  if (mode !== "browser") {
    const page = await fetchHtmlFull(url);
    plainHtml = page.html;
    const blocked = page.status >= 400 || source.isBlocked(page.html, page.finalUrl, page.status);
    if (!blocked) {
      const items = parse(page.html);
      if (items.length > 0 || source.isEmpty?.(page.html)) {
        return { html: page.html, finalUrl: page.finalUrl, via: "plain", items };
      }
    }
    if (mode === "plain") {
      throw new ScrapeError(
        blocked
          ? `${source.name} bloqueou a requisição simples (HTTP ${page.status}). Ative o navegador: SCRAPE_MODE=auto`
          : `${source.name}: nenhum produto reconhecido na página (layout pode ter mudado).`,
      );
    }
  }

  let page = await fetchHtmlWithBrowser(url, source.waitFor);
  let blocked = source.isBlocked(page.html, page.finalUrl, 200);
  let items = blocked ? [] : parse(page.html);
  if (blocked || (items.length === 0 && !source.isEmpty?.(page.html))) {
    // Perfil "marcado" por um bloqueio anterior: limpa os cookies do site e tenta num perfil limpo e descartável.
    await clearCookiesFor(new URL(url).hostname).catch(() => undefined);
    page = await fetchHtmlWithBrowser(url, source.waitFor, { fresh: true });
    blocked = source.isBlocked(page.html, page.finalUrl, 200);
    items = blocked ? [] : parse(page.html);
  }
  if (blocked) {
    throw new ScrapeError(
      `${source.name} bloqueou até o navegador (verificação anti-robô). Abra ${new URL(url).hostname} no Chrome, resolva a verificação se aparecer, e tente de novo.`,
    );
  }
  return { html: page.html || plainHtml, finalUrl: page.finalUrl, via: "browser", items };
}
