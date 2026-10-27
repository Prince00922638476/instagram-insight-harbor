import { createServerFn } from "@tanstack/react-start";

// Report readiness only. Secret values are never returned to the browser.
export const getMetaConfig = createServerFn({ method: "GET" }).handler(async () => {
  const checks = {
    INSTAGRAM_APP_ID: Boolean(process.env["INSTAGRAM_APP_ID"] || process.env["META_APP_ID"]),
    INSTAGRAM_APP_SECRET: Boolean(process.env["INSTAGRAM_APP_SECRET"] || process.env["META_APP_SECRET"]),
    META_REDIRECT_URI: Boolean(process.env["META_REDIRECT_URI"]),
    INSTAGRAM_SESSION_SECRET: Boolean(process.env["INSTAGRAM_SESSION_SECRET"] && process.env["INSTAGRAM_SESSION_SECRET"]!.length >= 32),
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: /^[a-f0-9]{64}$/i.test(process.env["INSTAGRAM_TOKEN_ENCRYPTION_KEY"] ?? ""),
    SUPABASE_URL: Boolean(process.env["SUPABASE_URL"]),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]),
  };
  const optionalChecks = {
    OPENAI_API_KEY: Boolean(process.env["OPENAI_API_KEY"]),
    META_WEBHOOK_VERIFY_TOKEN: Boolean(process.env["META_WEBHOOK_VERIFY_TOKEN"]),
    OPENAI_MODEL: Boolean(process.env["OPENAI_MODEL"]),
    OPENAI_IMAGE_MODEL: Boolean(process.env["OPENAI_IMAGE_MODEL"]),
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { configured: missing.length === 0, missing, checks, optionalChecks };
});
