import { createServerFn } from "@tanstack/react-start";

// Meta credentials are server-only env vars. Nothing here returns secrets or tokens.
export const getMetaConfig = createServerFn({ method: "GET" }).handler(async () => {
  const appId = process.env["META_APP_ID"];
  const secret = process.env["META_APP_SECRET"];
  const redirect = process.env["META_REDIRECT_URI"];
  return {
    configured: Boolean(appId && secret && redirect),
    missing: [
      !appId && "META_APP_ID",
      !secret && "META_APP_SECRET",
      !redirect && "META_REDIRECT_URI",
    ].filter(Boolean) as string[],
  };
});

export const getOAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { scopes: string[] }) => ({
    scopes: input.scopes.filter((s) => /^instagram_business_[a-z_]+$/.test(s)),
  }))
  .handler(async ({ data }) => {
    const appId = process.env["META_APP_ID"];
    const redirect = process.env["META_REDIRECT_URI"];
    if (!appId || !redirect) throw new Error("Meta app credentials are not configured.");
    const state = crypto.randomUUID();
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", data.scopes.join(","));
    url.searchParams.set("state", state);
    return { url: url.toString(), state };
  });
