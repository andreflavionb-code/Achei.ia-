import { NextResponse, type NextRequest } from "next/server";

/**
 * Tranca o site com senha quando APP_PASSWORD está definido.
 * Sem APP_PASSWORD, o site fica aberto (uso local).
 *
 * Rotas liberadas: login, cron (tem segredo próprio), callback do OAuth e
 * link de cancelar alerta (vem por e-mail).
 */
const PUBLIC_PATHS = ["/login", "/api/login", "/api/cron/", "/api/auth/mercadolivre/callback", "/api/alerts/cancel"];

export const AUTH_COOKIE = "achei_auth";

async function expectedCookieValue(password: string): Promise<string> {
  const data = new TextEncoder().encode(`achei:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await expectedCookieValue(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Faça login" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
