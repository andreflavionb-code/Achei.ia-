/**
 * Autenticação OAuth do Mercado Livre.
 *
 * Desde 2024 a busca pública (/sites/MLB/search) exige um access token.
 * Para obtê-lo é preciso um aplicativo registrado em
 * https://developers.mercadolivre.com.br/ (gratuito). O fluxo é:
 *
 *   1. Usuário abre /api/auth/mercadolivre -> redirecionado para o ML.
 *   2. ML devolve um "code" em /api/auth/mercadolivre/callback.
 *   3. Trocamos o code por access_token (6h) + refresh_token.
 *   4. Guardamos os tokens no banco e renovamos sozinhos quando vencem.
 *
 * O refresh_token do ML é de uso único: cada renovação devolve um novo.
 *
 * Atalho sem login: com ML_CLIENT_ID e ML_CLIENT_SECRET definidos, mesmo
 * sem o usuário autorizar, pedimos um token de aplicativo
 * (grant_type=client_credentials), que basta para a busca pública.
 */

import { prisma } from "@/lib/prisma";

const PROVIDER = "mercadolivre";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";

/** Margem de segurança: renova 5 min antes de vencer. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function getMlCredentials() {
  const clientId = process.env.ML_CLIENT_ID?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();
  const redirectUri = process.env.ML_REDIRECT_URI?.trim() || "http://localhost:3000/api/auth/mercadolivre/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizationUrl(): string | null {
  const creds = getMlCredentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user_id?: number;
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mercado Livre OAuth falhou (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

async function saveToken(token: TokenResponse) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await prisma.oAuthToken.upsert({
    where: { provider: PROVIDER },
    create: {
      provider: PROVIDER,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
      externalUserId: token.user_id ? String(token.user_id) : null,
    },
    update: {
      accessToken: token.access_token,
      // Se o ML não devolver refresh novo, mantemos o anterior.
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      expiresAt,
      externalUserId: token.user_id ? String(token.user_id) : null,
    },
  });
}

/** Passo 3 do fluxo: troca o code recebido no callback pelos tokens. */
export async function exchangeCodeForToken(code: string) {
  const creds = getMlCredentials();
  if (!creds) throw new Error("Credenciais do Mercado Livre não configuradas.");
  const token = await requestToken({
    grant_type: "authorization_code",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: creds.redirectUri,
  });
  await saveToken(token);
}

let appToken: { token: string; expiresAt: number } | null = null;

/** Token de aplicativo (sem usuário), guardado em memória até vencer. */
async function getAppToken(creds: NonNullable<ReturnType<typeof getMlCredentials>>): Promise<string> {
  if (appToken && appToken.expiresAt - Date.now() > REFRESH_MARGIN_MS) return appToken.token;
  const token = await requestToken({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  appToken = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}

/**
 * Devolve um access token válido, renovando se necessário.
 * Sem autorização do usuário, usa o token de aplicativo (client_credentials).
 * Retorna null só quando não há credenciais.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const creds = getMlCredentials();
  if (!creds) return null;

  const stored = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } }).catch(() => null);
  if (!stored) return getAppToken(creds);

  const stillValid = stored.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;
  if (stillValid) return stored.accessToken;

  if (!stored.refreshToken) return getAppToken(creds);

  const refreshed = await requestToken({
    grant_type: "refresh_token",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: stored.refreshToken,
  });
  await saveToken(refreshed);
  return refreshed.access_token;
}

export async function hasMlAuthorization(): Promise<boolean> {
  if (!getMlCredentials()) return false;
  const stored = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } });
  return Boolean(stored);
}
