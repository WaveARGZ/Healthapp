import { cloudConfig } from "@/lib/cloud/config";

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
type Pending = { verifier: string; state: string; remember: boolean };
const tokenKey = "bodymake.cognito.tokens.v1";
const pendingKey = "bodymake.cognito.pending.v1";
let refreshPromise: Promise<string | null> | null = null;

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readTokens(): { tokens: Tokens; remember: boolean } | null {
  if (typeof window === "undefined") return null;
  for (const [storage, remember] of [[window.localStorage, true], [window.sessionStorage, false]] as const) {
    try {
      const raw = storage.getItem(tokenKey);
      if (raw) return { tokens: JSON.parse(raw) as Tokens, remember };
    } catch { /* Storage may be disabled. */ }
  }
  return null;
}

function saveTokens(tokens: Tokens, remember: boolean): void {
  clearCloudSession();
  (remember ? window.localStorage : window.sessionStorage).setItem(tokenKey, JSON.stringify(tokens));
}

export function hasCloudSession(): boolean {
  return Boolean(readTokens());
}

/** Local cache namespace only. The API never trusts this decoded claim. */
export function getCloudSubject(): string | null {
  const token = readTokens()?.tokens.accessToken;
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encoded)) as { sub?: unknown };
    return typeof claims.sub === "string" && /^[\w-]{8,128}$/.test(claims.sub) ? claims.sub : null;
  } catch { return null; }
}

export function clearCloudSession(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(tokenKey); window.sessionStorage.removeItem(tokenKey); } catch { /* ignore */ }
}

export async function beginCloudSignIn(signup: boolean, remember: boolean, provider?: "Google"): Promise<void> {
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = encode(crypto.getRandomValues(new Uint8Array(24)));
  window.sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, state, remember } satisfies Pending));
  const url = new URL(provider ? "/oauth2/authorize" : signup ? "/signup" : "/oauth2/authorize", cloudConfig.authDomain);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cloudConfig.clientId);
  url.searchParams.set("redirect_uri", cloudConfig.callbackUrl);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  if (provider) url.searchParams.set("identity_provider", provider);
  window.location.assign(url.toString());
}

async function exchange(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(`${cloudConfig.authDomain}/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!response.ok) throw new Error("Cognito の認証に失敗しました。もう一度お試しください。");
  return response.json() as Promise<Record<string, unknown>>;
}

export async function completeCloudSignIn(params: URLSearchParams): Promise<void> {
  const raw = window.sessionStorage.getItem(pendingKey);
  window.sessionStorage.removeItem(pendingKey);
  if (!raw) throw new Error("ログイン開始情報が見つかりません。もう一度ログインしてください。");
  const pending = JSON.parse(raw) as Pending;
  if (!params.get("code") || params.get("state") !== pending.state) throw new Error("ログインの確認に失敗しました。もう一度ログインしてください。");
  const result = await exchange(new URLSearchParams({
    grant_type: "authorization_code", client_id: cloudConfig.clientId,
    code: params.get("code")!, redirect_uri: cloudConfig.callbackUrl,
    code_verifier: pending.verifier,
  }));
  if (typeof result.access_token !== "string" || typeof result.refresh_token !== "string") throw new Error("ログイン情報を取得できませんでした。");
  saveTokens({ accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000 }, pending.remember);
}

export async function getCloudAccessToken(): Promise<string | null> {
  const stored = readTokens();
  if (!stored) return null;
  if (stored.tokens.expiresAt > Date.now() + 60_000) return stored.tokens.accessToken;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const result = await exchange(new URLSearchParams({ grant_type: "refresh_token", client_id: cloudConfig.clientId, refresh_token: stored.tokens.refreshToken }));
        if (typeof result.access_token !== "string") throw new Error("invalid_token");
        saveTokens({ accessToken: result.access_token, refreshToken: typeof result.refresh_token === "string" ? result.refresh_token : stored.tokens.refreshToken, expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000 }, stored.remember);
        return result.access_token;
      } catch {
        clearCloudSession();
        return null;
      } finally { refreshPromise = null; }
    })();
  }
  return refreshPromise;
}

export function signOutCloud(): void {
  clearCloudSession();
  const url = new URL("/logout", cloudConfig.authDomain);
  url.searchParams.set("client_id", cloudConfig.clientId);
  url.searchParams.set("logout_uri", cloudConfig.logoutUrl);
  window.location.assign(url.toString());
}
