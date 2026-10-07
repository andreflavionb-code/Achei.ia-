"use client";

export interface Status {
  demoMode: boolean;
  passwordProtected: boolean;
  sources: { id: import("@/lib/offers/types").SourceId; name: string; kind: "api" | "plain" | "browser" | "demo" }[];
  mercadolivre: { configured: boolean; authorized: boolean; affiliate: boolean };
  inactive: { id: string; name: string; reason: string }[];
  email: boolean;
  alertsIntervalMin: number;
}

/** Faixa no topo: de onde vêm os dados e o que ainda falta configurar. */
export function StatusBanner({ status }: { status: Status | null }) {
  if (!status) return null;

  const direct = status.sources.filter((s) => s.kind === "plain").map((s) => s.name);
  const browser = status.sources.filter((s) => s.kind === "browser").map((s) => s.name);
  const api = status.sources.filter((s) => s.kind === "api").map((s) => s.name);

  return (
    <div className="mx-auto mt-4 max-w-5xl rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
      <p>
        <span className="font-medium">Lojas:</span>{" "}
        {api.length > 0 && <>{api.join(", ")} (API oficial); </>}
        {direct.length > 0 && <>{direct.join(", ")} (leitura direta)</>}
        {direct.length > 0 && browser.length > 0 && "; "}
        {browser.length > 0 && <>{browser.join(", ")} (Chrome escondido, 15 a 40s)</>}
        {status.demoMode && <>; dados de exemplo</>}
        {status.inactive?.length > 0 && (
          <>
            {" "}
            · <span className="text-amber-700">desligadas: {status.inactive.map((s) => `${s.name} (${s.reason})`).join("; ")}</span>
          </>
        )}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-500">
        {!status.email && <li>E-mail não configurado (SMTP): alertas ficam só no terminal. Veja o README para ligar o Gmail.</li>}
        {status.email && status.alertsIntervalMin > 0 && <li>Alertas verificados automaticamente a cada {status.alertsIntervalMin} min enquanto o servidor estiver aberto.</li>}
        {!status.passwordProtected && <li>Sem senha de acesso (APP_PASSWORD vazio). Defina antes de publicar na internet.</li>}
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
