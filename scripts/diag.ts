/**
 * Diagnóstico dos coletores: baixa a página de busca de cada site e
 * imprime o que importa para ajustar os parsers (status, tamanho, seletores
 * encontrados, trechos do HTML). Uso: npx tsx scripts/diag.ts "termo"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { parse } from "node-html-parser";

const query = process.argv.slice(2).join(" ").trim() || "camera sony fx3";
const slug = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const UA_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA_CHROME,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="129", "Not=A?Brand";v="8"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

interface Target {
  name: string;
  url: string;
  selectors: string[];
  markers: string[];
  headerSets: { label: string; headers: Record<string, string> }[];
}

const targets: Target[] = [
  {
    name: "mercadolivre",
    url: `https://lista.mercadolivre.com.br/${slug}`,
    selectors: ["li.ui-search-layout__item", ".poly-card", ".ui-search-result__wrapper", ".andes-money-amount__fraction", "a.poly-component__title", "h2.ui-search-item__title", "[class*=poly-component__title]", "a[href*='MLB']"],
    markers: ["__PRELOADED_STATE__", "ld+json", "ui-search", "poly-card", "captcha", "robot", "andes-money-amount"],
    headerSets: [
      { label: "simples", headers: { "User-Agent": UA_CHROME, "Accept-Language": "pt-BR" } },
      { label: "navegador", headers: BROWSER_HEADERS },
    ],
  },
  {
    name: "magalu",
    url: `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
    selectors: ["script#__NEXT_DATA__", "[data-testid='product-card-container']", "[data-testid='price-value']", "a[href*='/p/']"],
    markers: ["__NEXT_DATA__", "product-card", "Access Denied", "captcha", "akamai", "bestPrice"],
    headerSets: [
      { label: "simples", headers: { "User-Agent": UA_CHROME, "Accept-Language": "pt-BR" } },
      { label: "navegador", headers: BROWSER_HEADERS },
    ],
  },
  {
    name: "amazon",
    url: `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`,
    selectors: ["div[data-component-type='s-search-result']", ".a-price .a-offscreen", "h2"],
    markers: ["captcha", "api-services-support", "s-search-result"],
    headerSets: [{ label: "navegador", headers: BROWSER_HEADERS }],
  },
];

function snippet(html: string, needle: string | RegExp, before = 200, after = 2500): string {
  const idx = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
  if (idx < 0) return "(não encontrado)";
  return html.slice(Math.max(0, idx - before), idx + after);
}

async function run() {
  await mkdir(".debug", { recursive: true });
  for (const t of targets) {
    console.log(`\n${"=".repeat(80)}\n${t.name.toUpperCase()}  ${t.url}`);
    for (const set of t.headerSets) {
      const started = Date.now();
      let status = 0;
      let html = "";
      try {
        const res = await fetch(t.url, { headers: set.headers, redirect: "follow" });
        status = res.status;
        html = await res.text();
        console.log(`\n[${set.label}] HTTP ${status}  ${html.length} bytes  ${Date.now() - started}ms  final: ${res.url}`);
      } catch (err) {
        console.log(`\n[${set.label}] ERRO: ${(err as Error).message}`);
        continue;
      }
      await writeFile(`.debug/${t.name}-${set.label}.html`, html, "utf8");

      const root = parse(html);
      console.log("  title:", root.querySelector("title")?.textContent.trim().slice(0, 120));
      for (const sel of t.selectors) {
        let n = 0;
        try { n = root.querySelectorAll(sel).length; } catch { n = -1; }
        console.log(`  ${sel.padEnd(48)} ${n}`);
      }
      console.log("  marcadores:", t.markers.map((m) => `${m}=${html.includes(m) ? "sim" : "não"}`).join("  "));

      if (status === 200) {
        if (t.name === "mercadolivre") {
          console.log("\n  --- primeiro card (poly-card ou ui-search-layout__item) ---");
          const card = root.querySelector("li.ui-search-layout__item, .poly-card");
          console.log(card ? card.outerHTML.slice(0, 6000) : snippet(html, /andes-money-amount__fraction|MLB-?\d{6,}/));
          console.log("\n  --- trecho do __PRELOADED_STATE__ (se houver) ---");
          console.log(snippet(html, "__PRELOADED_STATE__", 0, 1500));
        } else if (t.name === "magalu") {
          console.log("\n  --- trecho do __NEXT_DATA__ ou do primeiro card ---");
          console.log(snippet(html, "__NEXT_DATA__", 0, 3000));
          console.log(snippet(html, "product-card", 200, 3000));
        } else {
          const card = root.querySelector("div[data-component-type='s-search-result']");
          console.log("\n  --- primeiro card ---");
          console.log(card ? card.outerHTML.slice(0, 3000) : snippet(html, "s-search-result"));
        }
      } else {
        console.log("\n  --- início da resposta ---");
        console.log(html.slice(0, 1500));
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
