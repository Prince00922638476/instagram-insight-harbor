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
