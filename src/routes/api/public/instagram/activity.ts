import { createFileRoute } from "@tanstack/react-router";
import { noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/instagram/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.from("activity_log")
            .select("id,action,detail,status,created_at")
            .eq("user_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          return Response.json({ data: data ?? [] }, { headers: noStoreHeaders() });
        } catch {
          return Response.json({ error: "Activity history is unavailable." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
