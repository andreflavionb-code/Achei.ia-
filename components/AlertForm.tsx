"use client";

import { useState } from "react";
import type { SearchFilters } from "@/lib/offers/types";

interface Props {
  query: string;
  filters: SearchFilters;
  /** Sugestão inicial de preço máximo (ex.: menor preço atual). */
  suggestedMaxPrice: number | null;
  onClose: () => void;
}

/** Cria um alerta: busca salva + preço máximo + e-mail. */
export function AlertForm({ query, filters, suggestedMaxPrice, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [maxPrice, setMaxPrice] = useState(
    filters.maxPrice?.toString() ?? (suggestedMaxPrice ? Math.floor(suggestedMaxPrice * 0.9).toString() : ""),
  );
  const [state, setState] = useState<{ status: "idle" | "saving" | "done" | "error"; message?: string }>({
    status: "idle",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "saving" });
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          query,
          maxPrice: Number(maxPrice.replace(",", ".")),
          filters: { ...filters, maxPrice: undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar alerta");
      setState({ status: "done" });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Erro" });
    }
  }

  if (state.status === "done") {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">Alerta criado.</p>
        <p>
          Vamos verificar &quot;{query}&quot; periodicamente e avisar em <strong>{email}</strong> quando
          aparecer por até R$ {maxPrice}.
        </p>
        <button onClick={onClose} className="mt-2 text-emerald-800 underline">
          Fechar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold">Me avise quando &quot;{query}&quot; ficar mais barato</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Os filtros atuais (parcelamento, origem, frete) ficam salvos no alerta.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <input
          type="email"
          required
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          inputMode="decimal"
          required
          placeholder="Preço máximo (R$)"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state.status === "saving"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {state.status === "saving" ? "Salvando..." : "Criar alerta"}
        </button>
      </div>
      {state.status === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}
      <button type="button" onClick={onClose} className="mt-3 text-sm text-zinc-500 underline">
        Cancelar
      </button>
    </form>
  );
}
