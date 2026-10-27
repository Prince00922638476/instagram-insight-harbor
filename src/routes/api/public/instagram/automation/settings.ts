import { createFileRoute } from "@tanstack/react-router";
import { noStoreHeaders, readSession } from "@/lib/instagram.server";

const SETTINGS_FIELDS = "enabled,mode,trigger_keyword,reply_instruction,updated_at";
const DEFAULT_SETTINGS = {
  enabled: false,
  mode: "draft",
  trigger_keyword: "INFO",
  reply_instruction: "Write a short, helpful, friendly reply in the same language as the comment. Do not make promises, invent prices, or request personal information.",
};

export const Route = createFileRoute("/api/public/instagram/automation/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [{ data: saved, error }, { data: connection, error: connectionError }] = await Promise.all([
            supabaseAdmin.from("instagram_automation_settings").select(SETTINGS_FIELDS).eq("user_id", ownerId).maybeSingle(),
            supabaseAdmin.from("instagram_connections").select("status,scopes").eq("user_id", ownerId).maybeSingle(),
          ]);
          if (error || connectionError) throw new Error("Automation storage is unavailable. Apply migration 0002.");
          return Response.json({
            settings: saved ?? DEFAULT_SETTINGS,
            connected: connection?.status === "connected",
            commentPermission: (connection?.scopes ?? []).includes("instagram_business_manage_comments"),
            aiConfigured: Boolean(process.env["OPENAI_API_KEY"]),
            webhookConfigured: Boolean(process.env["META_WEBHOOK_VERIFY_TOKEN"] && process.env["META_APP_SECRET"]),
          }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[Automation settings GET]", error instanceof Error ? error.message : "Storage unavailable");
          return Response.json({ error: "Automation settings unavailable. Apply drizzle/migrations/0002_instagram_automation.sql and check Supabase secrets." }, { status: 503, headers: noStoreHeaders() });
        }
      },
      POST: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: Record<string, unknown>;
        try { input = await request.json() as Record<string, unknown>; } catch {
          return Response.json({ error: "Send valid JSON." }, { status: 400, headers: noStoreHeaders() });
        }
        const enabled = input["enabled"] === true;
        const mode = input["mode"] === "auto" ? "auto" : input["mode"] === "draft" ? "draft" : "";
        const keyword = typeof input["trigger_keyword"] === "string" ? input["trigger_keyword"].trim().slice(0, 80) : "";
        const instruction = typeof input["reply_instruction"] === "string" ? input["reply_instruction"].trim().slice(0, 600) : "";
        if (!mode) return Response.json({ error: "Choose draft or auto mode." }, { status: 400, headers: noStoreHeaders() });
        if (enabled && keyword.length < 2) return Response.json({ error: "Enabled automation requires a trigger keyword of at least 2 characters." }, { status: 400, headers: noStoreHeaders() });
        if (!keyword) return Response.json({ error: "A trigger keyword is required. Automatic replies will only run when a comment contains that keyword." }, { status: 400, headers: noStoreHeaders() });
        if (!instruction) return Response.json({ error: "Reply instructions cannot be empty." }, { status: 400, headers: noStoreHeaders() });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection, error: connectionError } = await supabaseAdmin.from("instagram_connections")
            .select("status,scopes").eq("user_id", ownerId).maybeSingle();
          if (connectionError || connection?.status !== "connected") {
            return Response.json({ error: "Connect a real Instagram professional account first." }, { status: 409, headers: noStoreHeaders() });
          }
          if (enabled && !(connection.scopes ?? []).includes("instagram_business_manage_comments")) {
            return Response.json({ error: "Reconnect Instagram and approve comment-management permission before enabling comment automation." }, { status: 403, headers: noStoreHeaders() });
          }
          if (enabled) {
            const missing: string[] = [];
            if (!process.env["OPENAI_API_KEY"]) missing.push("OPENAI_API_KEY");
            if (mode === "auto") {
              if (!process.env["META_WEBHOOK_VERIFY_TOKEN"]) missing.push("META_WEBHOOK_VERIFY_TOKEN");
              if (!process.env["META_APP_SECRET"]) missing.push("META_APP_SECRET");
            }
            if (missing.length) {
              const modeLabel = mode === "auto" ? "Auto-reply" : "AI draft mode";
              return Response.json({ error: `${modeLabel} is blocked until these server secrets are configured: ${missing.join(", ")}.` }, { status: 409, headers: noStoreHeaders() });
            }
          }
          const now = new Date().toISOString();
          const { data, error } = await supabaseAdmin.from("instagram_automation_settings").upsert({
            user_id: ownerId, enabled, mode, trigger_keyword: keyword,
            reply_instruction: instruction, updated_at: now,
          }, { onConflict: "user_id" }).select(SETTINGS_FIELDS).single();
          if (error || !data) throw new Error("Settings could not be saved.");
          return Response.json({ success: true, settings: data }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[Automation settings POST]", error instanceof Error ? error.message : "Storage unavailable");
          return Response.json({ error: "Could not save settings. Check Supabase connection and apply migration 0002." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
