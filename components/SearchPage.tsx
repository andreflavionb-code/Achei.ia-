"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ConditionFilter, OriginFilter, SearchFilters, SearchResult, SortKey, SourceId } from "@/lib/offers/types";
import { formatBRL } from "@/lib/format";
import { OfferRow } from "./OfferRow";
import { AlertForm } from "./AlertForm";
import { StatusBanner, type Status } from "./StatusBanner";

const PAGE_SIZE = 50;

function filtersFromParams(params: URLSearchParams): SearchFilters {
  const maxPrice = Number(params.get("maxPrice"));
  const sources = params.get("sources");
  return {
    interestFreeOnly: params.get("interestFreeOnly") === "1",
    origin: (params.get("origin") as OriginFilter) || "all",
    maxPrice: maxPrice > 0 ? maxPrice : null,
    freeShippingOnly: params.get("freeShippingOnly") === "1",
    condition: (params.get("condition") as ConditionFilter) || (params.get("newOnly") === "1" ? "new" : "all"),
    precise: params.get("precise") !== "0",
    sort: (params.get("sort") as SortKey) || "price",
    sources: sources ? (sources.split(",") as SourceId[]) : null,
  };
}

function paramsFromState(query: string, filters: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("q", query);
  if (filters.interestFreeOnly) p.set("interestFreeOnly", "1");
  if (filters.origin !== "all") p.set("origin", filters.origin);
  if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
  if (filters.freeShippingOnly) p.set("freeShippingOnly", "1");
  if (filters.condition !== "all") p.set("condition", filters.condition);
  if (!filters.precise) p.set("precise", "0");
  if (filters.sort !== "price") p.set("sort", filters.sort);
  if (filters.sources) p.set("sources", filters.sources.join(","));
  return p;
}

const SORT_LABELS: Record<SortKey, string> = {
  price: "Menor preço à vista",
  card: "Menor preço no cartão",
  installment: "Menor parcela",
};

export function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>(() => filtersFromParams(searchParams));
  const [maxPriceInput, setMaxPriceInput] = useState(searchParams.get("maxPrice") ?? "");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<Status | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  async function loginWindow(action: "open" | "close") {
    setLoginBusy(true);
    try {
      const res = await fetch("/api/browser/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao abrir o Chrome");
      setLoginOpen(action === "open");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoginBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // Contador de segundos enquanto busca (as lojas via navegador levam 15-40s).
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const runSearch = useCallback(
    async (q: string, f: SearchFilters, fresh = false) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setLoading(true);
      setError(null);
      setVisible(PAGE_SIZE);
      const params = paramsFromState(trimmed, f);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      try {
        const res = await fetch(`/api/search?${params.toString()}${fresh ? "&fresh=1" : ""}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha na busca");
        setResult(data as SearchResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      } finally {
        setLoading(false);
      }
    },
    [pathname, router],
  );

  // Busca automática quando a página abre com ?q= na URL (só na montagem).
  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    const initial = filtersFromParams(searchParams);
    const timer = setTimeout(() => void runSearch(q, initial), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilters(patch: Partial<SearchFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (result) void runSearch(query, next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const maxPrice = Number(maxPriceInput.replace(/\./g, "").replace(",", "."));
    const next = { ...filters, maxPrice: maxPrice > 0 ? maxPrice : null };
    setFilters(next);
    void runSearch(query, next);
  }

  const allSources = useMemo(() => status?.sources.filter((s) => s.kind !== "demo") ?? [], [status]);
  const selectedSources = filters.sources ?? allSources.map((s) => s.id);

  function toggleSource(id: SourceId) {
    const set = new Set(selectedSources);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const all = allSources.map((s) => s.id);
    const next = all.filter((s) => set.has(s));
    updateFilters({ sources: next.length === all.length || next.length === 0 ? null : next });
  }

  const okSources = useMemo(() => result?.sources.filter((s) => s.status === "ok") ?? [], [result]);
  const hiddenByPrecision = useMemo(() => okSources.reduce((n, s) => n + s.hiddenByPrecision, 0), [okSources]);
  const errorSources = useMemo(() => result?.sources.filter((s) => s.status === "error") ?? [], [result]);

  const inputClass = "rounded border border-zinc-300 bg-white px-2 py-1";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="pt-10 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Achei</h1>
        <p className="mt-1 text-zinc-600">
          Busca em {allSources.length > 0 ? allSources.length : "vários"} lojas de uma vez e ordena de verdade do menor para o maior preço, sem esconder resultados.
        </p>
      </header>

      <StatusBanner status={status} />

      <form onSubmit={submit} className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O que você quer comprar? Ex.: iPhone 15 128GB"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2.5 text-base outline-none focus:border-zinc-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? `Buscando… ${elapsed}s` : "Buscar"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-700">
          <label className="flex items-center gap-1.5">
            Ordenar
            <select value={filters.sort} onChange={(e) => updateFilters({ sort: e.target.value as SortKey })} className={inputClass}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filters.interestFreeOnly}
              onChange={(e) => updateFilters({ interestFreeOnly: e.target.checked })}
            />
            Só parcelamento sem juros
          </label>
          <label className="flex items-center gap-1.5">
            Condição
            <select value={filters.condition} onChange={(e) => updateFilters({ condition: e.target.value as ConditionFilter })} className={inputClass}>
              <option value="all">Novos e usados</option>
              <option value="new">Só novos</option>
              <option value="used">Só usados</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Origem
            <select value={filters.origin} onChange={(e) => updateFilters({ origin: e.target.value as OriginFilter })} className={inputClass}>
              <option value="all">Nacional e internacional</option>
              <option value="national">Só nacional</option>
              <option value="international">Só internacional</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filters.freeShippingOnly}
              onChange={(e) => updateFilters({ freeShippingOnly: e.target.checked })}
            />
            Só frete grátis
          </label>
          <label className="flex items-center gap-1.5" title="Esconde acessórios (capas, cabos, baterias) e itens que não batem com o que você digitou">
            <input type="checkbox" checked={filters.precise} onChange={(e) => updateFilters({ precise: e.target.checked })} />
            Modo preciso
          </label>
          <label className="flex items-center gap-1.5">
            Até R$
            <input
              type="text"
              inputMode="decimal"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              placeholder="sem limite"
              className="w-24 rounded border border-zinc-300 px-2 py-1"
            />
          </label>
          {allSources.length > 0 && (
            <button type="button" onClick={() => setShowSources((v) => !v)} className="text-zinc-600 underline">
              Lojas ({selectedSources.length}/{allSources.length})
            </button>
          )}
          {filters.sources && (
            <button type="button" onClick={() => updateFilters({ sources: null })} className="text-zinc-600 underline">
              todas as lojas
            </button>
          )}
          {loginOpen ? (
            <button type="button" onClick={() => void loginWindow("close")} disabled={loginBusy} className="rounded border border-emerald-600 px-2 py-0.5 text-emerald-700 disabled:opacity-50">
              Pronto, esconder o Chrome
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void loginWindow("open")}
              disabled={loginBusy}
              title="Mostra o Chrome do Achei com Mercado Livre, Magalu e Casas Bahia para você entrar na sua conta. Depois de muitas buscas, essas lojas exigem login."
              className="text-zinc-600 underline disabled:opacity-50"
            >
              {loginBusy ? "Abrindo…" : "Entrar nas lojas"}
            </button>
          )}
        </div>

        {showSources && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
            {allSources.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5" title={s.kind === "browser" ? "Lida pelo Chrome escondido (mais lenta)" : "Leitura direta"}>
                <input type="checkbox" checked={selectedSources.includes(s.id)} onChange={() => toggleSource(s.id)} />
                {s.name}
                {s.kind === "browser" && <span className="text-[10px] text-zinc-400">chrome</span>}
              </label>
            ))}
          </div>
        )}
      </form>

      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-700">
              <strong>{result.offers.length}</strong> oferta(s) para &quot;{result.query}&quot;, ordenadas por{" "}
              {SORT_LABELS[result.filters.sort].toLowerCase()}
              {result.offers.length > 0 && (
                <>
                  {" "}
                  · menor: <strong>{formatBRL(result.offers[0].price)}</strong>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {result.sources.some((s) => s.cached) && (
                <button
                  onClick={() => void runSearch(query, filters, true)}
                  disabled={loading}
                  title="Os resultados vêm de uma busca dos últimos 15 minutos; clique para consultar as lojas de novo"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                >
                  Buscar de novo
                </button>
              )}
              <button
                onClick={() => setShowAlert((v) => !v)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
              >
                Criar alerta de preço
              </button>
            </div>
          </div>

          <details className="mt-2 rounded-lg border border-zinc-200 bg-white text-xs" open={result.offers.length < 20}>
            <summary className="cursor-pointer px-3 py-2 text-zinc-700">
              Por loja:{" "}
              {result.sources.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && " · "}
                  <span className={s.status === "error" ? "text-red-700" : s.shown === 0 ? "text-zinc-400" : ""}>
                    {s.name} {s.status === "error" ? "erro" : s.shown}
                  </span>
                </span>
              ))}
              {status?.inactive?.map((s) => (
                <span key={s.id} className="text-amber-700">
                  {" · "}
                  {s.name} desligada
                </span>
              ))}
            </summary>
            <table className="w-full border-t border-zinc-100">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="px-3 py-1.5 font-medium">Loja</th>
                  <th className="px-2 py-1.5 font-medium">Encontradas</th>
                  <th className="px-2 py-1.5 font-medium" title="Acessórios ou outros modelos, escondidos pelo modo preciso">Escondidas</th>
                  <th className="px-2 py-1.5 font-medium" title="Fora dos filtros (sem juros, origem, condição, preço máximo)">Fora dos filtros</th>
                  <th className="px-2 py-1.5 font-medium">Exibidas</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {result.sources.map((s) => {
                  const filteredOut = Math.max(0, s.fetched - s.hiddenByPrecision - s.shown);
                  return (
                    <tr key={s.id} className="border-t border-zinc-100">
                      <td className="px-3 py-1.5 font-medium text-zinc-800">
                        {s.name}
                        {s.cached && <span className="ml-1 text-zinc-400" title="resultado recente (cache de 15 min)">·</span>}
                      </td>
                      {s.status === "error" ? (
                        <td colSpan={4} className="px-2 py-1.5 text-red-700">
                          {s.error}
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1.5">{s.fetched === 0 ? <span className="text-zinc-400">nada para esta busca</span> : s.fetched}</td>
                          <td className="px-2 py-1.5">{s.hiddenByPrecision || ""}</td>
                          <td className="px-2 py-1.5">{filteredOut || ""}</td>
                          <td className="px-2 py-1.5 font-semibold">{s.shown}</td>
                        </>
                      )}
                      <td className="px-2 py-1.5 text-right">
                        {s.status === "ok" && s.fetched > s.shown && (
                          <button
                            onClick={() => updateFilters({ precise: false, sources: [s.id], interestFreeOnly: false, origin: "all", condition: "all", freeShippingOnly: false, maxPrice: null })}
                            className="underline"
                            title="Mostra tudo que esta loja devolveu, sem filtros e sem modo preciso"
                          >
                            ver tudo da loja
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {status?.inactive?.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-100 text-amber-700">
                    <td className="px-3 py-1.5 font-medium">{s.name}</td>
                    <td colSpan={5} className="px-2 py-1.5">
                      desligada: {s.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {hiddenByPrecision > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              {hiddenByPrecision} item(ns) escondido(s) pelo modo preciso (acessórios, outros modelos ou sem relação com a busca).{" "}
              <button onClick={() => updateFilters({ precise: false })} className="underline">
                Mostrar tudo
              </button>
            </p>
          )}
          {(filters.interestFreeOnly || filters.origin !== "all" || filters.condition !== "all" || filters.freeShippingOnly || filters.maxPrice) && (
            <p className="mt-1 text-xs text-zinc-500">
              Filtros ativos escondem o que a loja não informa (ex.: AliExpress não informa parcelas; Carrefour não informa origem).
            </p>
          )}

          {showAlert && (
            <div className="mt-4">
              <AlertForm
                query={result.query}
                filters={filters}
                suggestedMaxPrice={result.offers[0]?.price ?? null}
                onClose={() => setShowAlert(false)}
              />
            </div>
          )}

          {result.offers.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-600">
              Nada dentro dos filtros. Crie um alerta e avisamos por e-mail quando aparecer.
            </p>
          ) : (
            <>
              <ul className="mt-4 overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
                {result.offers.slice(0, visible).map((offer, i) => (
                  <OfferRow key={offer.id} offer={offer} position={i + 1} />
                ))}
              </ul>
              {visible < result.offers.length && (
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="mt-4 w-full rounded-md border border-zinc-300 bg-white py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Mostrar mais ({result.offers.length - visible} restantes)
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
