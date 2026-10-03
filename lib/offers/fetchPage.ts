import { fetchHtmlFull, ScrapeError } from "./html";
import { fetchHtmlWithBrowser, scrapeMode } from "./browser";

export interface PageSource {
  /** Seletor que indica que a listagem carregou (usado pelo navegador). */
  waitFor: string;
  /** Diz se a resposta simples foi um bloqueio (captcha, verificação, 403...). */
  isBlocked: (html: string, finalUrl: string, status: number) => boolean;
  /** Nome amigável para mensagens. */
  name: string;
}

export interface LoadedPage {
  html: string;
  finalUrl: string;
  via: "plain" | "browser";
}

/**
 * Carrega a página de busca de um site respeitando SCRAPE_MODE:
 * requisição simples primeiro e, se o site bloquear, navegador invisível.
 */
export async function loadSearchPage(url: string, source: PageSource): Promise<LoadedPage> {
  const mode = scrapeMode();

  if (mode !== "browser") {
    const page = await fetchHtmlFull(url);
    const blocked = page.status >= 400 || source.isBlocked(page.html, page.finalUrl, page.status);
    if (!blocked) return { html: page.html, finalUrl: page.finalUrl, via: "plain" };
    if (mode === "plain") {
      throw new ScrapeError(
        page.status >= 400
          ? `${source.name} respondeu HTTP ${page.status} (bloqueio anti-robô). Ative o navegador: SCRAPE_MODE=auto`
          : `${source.name} pediu verificação anti-robô. Ative o navegador: SCRAPE_MODE=auto`,
      );
    }
  }

  const page = await fetchHtmlWithBrowser(url, source.waitFor);
  if (source.isBlocked(page.html, page.finalUrl, 200)) {
    throw new ScrapeError(`${source.name} bloqueou até o navegador (verificação anti-robô). Tente de novo mais tarde.`);
  }
  return { html: page.html, finalUrl: page.finalUrl, via: "browser" };
}
