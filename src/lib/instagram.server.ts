import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

export const SESSION_COOKIE = "instabridge_session";
export const ALLOWED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
] as const;

function sessionSecret(): string {
  const secret = process.env["INSTAGRAM_SESSION_SECRET"];
  if (!secret || secret.length < 32) throw new Error("INSTAGRAM_SESSION_SECRET must be at least 32 characters.");
  return secret;
}

export function newSessionId(): string {
  return randomUUID();
}

export function signSession(id: string): string {
  return createHmac("sha256", sessionSecret()).update(id).digest("hex");
}

export function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}.${signSession(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSession(request: Request): string | null {
  const raw = (request.headers.get("cookie") ?? "").split(";").map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE + "="));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(SESSION_COOKIE.length + 1));
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/.test(supplied)) return null;
  const expected = signSession(id);
  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

function encryptionKey(): Buffer {
  const raw = process.env["INSTAGRAM_TOKEN_ENCRYPTION_KEY"] ?? "";
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INSTAGRAM_TOKEN_ENCRYPTION_KEY must encode 32 random bytes.");
  return key;
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64")).join(".");
}

export function decryptToken(value: string): string {
  const [iv, tag, ciphertext, extra] = value.split(".");
  if (!iv || !tag || !ciphertext || extra) throw new Error("The saved token format is invalid. Reconnect Instagram.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function noStoreHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

export function graphVersion(): string {
  const version = process.env["INSTAGRAM_GRAPH_API_VERSION"] ?? "v25.0";
  return /^v\\d+\\.0$/.test(version) ? version : "v25.0";
}
export async function loadInstagramToken(sessionId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: tokenRow, error: tokenError }, { data: connection, error: connectionError }] = await Promise.all([
    supabaseAdmin.from("instagram_tokens").select("access_token,updated_at").eq("user_id", sessionId).maybeSingle(),
    supabaseAdmin.from("instagram_connections").select("status,token_expires_at").eq("user_id", sessionId).maybeSingle(),
  ]);
  if (tokenError || connectionError) throw new Error("Instagram storage is unavailable.");
  if (!tokenRow?.access_token || connection?.status !== "connected") throw new Error("Instagram is not connected.");
  let token = decryptToken(tokenRow.access_token);
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const tokenUpdated = new Date(tokenRow.updated_at).getTime();
  const needsRefresh = expiresAt > 0 && expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000;
  const oldEnoughToRefresh = Number.isFinite(tokenUpdated) && Date.now() - tokenUpdated > 24 * 60 * 60 * 1000;
  if (needsRefresh && oldEnoughToRefresh) {
    const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
    refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
    refreshUrl.searchParams.set("access_token", token);
    const response = await fetch(refreshUrl, { signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!response.ok || !result.access_token) throw new Error("Instagram token refresh failed. Reconnect the account in Settings.");
    token = result.access_token;
    const now = new Date().toISOString();
    const nextExpiry = new Date(Date.now() + (result.expires_in ?? 5_184_000) * 1000).toISOString();
    const [{ error: tokenSaveError }, { error: connectionSaveError }] = await Promise.all([
      supabaseAdmin.from("instagram_tokens").update({ access_token: encryptToken(token), updated_at: now }).eq("user_id", sessionId),
      supabaseAdmin.from("instagram_connections").update({ token_expires_at: nextExpiry, updated_at: now }).eq("user_id", sessionId),
    ]);
    if (tokenSaveError || connectionSaveError) throw new Error("The refreshed Instagram token could not be saved.");
  }
  return token;
}

export async function instagramApi(
  sessionId: string,
  path: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
): Promise<Record<string, unknown>> {
  const token = await loadInstagramToken(sessionId);
  const safePath = path.split("/").filter(Boolean).map(segment => encodeURIComponent(segment)).join("/");
  const url = new URL(`https://graph.instagram.com/${graphVersion()}/${safePath}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (method === "GET") url.searchParams.set(key, value);
    else body.set(key, value);
  }
  if (method === "GET") url.searchParams.set("access_token", token);
  else body.set("access_token", token);
  const response = await fetch(url, {
    method,
    ...(method === "POST" ? { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || data.error) {
    const apiError = data.error as { message?: string } | undefined;
    throw new Error(apiError?.message || `Instagram API returned HTTP ${response.status}.`);
  }
  return data;
}

export function hashApiKey(key: string): string {
  return createHmac("sha256", sessionSecret()).update("mcp-key:").update(key).digest("hex");
}

