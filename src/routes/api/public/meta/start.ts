import { createFileRoute } from "@tanstack/react-router";
import { ALLOWED_SCOPES, newSessionId, noStoreHeaders, readSession, sessionCookie } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/meta/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const appId = process.env["META_APP_ID"];
        const secret = process.env["META_APP_SECRET"];
        const redirectUri = process.env["META_REDIRECT_URI"];
        if (!appId || !secret || !redirectUri ||
          !process.env["INSTAGRAM_SESSION_SECRET"] ||
          !process.env["INSTAGRAM_TOKEN_ENCRYPTION_KEY"] ||
          !process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
          return new Response(null, {
            status: 302,
            headers: noStoreHeaders({ Location: "/connect?oauth=misconfigured" }),
          });
        }

        const requested = (url.searchParams.get("scopes") ?? "").split(",").filter(Boolean);
        const scopes = [...new Set(requested.filter(scope => (ALLOWED_SCOPES as readonly string[]).includes(scope)))];
        if (!scopes.includes("instagram_business_basic")) scopes.unshift("instagram_business_basic");

        try {
          const ownerId = readSession(request) ?? newSessionId();
          const state = crypto.randomUUID();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("oauth_states").insert({
            state,
            user_id: ownerId,
            scopes,
          });
          if (error) throw new Error("OAuth state could not be saved.");
          const authUrl = new URL("https://www.instagram.com/oauth/authorize");
          authUrl.searchParams.set("client_id", appId);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("scope", scopes.join(","));
          authUrl.searchParams.set("state", state);
          authUrl.searchParams.set("enable_fb_login", "0");
          return new Response(null, {
            status: 302,
            headers: noStoreHeaders({
              Location: authUrl.toString(),
              "Set-Cookie": sessionCookie(ownerId),
            }),
          });
        } catch (error) {
          console.error("[Instagram OAuth start]", error instanceof Error ? error.message : "Unexpected error");
          return new Response(null, {
            status: 302,
            headers: noStoreHeaders({ Location: "/connect?oauth=storage_failed" }),
          });
        }
      },
    },
  },
});
