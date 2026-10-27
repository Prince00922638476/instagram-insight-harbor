import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export const Route = createFileRoute("/api/public/instagram/actions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: Record<string, unknown>;
        try { input = await request.json() as Record<string, unknown>; } catch {
          return Response.json({ error: "Send a valid JSON body." }, { status: 400, headers: noStoreHeaders() });
        }
        if (input["confirmed"] !== true) return Response.json({ error: "Action was not executed because explicit confirmation is required." }, { status: 400, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection, error: connectionError } = await supabaseAdmin.from("instagram_connections")
            .select("ig_user_id,scopes").eq("user_id", sessionId).eq("status", "connected").maybeSingle();
          if (connectionError || !connection) throw new Error("Instagram is not connected.");
          let result: Record<string, unknown>;
          let action = "";
          let detail = "";

          if (input["action"] === "reply") {
            if (!(connection.scopes ?? []).includes("instagram_business_manage_comments")) throw new Error("The connected account lacks comment-management permission.");
            if (typeof input["comment_id"] !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(input["comment_id"])) throw new Error("A valid comment ID is required.");
            if (typeof input["message"] !== "string" || !input["message"].trim() || input["message"].length > 1000) throw new Error("Reply must be 1–1,000 characters.");
            result = await instagramApi(sessionId, `${input["comment_id"]}/replies`, { message: input["message"].trim() }, "POST");
            action = "comment.reply"; detail = `Comment ${input["comment_id"]}: ${input["message"].trim().slice(0, 400)}`;
          } else if (input["action"] === "hide") {
            if (!(connection.scopes ?? []).includes("instagram_business_manage_comments")) throw new Error("The connected account lacks comment-management permission.");
            if (typeof input["comment_id"] !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(input["comment_id"])) throw new Error("A valid comment ID is required.");
            if (typeof input["hidden"] !== "boolean") throw new Error("hidden must be true or false.");
            result = await instagramApi(sessionId, input["comment_id"], { hide: String(input["hidden"]) }, "POST");
            action = "comment.hide"; detail = `${input["hidden"] ? "Hid" : "Unhid"} comment ${input["comment_id"]}`;
          } else if (input["action"] === "publish") {
            if (!(connection.scopes ?? []).includes("instagram_business_content_publish")) throw new Error("The connected account lacks content-publishing permission.");
            if (input["media_type"] !== "IMAGE" && input["media_type"] !== "REELS") throw new Error("Media type must be IMAGE or REELS.");
            if (!isSafeHttpsUrl(input["media_url"])) throw new Error("Use a valid public HTTPS media URL.");
            const caption = typeof input["caption"] === "string" ? input["caption"] : "";
            if (caption.length > 2200) throw new Error("Caption must be at most 2,200 characters.");
            const params: Record<string, string> = { caption };
            if (input["media_type"] === "IMAGE") params.image_url = input["media_url"];
            else { params.video_url = input["media_url"]; params.media_type = "REELS"; }
            const container = await instagramApi(sessionId, `${connection.ig_user_id}/media`, params, "POST");
            const containerId = typeof container["id"] === "string" ? container["id"] : "";
            if (!containerId) throw new Error("Instagram did not return a media container ID.");
            if (input["media_type"] === "REELS") {
              let finished = false;
              for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const status = await instagramApi(sessionId, containerId, { fields: "status_code" });
                if (status["status_code"] === "FINISHED") { finished = true; break; }
                if (status["status_code"] === "ERROR" || status["status_code"] === "EXPIRED") throw new Error("Instagram could not process this reel.");
              }
              if (!finished) throw new Error("Instagram is still processing this reel. Check status before attempting to publish again.");
            }
            result = await instagramApi(sessionId, `${connection.ig_user_id}/media_publish`, { creation_id: containerId }, "POST");
            action = "media.publish"; detail = `${input["media_type"]}: ${input["media_url"]} — ${caption.slice(0, 300)}`;
          } else {
            return Response.json({ error: "Unknown action." }, { status: 400, headers: noStoreHeaders() });
          }

          const { error: logError } = await supabaseAdmin.from("activity_log").insert({
            user_id: sessionId, action, detail: detail.slice(0, 1000), status: "success",
          });
          if (logError) console.error("[Instagram activity] The action succeeded but the audit log could not be saved.");
          return Response.json({ success: true, data: result, auditLogged: !logError }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Instagram action failed.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
