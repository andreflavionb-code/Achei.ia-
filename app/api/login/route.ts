import { NextResponse } from "next/server";

const AUTH_COOKIE = "achei_auth";

async function cookieValue(password: string): Promise<string> {
  const data = new TextEncoder().encode(`achei:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** POST /api/login (form: password, next) */
export async function POST(request: Request) {
  const expected = process.env.APP_PASSWORD?.trim();
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const origin = new URL(request.url).origin;

  if (!expected || password !== expected) {
    const url = new URL("/login", origin);
    url.searchParams.set("erro", "1");
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safeNext, origin), { status: 303 });
  res.cookies.set(AUTH_COOKIE, await cookieValue(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** DELETE /api/login: sai. */
export async function DELETE(request: Request) {
  const res = NextResponse.redirect(new URL("/login", new URL(request.url).origin), { status: 303 });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
