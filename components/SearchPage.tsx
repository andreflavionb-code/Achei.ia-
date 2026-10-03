"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OriginFilter, SearchFilters, SearchResult } from "@/lib/offers/types";
import { formatBRL } from "@/lib/format";
import { OfferRow } from "./OfferRow";
import { AlertForm } from "./AlertForm";
import { StatusBanner } from "./StatusBanner";

const PAGE_SIZE = 50;

function filtersFromParams(params: URLSearchParams): SearchFilters {
  const maxPrice = Number(params.get("maxPrice"));
  return {
    interestFreeOnly: params.get("interestFreeOnly") === "1",
    origin: (params.get("origin") as OriginFilter) || "all",
    maxPrice: maxPrice > 0 ? maxPrice : null,
    freeShippingOnly: params.get("freeShippingOnly") === "1",
    newOnly: params.get("newOnly") === "1",
    precise: params.get("precise") !== "0",
  };
}

function paramsFromState(query: string, filters: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("q", query);
  if (filters.interestFreeOnly) p.set("interestFreeOnly", "1");
  if (filters.origin !== "all") p.set("origin", filters.origin);
  if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
  if (filters.freeShippingOnly) p.set("freeShippingOnly", "1");
  if (filters.newOnly) p.set("newOnly", "1");
  if (!filters.precise) p.set("precise", "0");
  return p;
}

export function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>(() => filtersFromParams(searchParams));
  const [maxPriceInput, setMaxPriceInput] = useState(searchParams.get("maxPrice") ?? "");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const runSearch = useCallback(
    async (q: string, f: SearchFilters) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setLoading(true);
      setError(null);
      setVisible(PAGE_SIZE);
      const params = paramsFromState(trimmed, f);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      try {
        const res = await fetch(`/api/search?${params.toString()}`);
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
    const maxPrice = Number(maxPriceInput.replace(",", "."));
    const next = { ...filters, maxPrice: maxPrice > 0 ? maxPrice : null };
    setFilters(next);
    void runSearch(query, next);
  }

  const okSources = useMemo(() => result?.sources.filter((s) => s.status === "ok") ?? [], [result]);
  const hiddenByPrecision = useMemo(() => okSources.reduce((n, s) => n + s.hiddenByPrecision, 0), [okSources]);
  const errorSources = useMemo(() => result?.sources.filter((s) => s.status === "error") ?? [], [result]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="pt-10 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Achei</h1>
        <p className="mt-1 text-zinc-600">
          Busca em vários marketplaces de uma vez e ordena do menor para o maior preço, sem esconder resultados.
        </p>
      </header>

      <StatusBanner />

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
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-700">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filters.interestFreeOnly}
              onChange={(e) => updateFilters({ interestFreeOnly: e.target.checked })}
            />
            Só parcelamento sem juros
          </label>
          <label className="flex items-center gap-1.5">
            Origem
            <select
              value={filters.origin}
              onChange={(e) => updateFilters({ origin: e.target.value as OriginFilter })}
              className="rounded border border-zinc-300 px-2 py-1"
            >
              <option value="all">Todas</option>
              <option value="national">Nacional</option>
              <option value="international">Internacional</option>
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
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filters.newOnly} onChange={(e) => updateFilters({ newOnly: e.target.checked })} />
            Só novos
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
        </div>
      </form>

      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-700">
              <strong>{result.offers.length}</strong> oferta(s) para &quot;{result.query}&quot;, ordenadas do menor
              para o maior preço
              {result.offers.length > 0 && (
                <>
                  {" "}
                  · menor: <strong>{formatBRL(result.offers[0].price)}</strong>
                </>
              )}
            </div>
            <button
              onClick={() => setShowAlert((v) => !v)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
            >
              Criar alerta de preço
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {okSources.map((s) => (
              <span key={s.id} className="rounded-full bg-zinc-200 px-2.5 py-1 text-zinc-700">
                {s.name}: {s.shown} de {s.fetched}
              </span>
            ))}
            {errorSources.map((s) => (
              <span key={s.id} className="rounded-full bg-red-100 px-2.5 py-1 text-red-700" title={s.error}>
                {s.name}: erro
              </span>
            ))}
          </div>
          {hiddenByPrecision > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              {hiddenByPrecision} item(ns) escondido(s) pelo modo preciso (acessórios ou sem relação com a busca).{" "}
              <button onClick={() => updateFilters({ precise: false })} className="underline">
                Mostrar tudo
              </button>
            </p>
          )}
          {errorSources.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-700">
              {errorSources.map((s) => (
                <li key={s.id}>
                  {s.name}: {s.error}
                </li>
              ))}
            </ul>
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
