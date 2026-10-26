import { createFileRoute } from "@tanstack/react-router";
import { randomBytes, randomUUID } from "node:crypto";
import { hashApiKey, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/mcp-keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ keys: [] }, { headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.from("mcp_api_keys")
            .select("id,name,key_prefix,created_at,last_used_at,revoked_at,expires_at")
            .eq("user_id", ownerId).order("created_at", { ascending: false });
          if (error) throw error;
          return Response.json({ keys: data ?? [] }, { headers: noStoreHeaders() });
        } catch {
          return Response.json({ error: "Key storage is not available." }, { status: 503, headers: noStoreHeaders() });
        }
      },
      POST: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect to Instagram first." }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: { name?: unknown };
        try { input = await request.json() as { name?: unknown }; } catch {
          return Response.json({ error: "Send a valid JSON body." }, { status: 400, headers: noStoreHeaders() });
        }
        const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "AI assistant";
        if (!name) return Response.json({ error: "Key name is required." }, { status: 400, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection, error: connectionError } = await supabaseAdmin.from("instagram_connections").select("status").eq("user_id", ownerId).eq("status", "connected").maybeSingle();
          if (connectionError || !connection) return Response.json({ error: "Connect a real Instagram account before creating an MCP key." }, { status: 409, headers: noStoreHeaders() });
          const { count, error: countError } = await supabaseAdmin.from("mcp_api_keys")
            .select("id", { count: "exact", head: true }).eq("user_id", ownerId).is("revoked_at", null).gt("expires_at", new Date().toISOString());
          if (countError) throw countError;
          if ((count ?? 0) >= 5) return Response.json({ error: "Revoke an old key before creating another. Limit: 5 active keys." }, { status: 429, headers: noStoreHeaders() });
          const key = "ib_mcp_" + randomBytes(32).toString("base64url");
          const id = randomUUID();
          const { error } = await supabaseAdmin.from("mcp_api_keys").insert({
            id, user_id: ownerId, name, key_hash: hashApiKey(key), key_prefix: key.slice(0, 14), expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          });
          if (error) throw error;
          // The clear key is returned once only; only its hash is persisted.
          return Response.json({ id, name, key }, { status: 201, headers: noStoreHeaders() });
        } catch (error) {
          console.error("[MCP key create]", error instanceof Error ? error.message : "Key storage unavailable");
          return Response.json({ error: "Could not create an API key. Check the database migration." }, { status: 503, headers: noStoreHeaders() });
        }
      },
      DELETE: async ({ request }) => {
        const ownerId = readSession(request);
        if (!ownerId) return Response.json({ error: "Connect to Instagram first." }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: { id?: unknown };
        try { input = await request.json() as { id?: unknown }; } catch {
          return Response.json({ error: "Send a valid JSON body." }, { status: 400, headers: noStoreHeaders() });
        }
        if (typeof input.id !== "string") return Response.json({ error: "Key id is required." }, { status: 400, headers: noStoreHeaders() });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("mcp_api_keys").update({ revoked_at: new Date().toISOString() })
            .eq("id", input.id).eq("user_id", ownerId).is("revoked_at", null);
          if (error) throw error;
          return Response.json({ revoked: true }, { headers: noStoreHeaders() });
        } catch {
          return Response.json({ error: "Could not revoke this key." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
