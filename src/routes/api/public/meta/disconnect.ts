import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/meta/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "No active Instagram session." }, { status: 401, headers: noStoreHeaders() });
        // Prevent cross-site triggering of a state-changing request.
        const origin = request.headers.get("origin");
        const requestOrigin = new URL(request.url).origin;
        if (origin && origin !== requestOrigin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [tokens, connection, states, keys] = await Promise.all([
            supabaseAdmin.from("instagram_tokens").delete().eq("user_id", sessionId),
            supabaseAdmin.from("instagram_connections").delete().eq("user_id", sessionId),
            supabaseAdmin.from("oauth_states").delete().eq("user_id", sessionId),
            supabaseAdmin.from("mcp_api_keys").update({ revoked_at: new Date().toISOString() }).eq("user_id", sessionId).is("revoked_at", null),
          ]);
          if (tokens.error || connection.error || states.error || keys.error) throw new Error("Database deletion failed.");
          return Response.json({ disconnected: true }, { headers: noStoreHeaders({ "Set-Cookie": clearSessionCookie() }) });
        } catch (error) {
          console.error("[Instagram disconnect]", error instanceof Error ? error.message : "Database unavailable");
          return Response.json({ error: "Could not safely disconnect. Please try again." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
