import { createFileRoute } from "@tanstack/react-router";
import { InstagramApiError, instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

function safeError(error: unknown) {
  if (error instanceof InstagramApiError) return error.toSafeJSON();
  return { message: error instanceof Error ? error.message.slice(0, 400) : "Instagram request failed." };
}

export const Route = createFileRoute("/api/public/instagram/stories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first.", code: "not_connected" }, { status: 401, headers: noStoreHeaders() });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection, error } = await supabaseAdmin
            .from("instagram_connections")
            .select("ig_user_id,account_type,scopes,status")
            .eq("user_id", sessionId)
            .maybeSingle();
          if (error) throw new Error("Instagram connection data could not be read.");
          if (!connection || connection.status !== "connected") {
            return Response.json({ available: false, data: [], error: { message: "Instagram is not connected." }, hint: "Open Connect Instagram and authorize a professional account." }, { status: 409, headers: noStoreHeaders() });
          }

          const fields = "id,media_type,media_url,thumbnail_url,permalink,timestamp";
          try {
            const result = await instagramApi(sessionId, `${connection.ig_user_id}/stories`, { fields, limit: "25" });
            return Response.json({
              available: true,
              accountType: connection.account_type,
              data: Array.isArray(result["data"]) ? result["data"] : [],
              paging: result["paging"] && typeof result["paging"] === "object" ? result["paging"] : null,
            }, { headers: noStoreHeaders() });
          } catch (error) {
            const reason = safeError(error);
            const businessOnly = connection.account_type !== "BUSINESS";
            return Response.json({
              available: false,
              data: [],
              error: reason,
              hint: businessOnly
                ? "Stories access may be limited to eligible Business accounts and the current Meta API login configuration. Check Diagnostics before changing account type."
                : "The current Instagram Login configuration may not expose the Stories listing edge. Check Diagnostics; the app does not silently substitute demo stories.",
            }, { headers: noStoreHeaders() });
          }
        } catch (error) {
          console.error("[Instagram stories]", error instanceof Error ? error.message : "Connection check failed");
          return Response.json({ available: false, data: [], error: safeError(error), hint: "Check Supabase, the connection record and the token before retrying." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
