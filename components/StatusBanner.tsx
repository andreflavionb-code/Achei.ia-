"use client";

import { useEffect, useState } from "react";

interface Status {
  demoMode: boolean;
  passwordProtected: boolean;
  sources: { id: string; name: string; kind: "api" | "web" | "demo" }[];
  mercadolivre: { configured: boolean; authorized: boolean; affiliate: boolean };
  email: boolean;
}

/** Faixa no topo: de onde vêm os dados e o que ainda falta configurar. */
export function StatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const web = status.sources.filter((s) => s.kind === "web").map((s) => s.name);
  const api = status.sources.filter((s) => s.kind === "api").map((s) => s.name);

  return (
    <div className="mx-auto mt-4 max-w-5xl rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
      <p>
        <span className="font-medium">Fontes ativas:</span>{" "}
        {api.length > 0 && <>{api.join(", ")} (API oficial)</>}
        {api.length > 0 && web.length > 0 && "; "}
        {web.length > 0 && <>{web.join(", ")} (leitura da página pública)</>}
        {status.demoMode && <>; dados de exemplo</>}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-500">
        {web.length > 0 && <li>Leitura de página depende do layout dos sites e pode falhar em alguns. Erros aparecem por fonte, abaixo da busca.</li>}
        {!status.email && <li>SMTP não configurado: alertas serão só impressos no console.</li>}
        {!status.passwordProtected && <li>Sem senha de acesso (APP_PASSWORD vazio). Defina antes de publicar.</li>}
        {status.mercadolivre.configured && !status.mercadolivre.authorized && (
          <li>
            <a href="/api/auth/mercadolivre" className="underline">
              Conectar conta do Mercado Livre
            </a>{" "}
            para usar a API oficial.
          </li>
        )}
      </ul>
    </div>
  );
}
