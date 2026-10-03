"use client";

import { useEffect, useState } from "react";

interface Status {
  demoMode: boolean;
  mercadolivre: { configured: boolean; authorized: boolean; affiliate: boolean };
  email: boolean;
}

/** Aviso no topo: mostra o que falta configurar para sair do modo de exemplo. */
export function StatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const items: string[] = [];
  if (!status.mercadolivre.configured) {
    items.push("Mercado Livre sem credenciais de aplicativo (ML_CLIENT_ID / ML_CLIENT_SECRET).");
  } else if (!status.mercadolivre.authorized) {
    items.push("Mercado Livre configurado, mas ainda não autorizado.");
  }
  if (!status.mercadolivre.affiliate) items.push("Links de afiliado do Mercado Livre não configurados.");
  if (!status.email) items.push("SMTP não configurado: alertas serão só impressos no console.");

  if (items.length === 0 && !status.demoMode) return null;

  return (
    <div className="mx-auto mt-4 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        {status.demoMode ? "Modo de exemplo ativo: os resultados abaixo são fictícios." : "Configuração incompleta."}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {status.mercadolivre.configured && !status.mercadolivre.authorized && (
        <a href="/api/auth/mercadolivre" className="mt-2 inline-block font-medium underline">
          Conectar conta do Mercado Livre
        </a>
      )}
      <p className="mt-1 text-xs text-amber-800">O passo a passo está no README do projeto.</p>
    </div>
  );
}
