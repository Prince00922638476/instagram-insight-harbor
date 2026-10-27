import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders } from "@/lib/instagram.server";

type WebhookComment = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
};
type WebhookBody = {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WebhookComment }> }>;
};

function constantTimeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env["META_APP_SECRET"];
  if (!secret || !header?.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return constantTimeStringEqual(received.toLowerCase(), expected);
}

async function draftReply(comment: string, username: string, instruction: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env["OPENAI_MODEL"] || "gpt-4.1-mini",
      temperature: 0.4,
      max_tokens: 180,
      messages: [
        { role: "system", content: `You write one short, respectful Instagram public-comment reply. Follow this owner instruction: ${instruction}. Reply in the same language as the comment. Avoid invented facts, guarantees, personal-data requests, hashtags spam, or mentioning AI. Return only the reply text, maximum 500 characters.` },
        { role: "user", content: `Comment from @${username || "user"}: ${comment.slice(0, 1000)}` },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string | null } }> };
  if (!response.ok) throw new Error(`AI reply generation failed with status ${response.status}.`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI returned an empty reply.");
  return text.slice(0, 1000);
}

async function processComment(entryId: string, comment: WebhookComment): Promise<void> {
  const commentId = typeof comment.id === "string" ? comment.id : "";
  const mediaId = typeof comment.media?.id === "string" ? comment.media.id : "";
  const text = typeof comment.text === "string" ? comment.text.trim() : "";
  const commenter = typeof comment.from?.username === "string" ? comment.from.username : "";
  const commenterId = typeof comment.from?.id === "string" ? comment.from.id : "";
  if (!commentId || !mediaId || !text || !/^[A-Za-z0-9_.-]{1,128}$/.test(commentId)) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin;
  const { data: connection, error: connectionError } = await admin.from("instagram_connections")
    .select("user_id,ig_user_id,username,scopes,status")
    .eq("ig_user_id", entryId).eq("status", "connected").maybeSingle();
  if (connectionError || !connection) return;
  if (commenterId && commenterId === connection.ig_user_id) return;
  if (commenter && connection.username && commenter.toLowerCase() === String(connection.username).toLowerCase()) return;

  const eventKey = createHash("sha256").update(`${entryId}:${commentId}`).digest("hex");
  const { error: insertError } = await admin.from("instagram_webhook_events").insert({
    event_key: eventKey, user_id: connection.user_id, event_type: "comment", status: "received",
  });
  if (insertError) {
    // Treat every previously recorded comment as a duplicate. Retrying an event after
    // an ambiguous network failure could send the same public reply twice.
    const { data: prior, error: lookupError } = await admin
      .from("instagram_webhook_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (prior) return;
    console.error("[Instagram webhook] Could not claim event:", lookupError ? "event lookup failed" : "event insert failed");
    // Without a prior row this was not a duplicate; fail the webhook request so Meta can retry.
    throw new Error("Could not record the webhook event safely.");
  }

  try {
    const { data: settings, error: settingsError } = await admin.from("instagram_automation_settings")
      .select("enabled,mode,trigger_keyword,reply_instruction")
      .eq("user_id", connection.user_id).maybeSingle();
    if (settingsError) throw new Error("Automation settings could not be read.");
    if (!settings?.enabled) {
      await admin.from("instagram_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
      return;
    }
    const keyword = String(settings.trigger_keyword ?? "").trim();
    if (!keyword || !text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) {
      await admin.from("instagram_webhook_events").update({ status: "ignored_keyword", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
      return;
    }
    if (!(connection.scopes ?? []).includes("instagram_business_manage_comments")) {
      throw new Error("Comment-management permission is missing.");
    }
    const mode = settings.mode === "auto" ? "auto" : "draft";
    // Fail safely instead of disguising a canned template as an AI-generated reply.
    const reply = await draftReply(text, commenter, String(settings.reply_instruction ?? ""));

    if (mode === "auto") {
      // Auto-send is reached only for an enabled rule, only after a keyword match, and only after signature validation.
      await instagramApi(connection.user_id, `${commentId}/replies`, { message: reply }, "POST");
      await admin.from("activity_log").insert({
        user_id: connection.user_id,
        action: "automation.auto_reply",
        detail: `Auto-replied to @${commenter || "instagram-user"} comment ${commentId}: ${reply.slice(0, 250)}`,
        status: "success",
      });
      await admin.from("instagram_webhook_events").update({ status: "sent", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
    } else {
      const { error: draftError } = await admin.from("instagram_reply_drafts").upsert({
        user_id: connection.user_id,
        comment_id: commentId,
        media_id: mediaId,
        commenter_username: commenter,
        comment_text: text.slice(0, 2000),
        suggested_reply: reply,
        status: "pending",
      }, { onConflict: "user_id,comment_id", ignoreDuplicates: true });
      if (draftError) throw new Error("The reply could not be added to the review queue.");
      await admin.from("instagram_webhook_events").update({ status: "drafted", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Comment automation failed.";
    console.error("[Instagram webhook comment]", message);
    await admin.from("instagram_webhook_events").update({ status: "error", error_message: message, processed_at: new Date().toISOString() }).eq("event_key", eventKey);
  }
}

export const Route = createFileRoute("/api/public/instagram/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode") ?? "";
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "";
        if (mode === "subscribe" && expected && constantTimeStringEqual(token, expected) && challenge.length < 500) {
          return new Response(challenge, { status: 200, headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }) });
        }
        return new Response("Webhook verification failed.", { status: 403, headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }) });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 1_000_000) return Response.json({ error: "Payload too large." }, { status: 413, headers: noStoreHeaders() });
        if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
          return Response.json({ error: "Invalid webhook signature." }, { status: 401, headers: noStoreHeaders() });
        }
        let body: WebhookBody;
        try { body = JSON.parse(raw) as WebhookBody; } catch {
          return Response.json({ error: "Invalid JSON." }, { status: 400, headers: noStoreHeaders() });
        }
        if (body.object !== "instagram" || !Array.isArray(body.entry)) {
          return Response.json({ received: true }, { headers: noStoreHeaders() });
        }
        for (const entry of body.entry) {
          if (!entry || typeof entry.id !== "string" || !Array.isArray(entry.changes)) continue;
          for (const change of entry.changes) {
            if (change?.field !== "comments" || !change.value) continue;
            await processComment(entry.id, change.value);
          }
        }
        return Response.json({ received: true }, { headers: noStoreHeaders() });
      },
    },
  },
});
