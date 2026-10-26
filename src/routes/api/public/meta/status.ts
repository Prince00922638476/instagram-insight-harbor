import { createFileRoute } from "@tanstack/react-router";
import { noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/meta/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ connected: false }, { headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("instagram_connections")
            .select("username,account_type,scopes,token_expires_at,status,updated_at")
            .eq("user_id", sessionId)
            .maybeSingle();
          if (error) throw error;
          const connected = data?.status === "connected";
          return Response.json({
            connected,
            account: connected ? {
              username: data.username,
              accountType: data.account_type,
              scopes: data.scopes,
              tokenExpiresAt: data.token_expires_at,
              updatedAt: data.updated_at,
            } : null,
          }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[Instagram status]", error instanceof Error ? error.message : "Database unavailable");
          return Response.json({ connected: false, error: "storage_unavailable" }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
