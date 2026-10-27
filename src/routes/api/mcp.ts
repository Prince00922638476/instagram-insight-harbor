import { createFileRoute } from "@tanstack/react-router";
import { hashApiKey, instagramApi, noStoreHeaders } from "@/lib/instagram.server";

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type ApiKeyRow = { id: string; user_id: string; revoked_at: string | null; expires_at: string };

const tools = [
  { name: "get_profile", description: "Read the connected Instagram professional account profile.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_media", description: "List recent posts and reels from the connected account.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, description: "Number of media items, 1–50 (default 20)." } }, additionalProperties: false } },
  { name: "get_media_insights", description: "Read metrics available for a media item. Requires Meta insights permission and an eligible account/media type.", inputSchema: { type: "object", required: ["media_id"], properties: { media_id: { type: "string" }, metrics: { type: "array", items: { type: "string", enum: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "accounts_engaged"] } } }, additionalProperties: false } },
  { name: "list_comments", description: "Read comments for one of the account's media items.", inputSchema: { type: "object", required: ["media_id"], properties: { media_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "reply_to_comment", description: "Publish a public reply to an Instagram comment. Must include confirmed=true after the user explicitly approves the exact reply.", inputSchema: { type: "object", required: ["comment_id", "message", "confirmed"], properties: { comment_id: { type: "string" }, message: { type: "string", maxLength: 1000 }, confirmed: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "hide_comment", description: "Hide an Instagram comment. Must include confirmed=true after the user explicitly approves this action.", inputSchema: { type: "object", required: ["comment_id", "confirmed"], properties: { comment_id: { type: "string" }, confirmed: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "publish_media", description: "Publish a public HTTPS image or reel URL to Instagram. This is public and irreversible in the moment; must include confirmed=true after the user approves the exact URL and caption.", inputSchema: { type: "object", required: ["media_type", "media_url", "caption", "confirmed"], properties: { media_type: { type: "string", enum: ["IMAGE", "REELS"] }, media_url: { type: "string", maxLength: 2000 }, caption: { type: "string", maxLength: 2200 }, confirmed: { type: "boolean", const: true } }, additionalProperties: false } },
];

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: noStoreHeaders() });
}
function rpcResult(id: RpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: noStoreHeaders() });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function textResult(data: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) };
}
function positiveInt(value: unknown, fallback: number, max: number) {
  const n = typeof value === "number" && Number.isInteger(value) ? value : fallback;
  return Math.min(max, Math.max(1, n));
}
function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
          return new Response("Content-Type must be application/json", { status: 415, headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }) });
        }
        const auth = request.headers.get("authorization") ?? "";
        const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!/^ib_mcp_[A-Za-z0-9_-]{40,}$/.test(suppliedKey)) return new Response("Unauthorized", { status: 401, headers: noStoreHeaders({ "WWW-Authenticate": "Bearer" }) });
        let rawBody: string;
        try { rawBody = await request.text(); } catch { return rpcError(null, -32700, "Could not read request body."); }
        if (rawBody.length > 64_000) return new Response("Request body too large.", { status: 413, headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }) });
        let rpc: RpcRequest;
        try { rpc = JSON.parse(rawBody) as RpcRequest; } catch { return rpcError(null, -32700, "Parse error."); }
        if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return rpcError(rpc.id, -32600, "Invalid JSON-RPC request.");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: key, error: keyError } = await supabaseAdmin.from("mcp_api_keys")
            .select("id,user_id,revoked_at,expires_at").eq("key_hash", hashApiKey(suppliedKey)).maybeSingle();
          if (keyError || !key || key.revoked_at || new Date(key.expires_at).getTime() <= Date.now()) return new Response("Unauthorized", { status: 401, headers: noStoreHeaders({ "WWW-Authenticate": "Bearer" }) });
          const apiKey = key as ApiKeyRow;
          await supabaseAdmin.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
          const id = rpc.id ?? null;
          const params = isRecord(rpc.params) ? rpc.params : {};
          if (rpc.method === "notifications/initialized" || rpc.method === "notifications/cancelled") {
            return new Response(null, { status: 202, headers: noStoreHeaders() });
          }
          if (rpc.method === "initialize") {
            return rpcResult(id, {
              protocolVersion: typeof params["protocolVersion"] === "string" && ["2025-06-18", "2025-03-26", "2024-11-05"].includes(params["protocolVersion"]) ? params["protocolVersion"] : "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "instagram-insight-harbor", version: "1.0.0" },
              instructions: "Write tools require confirmed=true. Only confirm a write after the user reviews the exact action.",
            });
          }
          if (rpc.method === "ping") return rpcResult(id, {});
          if (rpc.method === "tools/list") return rpcResult(id, { tools });
          if (rpc.method !== "tools/call") return rpcError(id, -32601, "Method not found.");
          const toolName = params["name"];
          const args = isRecord(params["arguments"]) ? params["arguments"] : {};
          const write = async (action: string, detail: string) => {
            const { error } = await supabaseAdmin.from("activity_log").insert({ user_id: apiKey.user_id, action, detail: detail.slice(0, 1000), status: "success" });
            if (error) console.error("[MCP activity log] Unable to record action.");
          };
          try {
            let result: unknown;
            if (toolName === "get_profile") {
              result = await instagramApi(apiKey.user_id, "me", { fields: "user_id,username,account_type,media_count" });
            } else if (toolName === "list_media") {
              result = await instagramApi(apiKey.user_id, "me/media", {
                fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                limit: String(positiveInt(args["limit"], 20, 50)),
              });
            } else if (toolName === "get_media_insights") {
              if (typeof args["media_id"] !== "string" || !args["media_id"].trim()) throw new Error("media_id is required.");
              const allow = new Set(["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "accounts_engaged"]);
              const requested = Array.isArray(args["metrics"]) ? args["metrics"].filter((v): v is string => typeof v === "string" && allow.has(v)) : ["reach", "likes", "comments", "saved", "shares"];
              if (!requested.length) throw new Error("Choose at least one supported metric.");
              result = await instagramApi(apiKey.user_id, `${args["media_id"]}/insights`, { metric: [...new Set(requested)].join(",") });
            } else if (toolName === "list_comments") {
              if (typeof args["media_id"] !== "string" || !args["media_id"].trim()) throw new Error("media_id is required.");
              result = await instagramApi(apiKey.user_id, `${args["media_id"]}/comments`, { fields: "id,text,username,timestamp", limit: String(positiveInt(args["limit"], 50, 100)) });
            } else if (toolName === "reply_to_comment") {
              if (args["confirmed"] !== true) throw new Error("Action not executed. Obtain the user's approval for this exact reply, then pass confirmed=true.");
              if (typeof args["comment_id"] !== "string" || !args["comment_id"].trim()) throw new Error("comment_id is required.");
              if (typeof args["message"] !== "string" || !args["message"].trim() || args["message"].length > 1000) throw new Error("message must be 1–1000 characters.");
              result = await instagramApi(apiKey.user_id, `${args["comment_id"]}/replies`, { message: args["message"].trim() }, "POST");
              await write("comment.reply", `Comment ${args["comment_id"]}: ${args["message"].trim()}`);
            } else if (toolName === "hide_comment") {
              if (args["confirmed"] !== true) throw new Error("Action not executed. Obtain the user's approval, then pass confirmed=true.");
              if (typeof args["comment_id"] !== "string" || !args["comment_id"].trim()) throw new Error("comment_id is required.");
              result = await instagramApi(apiKey.user_id, String(args["comment_id"]), { hide: "true" }, "POST");
              await write("comment.hide", `Comment ${args["comment_id"]}`);
            } else if (toolName === "publish_media") {
              if (args["confirmed"] !== true) throw new Error("Action not executed. The user must approve this exact public post, URL and caption; then pass confirmed=true.");
              const mediaUrl = safeHttpsUrl(args["media_url"]);
              if (!mediaUrl) throw new Error("media_url must be a valid public HTTPS URL.");
              if (args["media_type"] !== "IMAGE" && args["media_type"] !== "REELS") throw new Error("media_type must be IMAGE or REELS.");
              const caption = typeof args["caption"] === "string" ? args["caption"] : "";
              if (caption.length > 2200) throw new Error("caption must be at most 2,200 characters.");
              const { data: connection, error: connectionError } = await supabaseAdmin.from("instagram_connections")
                .select("ig_user_id").eq("user_id", apiKey.user_id).eq("status", "connected").maybeSingle();
              if (connectionError || !connection?.ig_user_id) throw new Error("Instagram account details are unavailable. Reconnect the account.");
              const containerParams: Record<string, string> = { caption };
              if (args["media_type"] === "IMAGE") containerParams["image_url"] = mediaUrl;
              else { containerParams["video_url"] = mediaUrl; containerParams["media_type"] = "REELS"; }
              const container = await instagramApi(apiKey.user_id, `${connection.ig_user_id}/media`, containerParams, "POST");
              const containerId = typeof container["id"] === "string" ? container["id"] : "";
              if (!containerId) throw new Error("Instagram did not return a media container ID.");
              if (args["media_type"] === "REELS") {
                let finished = false;
                for (let i = 0; i < 8; i++) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  const status = await instagramApi(apiKey.user_id, containerId, { fields: "status_code" });
                  if (status["status_code"] === "FINISHED") { finished = true; break; }
                  if (status["status_code"] === "ERROR" || status["status_code"] === "EXPIRED") throw new Error("Instagram could not process this reel URL.");
                }
                if (!finished) throw new Error("Instagram is still processing this reel. Check the media container before retrying.");
              }
              result = await instagramApi(apiKey.user_id, `${connection.ig_user_id}/media_publish`, { creation_id: containerId }, "POST");
              await write("media.publish", `${args["media_type"]}: ${mediaUrl} — ${caption.slice(0, 300)}`);
            } else {
              return rpcResult(id, textResult({ error: `Unknown tool: ${String(toolName)}` }, true));
            }
            return rpcResult(id, textResult(result));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Instagram action failed.";
            return rpcResult(id, textResult({ error: message }, true));
          }
        } catch (error) {
          console.error("[MCP request]", error instanceof Error ? error.message : "Unexpected error");
          return rpcError(rpc.id, -32603, "MCP service is unavailable. Check server configuration.");
        }
      },
    },
  },
});
