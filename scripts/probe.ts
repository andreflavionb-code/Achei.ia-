/**
 * Testa a busca pela linha de comando e mostra o que cada site devolveu.
 *
 *   npm run probe -- "iphone 15"
 *   npm run probe -- "iphone 15" --sem-juros --nacional --max 3000 --usado
 *
 * Quando um site não devolve nada, o HTML é salvo em .debug/ para análise.
 */
import { searchAll } from "../lib/offers/search";
import { closeBrowser } from "../lib/offers/browser";
import { DEFAULT_FILTERS, type SearchFilters } from "../lib/offers/types";

const args = process.argv.slice(2);
const skip = new Set<number>();
for (const flag of ["--max", "--fontes"]) {
  const i = args.indexOf(flag);
  if (i >= 0) skip.add(i + 1);
}
const query = args.filter((a, i) => !a.startsWith("--") && !skip.has(i)).join(" ").trim();
if (!query) {
  console.error('Uso: npm run probe -- "termo de busca" [--sem-juros] [--nacional|--internacional] [--max 3000] [--frete-gratis] [--novo|--usado] [--cartao|--parcela (ordenação)] [--fontes ml,amazon,...] [--tudo (desliga modo preciso)]');
  process.exit(1);
}

const maxIdx = args.indexOf("--max");
const fontesIdx = args.indexOf("--fontes");
const filters: SearchFilters = {
  ...DEFAULT_FILTERS,
  interestFreeOnly: args.includes("--sem-juros"),
  origin: args.includes("--nacional") ? "national" : args.includes("--internacional") ? "international" : "all",
  maxPrice: maxIdx >= 0 ? Number(args[maxIdx + 1]) : null,
  freeShippingOnly: args.includes("--frete-gratis"),
  condition: args.includes("--novo") ? "new" : args.includes("--usado") ? "used" : "all",
  sort: args.includes("--parcela") ? "installment" : args.includes("--cartao") ? "card" : "price",
  sources: fontesIdx >= 0 ? (args[fontesIdx + 1].split(",") as SearchFilters["sources"]) : null,
  precise: !args.includes("--tudo"),
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

searchAll(query, filters)
  .then((result) => {
    console.log(`\nBusca: "${result.query}"  filtros: ${JSON.stringify(filters)}\n`);
    for (const s of result.sources) {
      const line =
        s.status === "ok"
          ? `${s.shown} exibidas de ${s.fetched} coletadas (${s.hiddenByPrecision} escondidas pelo modo preciso)`
          : `ERRO: ${s.error}`;
      console.log(`  ${s.name.padEnd(16)} ${line}  (${((s.ms ?? 0) / 1000).toFixed(1)}s)`);
    }
    console.log(`\nTotal: ${result.offers.length} ofertas, ordenadas do menor para o maior preço.\n`);

    const key = filters.sort;
const val = (o: (typeof result.offers)[number]) => (key === "card" ? o.cardPrice ?? o.price : key === "installment" ? o.installments?.amount ?? o.cardPrice ?? o.price : o.price);
const sorted = result.offers.every((o, i, arr) => i === 0 || val(arr[i - 1]) <= val(o));
    console.log(`Ordenação crescente correta: ${sorted ? "sim" : "NÃO"}\n`);

    for (const o of result.offers.slice(0, 15)) {
      const inst = o.installments ? `${o.installments.count}x ${brl(o.installments.amount)} ${o.installments.interestFree === true ? "s/ juros" : o.installments.interestFree === false ? "c/ juros" : "juros ?"}` : "à vista";
      const origin = o.isInternational === null ? "origem ?" : o.isInternational ? "internacional" : "nacional";
      const card = o.cardPrice ? ` (cartão ${brl(o.cardPrice)})` : "";
      console.log(`  ${brl(o.price).padStart(14)}${card.padEnd(22)} ${o.sourceName.padEnd(14)} ${inst.padEnd(28)} ${origin.padEnd(13)} ${o.condition.padEnd(7)} ${o.title.slice(0, 60)}`);
    }
    if (result.offers.length > 15) console.log(`  ... e mais ${result.offers.length - 15}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  // O Chrome escondido fica aberto entre buscas no servidor; aqui, na linha de comando, fechamos para o processo terminar.
  .finally(() => closeBrowser().then(() => process.exit()));
