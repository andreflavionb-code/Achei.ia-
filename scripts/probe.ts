/**
 * Testa a busca pela linha de comando e mostra o que cada site devolveu.
 *
 *   npm run probe -- "iphone 15"
 *   npm run probe -- "iphone 15" --sem-juros --nacional --max 3000 --usado
 *
 * Quando um site não devolve nada, o HTML é salvo em .debug/ para análise.
 */
import { searchAll } from "../lib/offers/search";
import { DEFAULT_FILTERS, type SearchFilters } from "../lib/offers/types";

const args = process.argv.slice(2);
const query = args.filter((a) => !a.startsWith("--") && !/^\d/.test(a)).join(" ").trim();
if (!query) {
  console.error('Uso: npm run probe -- "termo de busca" [--sem-juros] [--nacional|--internacional] [--max 3000] [--frete-gratis] [--novo] [--tudo (desliga modo preciso)]');
  process.exit(1);
}

const maxIdx = args.indexOf("--max");
const filters: SearchFilters = {
  ...DEFAULT_FILTERS,
  interestFreeOnly: args.includes("--sem-juros"),
  origin: args.includes("--nacional") ? "national" : args.includes("--internacional") ? "international" : "all",
  maxPrice: maxIdx >= 0 ? Number(args[maxIdx + 1]) : null,
  freeShippingOnly: args.includes("--frete-gratis"),
  newOnly: args.includes("--novo"),
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
      console.log(`  ${s.name.padEnd(16)} ${line}`);
    }
    console.log(`\nTotal: ${result.offers.length} ofertas, ordenadas do menor para o maior preço.\n`);

    const sorted = result.offers.every((o, i, arr) => i === 0 || arr[i - 1].price <= o.price);
    console.log(`Ordenação crescente correta: ${sorted ? "sim" : "NÃO"}\n`);

    for (const o of result.offers.slice(0, 15)) {
      const inst = o.installments ? `${o.installments.count}x ${brl(o.installments.amount)} ${o.installments.interestFree ? "s/ juros" : "c/ juros"}` : "à vista";
      const origin = o.isInternational === null ? "origem ?" : o.isInternational ? "internacional" : "nacional";
      console.log(`  ${brl(o.price).padStart(14)}  ${o.sourceName.padEnd(14)} ${inst.padEnd(28)} ${origin.padEnd(13)} ${o.condition.padEnd(7)} ${o.title.slice(0, 60)}`);
    }
    if (result.offers.length > 15) console.log(`  ... e mais ${result.offers.length - 15}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
