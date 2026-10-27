import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionCookie,
  decryptToken,
  encryptToken,
  graphVersion,
  hashApiKey,
  noStoreHeaders,
  normalizeInstagramApiPath,
  readSession,
  sessionCookie,
  signSession,
} from "@/lib/instagram.server";

const sessionId = "f5480644-6e19-4f70-9b31-104b4ce60f87";

describe("Instagram API path validation", () => {
  it("preserves valid API paths", () => {
    expect(normalizeInstagramApiPath("me/media")).toBe("me/media");
    expect(normalizeInstagramApiPath("17841400000000000/media_publish")).toBe("17841400000000000/media_publish");
  });

  it("rejects traversal, query strings, and empty paths", () => {
    expect(() => normalizeInstagramApiPath("../me")).toThrow("Invalid Instagram API path.");
    expect(() => normalizeInstagramApiPath("comments/../../me")).toThrow("Invalid Instagram API path.");
    expect(() => normalizeInstagramApiPath("me?access_token=secret")).toThrow("Invalid Instagram API path.");
    expect(() => normalizeInstagramApiPath("")).toThrow("Invalid Instagram API path.");
  });
});

describe("Instagram server security helpers", () => {
  beforeEach(() => {
    vi.stubEnv("INSTAGRAM_SESSION_SECRET", "test-session-secret-that-is-at-least-32-characters");
    vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("INSTAGRAM_GRAPH_API_VERSION", "v25.0");
  });

  it("signs a session cookie and rejects invalid signatures", () => {
    const cookieHeader = sessionCookie(sessionId).split(";")[0] ?? "";
    expect(readSession(new Request("https://example.test", { headers: { cookie: cookieHeader } }))).toBe(sessionId);
    expect(readSession(new Request("https://example.test", { headers: { cookie: `instabridge_session=${sessionId}.${"0".repeat(64)}` } }))).toBeNull();
    expect(readSession(new Request("https://example.test"))).toBeNull();
  });

  it("does not accept malformed session IDs or signatures", () => {
    expect(readSession(new Request("https://example.test", { headers: { cookie: "instabridge_session=bad.bad" } }))).toBeNull();
  });

  it("encrypts tokens at rest and decrypts them correctly", () => {
    const token = "sample-instagram-access-token";
    const first = encryptToken(token);
    const second = encryptToken(token);
    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe(token);
  });

  it("rejects a modified encrypted token", () => {
    const parts = encryptToken("sample-token").split(".");
    parts[1] = Buffer.from("tampered-tag").toString("base64");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });

  it("hashes MCP keys deterministically without returning the original key", () => {
    const key = "ib_mcp_sample_key_that_should_never_be_stored_in_plain_text_123";
    const hashed = hashApiKey(key);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toContain(key);
    expect(hashApiKey(key)).toBe(hashed);
  });

  it("sets anti-cache and basic response security headers", () => {
    const headers = noStoreHeaders({ "Content-Type": "application/json" });
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("accepts only the expected Graph API version format", () => {
    expect(graphVersion()).toBe("v25.0");
    vi.stubEnv("INSTAGRAM_GRAPH_API_VERSION", "bad-value");
    expect(graphVersion()).toBe("v25.0");
    vi.stubEnv("INSTAGRAM_GRAPH_API_VERSION", "v26.0");
    expect(graphVersion()).toBe("v26.0");
  });
});
