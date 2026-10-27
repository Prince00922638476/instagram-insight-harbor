import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/instagram/automation/drafts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin;
          const { data, error } = await admin.from("instagram_reply_drafts")
            .select("id,comment_id,media_id,commenter_username,comment_text,suggested_reply,status,created_at")
            .eq("user_id", ownerId).in("status", ["pending", "sending", "needs_review"]).order("created_at", { ascending: false }).limit(100);
          if (error) throw error;
          return Response.json({ drafts: data ?? [] }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[Automation drafts GET]", error instanceof Error ? error.message : "Storage unavailable");
          return Response.json({ error: "Reply queue unavailable. Apply migration 0002." }, { status: 503, headers: noStoreHeaders() });
        }
      },
      POST: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: { id?: unknown; action?: unknown; message?: unknown };
        try { input = await request.json() as typeof input; } catch {
          return Response.json({ error: "Send valid JSON." }, { status: 400, headers: noStoreHeaders() });
        }
        if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) {
          return Response.json({ error: "A valid draft ID is required." }, { status: 400, headers: noStoreHeaders() });
        }
        if (input.action !== "send" && input.action !== "dismiss") {
          return Response.json({ error: "Action must be send or dismiss." }, { status: 400, headers: noStoreHeaders() });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;
          const { data: draft, error: draftError } = await admin.from("instagram_reply_drafts")
            .select("id,user_id,comment_id,suggested_reply,status").eq("id", input.id).eq("user_id", ownerId).maybeSingle();
          if (draftError || !draft) return Response.json({ error: "Draft not found." }, { status: 404, headers: noStoreHeaders() });
          if (input.action === "dismiss") {
            const { data: dismissed, error } = await admin.from("instagram_reply_drafts").update({ status: "dismissed" })
              .eq("id", input.id).eq("user_id", ownerId).in("status", ["pending", "needs_review"])
              .select("id").maybeSingle();
            if (error) throw error;
            if (!dismissed) return Response.json({ error: "This draft was already handled." }, { status: 409, headers: noStoreHeaders() });
            return Response.json({ success: true, status: "dismissed" }, { headers: noStoreHeaders() });
          }
          if (draft.status !== "pending") {
            return Response.json({ error: "The reply outcome may be uncertain. Check the Instagram comments before trying again; this draft cannot be sent a second time automatically." }, { status: 409, headers: noStoreHeaders() });
          }

          const message = typeof input.message === "string" ? input.message.trim() : draft.suggested_reply;
          if (!message || message.length > 1000) return Response.json({ error: "Reply must be 1–1,000 characters." }, { status: 400, headers: noStoreHeaders() });
          const { data: connection, error: connectionError } = await admin.from("instagram_connections")
            .select("scopes,status").eq("user_id", ownerId).maybeSingle();
          if (connectionError || connection?.status !== "connected") return Response.json({ error: "Instagram is not connected." }, { status: 409, headers: noStoreHeaders() });
          if (!(connection.scopes ?? []).includes("instagram_business_manage_comments")) return Response.json({ error: "Comment-management permission is missing. Reconnect Instagram and approve it." }, { status: 403, headers: noStoreHeaders() });

          const { data: claimed, error: claimError } = await admin.from("instagram_reply_drafts").update({ status: "sending" })
            .eq("id", input.id).eq("user_id", ownerId).eq("status", "pending").select("id").maybeSingle();
          if (claimError || !claimed) return Response.json({ error: "This draft is already being handled. Refresh the page." }, { status: 409, headers: noStoreHeaders() });
          try {
            await instagramApi(ownerId, `${draft.comment_id}/replies`, { message }, "POST");
            const now = new Date().toISOString();
            const { error: updateError } = await admin.from("instagram_reply_drafts").update({ status: "sent", suggested_reply: message, sent_at: now })
              .eq("id", input.id).eq("user_id", ownerId);
            if (updateError) throw new Error("Reply sent, but draft status could not be updated. Check the comments page before retrying.");
            await admin.from("activity_log").insert({ user_id: ownerId, action: "automation.reply", detail: `Replied to comment ${draft.comment_id}: ${message.slice(0, 300)}`, status: "success" });
            return Response.json({ success: true, status: "sent" }, { headers: noStoreHeaders() });
          } catch (error) {
            // Never reset to pending after the external request starts: a timeout can
            // happen after Instagram accepted the reply, and retrying could duplicate it.
            const { error: reviewError } = await admin.from("instagram_reply_drafts").update({ status: "needs_review" })
              .eq("id", input.id).eq("user_id", ownerId).eq("status", "sending");
            if (reviewError) console.error("[Automation drafts POST] Could not mark ambiguous reply for review.");
            throw new Error("Instagram may have received the reply, but its final status could not be confirmed. Check the Instagram comments before retrying; this draft was not reset for sending.");
          }
        } catch (error) {
          console.error("[Automation drafts POST]", error instanceof Error ? error.message : "Action failed");
          return Response.json({ error: error instanceof Error ? error.message : "Could not handle this draft." }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
