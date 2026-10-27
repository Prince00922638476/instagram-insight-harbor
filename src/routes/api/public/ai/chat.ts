import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ProposedAction =
  | { action: "reply"; comment_id: string; message: string }
  | { action: "hide"; comment_id: string; hidden: boolean }
  | { action: "publish"; media_type: "IMAGE" | "REELS"; media_url: string; caption: string }
  | { action: "generate_image_post"; image_prompt: string; caption: string };

type ModelToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type ModelResponse = {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: ModelToolCall[] };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

const tools = [
  { type: "function", function: { name: "get_profile", description: "Read the connected Instagram professional profile.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "list_media", description: "Read recent media from the connected Instagram account.", parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false } } },
  { type: "function", function: { name: "list_comments", description: "Read comments on one of the connected account's media items.", parameters: { type: "object", properties: { media_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["media_id"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_reply_to_comment", description: "Prepare a public reply to an existing comment. This only creates a proposal; it does not send anything.", parameters: { type: "object", properties: { comment_id: { type: "string" }, message: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["comment_id", "message"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_hide_comment", description: "Prepare a hide/unhide action for an existing comment. This only creates a proposal; it does not execute it.", parameters: { type: "object", properties: { comment_id: { type: "string" }, hidden: { type: "boolean" } }, required: ["comment_id", "hidden"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_publish_media", description: "Prepare an Instagram image or Reel post using a publicly accessible HTTPS media URL. This only creates a proposal; it does not publish anything.", parameters: { type: "object", properties: { media_type: { type: "string", enum: ["IMAGE", "REELS"] }, media_url: { type: "string" }, caption: { type: "string", maxLength: 2200 } }, required: ["media_type", "media_url", "caption"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_generate_image_post", description: "Prepare a generated AI image post. This only creates a proposal; the server will not generate or publish the image until the owner confirms it.", parameters: { type: "object", properties: { image_prompt: { type: "string", minLength: 10, maxLength: 2500 }, caption: { type: "string", maxLength: 2200 } }, required: ["image_prompt", "caption"], additionalProperties: false } } },
];

const systemPrompt = `You are InstaBridge AI, an assistant inside the owner's Instagram management dashboard.
Be concise, practical, and reply in the language the owner uses.
You may use read-only Instagram tools to inspect the connected profile, recent media, and comments.
For a reply, hiding a comment, or publishing a post, prepare a proposal using the matching propose_* tool. NEVER claim you performed the action. The website will show the exact action and require the owner to press Confirm before it is sent to Instagram.
For publishing an existing media file, require a public HTTPS URL that Instagram can fetch. If the owner asks to generate a new image and publish it, use propose_generate_image_post with a clear visual prompt and caption. The actual image generation, upload, and publishing will only run after the owner confirms the proposal. Image generation may incur provider charges.
Do not ask for passwords, access tokens, API keys, or other secrets. If the Instagram account is not connected or a permission is missing, explain the required setup clearly.`;

function safeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

async function executeReadTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<{ result: unknown; action?: ProposedAction }> {
  if (name === "get_profile") {
    return { result: await instagramApi(sessionId, "me", { fields: "id,username,account_type,media_count" }) };
  }
  if (name === "list_media") {
    const n = typeof args["limit"] === "number" && Number.isInteger(args["limit"]) ? Math.max(1, Math.min(20, args["limit"])) : 10;
    const result = await instagramApi(sessionId, "me/media", {
      fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
      limit: String(n),
    });
    return { result };
  }
  if (name === "list_comments") {
    const mediaId = typeof args["media_id"] === "string" ? args["media_id"] : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaId)) throw new Error("A valid media ID is required to read comments.");
    const n = typeof args["limit"] === "number" && Number.isInteger(args["limit"]) ? Math.max(1, Math.min(30, args["limit"])) : 20;
    return { result: await instagramApi(sessionId, `${mediaId}/comments`, { fields: "id,text,username,timestamp", limit: String(n) }) };
  }
  if (name === "propose_reply_to_comment") {
    const id = typeof args["comment_id"] === "string" ? args["comment_id"] : "";
    const message = typeof args["message"] === "string" ? args["message"].trim() : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !message || message.length > 1000) throw new Error("The reply proposal needs a valid comment ID and a message of 1–1,000 characters.");
    return { result: { prepared: true, requires_owner_confirmation: true }, action: { action: "reply", comment_id: id, message } };
  }
  if (name === "propose_hide_comment") {
    const id = typeof args["comment_id"] === "string" ? args["comment_id"] : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof args["hidden"] !== "boolean") throw new Error("The hide proposal needs a valid comment ID and hidden=true/false.");
    return { result: { prepared: true, requires_owner_confirmation: true }, action: { action: "hide", comment_id: id, hidden: args["hidden"] } };
  }
  if (name === "propose_generate_image_post") {
    const prompt = typeof args["image_prompt"] === "string" ? args["image_prompt"].trim() : "";
    const caption = typeof args["caption"] === "string" ? args["caption"] : "";
    if (prompt.length < 10 || prompt.length > 2500 || caption.length > 2200) throw new Error("Image prompt must be 10–2,500 characters and caption at most 2,200 characters.");
    return { result: { prepared: true, requires_owner_confirmation: true, may_incur_image_generation_charges: true }, action: { action: "generate_image_post", image_prompt: prompt, caption } };
  }
  if (name === "propose_publish_media") {
    const type = args["media_type"];
    const url = args["media_url"];
    const caption = typeof args["caption"] === "string" ? args["caption"] : "";
    if ((type !== "IMAGE" && type !== "REELS") || !safeHttpsUrl(url) || caption.length > 2200) throw new Error("Publishing requires IMAGE or REELS, a public HTTPS media URL, and a caption up to 2,200 characters.");
    return { result: { prepared: true, requires_owner_confirmation: true }, action: { action: "publish", media_type: type, media_url: url, caption } };
  }
  throw new Error("Unknown AI tool.");
}

export const Route = createFileRoute("/api/public/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "पहले Connect पेज से Instagram account connect करें।" }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }

        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI chat चालू करने के लिए Cloudflare Worker में OPENAI_API_KEY secret सेट करें। API key को वेबसाइट या GitHub code में न रखें।" }, { status: 503, headers: noStoreHeaders() });

        // Bound the raw request before parsing JSON so a valid session cannot submit
        // an arbitrarily large body and consume memory before per-message limits apply.
        let rawBody: string;
        try { rawBody = await request.text(); } catch {
          return Response.json({ error: "Request body पढ़ा नहीं जा सका।" }, { status: 400, headers: noStoreHeaders() });
        }
        if (rawBody.length > 100_000) {
          return Response.json({ error: "Chat request बहुत बड़ा है। Messages छोटा करके फिर भेजें।" }, { status: 413, headers: noStoreHeaders() });
        }
        let body: { messages?: unknown };
        try { body = JSON.parse(rawBody) as { messages?: unknown }; } catch {
          return Response.json({ error: "Valid JSON messages भेजें।" }, { status: 400, headers: noStoreHeaders() });
        }
        if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
          return Response.json({ error: "एक बार में 1 से 20 chat messages भेजे जा सकते हैं।" }, { status: 400, headers: noStoreHeaders() });
        }
        const messages: ChatMessage[] = [];
        for (const item of body.messages) {
          if (!item || typeof item !== "object") continue;
          const row = item as Record<string, unknown>;
          if ((row["role"] !== "user" && row["role"] !== "assistant") || typeof row["content"] !== "string" || !row["content"].trim()) continue;
          messages.push({ role: row["role"], content: row["content"].slice(0, 4000) });
        }
        if (!messages.length || messages[messages.length - 1]?.role !== "user") {
          return Response.json({ error: "आखिरी message user का होना चाहिए।" }, { status: 400, headers: noStoreHeaders() });
        }

        let pendingAction: ProposedAction | null = null;
        const conversation: Array<Record<string, unknown>> = [
          { role: "system", content: systemPrompt },
          ...messages,
        ];
        const model = process.env["OPENAI_MODEL"] || "gpt-4.1-mini";

        try {
          let finalText = "";
          for (let turn = 0; turn < 4; turn++) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model, messages: conversation, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 1000 }),
              signal: AbortSignal.timeout(45000),
            });
            const result = await response.json().catch(() => ({})) as ModelResponse;
            if (!response.ok) {
              console.error("[AI chat] Provider request failed:", response.status);
              const status = response.status === 401 || response.status === 403 ? 503 : 502;
              return Response.json({ error: status === 503 ? "AI provider key rejected. Cloudflare secret OPENAI_API_KEY जाँचें।" : "AI provider से जवाब नहीं मिला। कुछ देर बाद फिर कोशिश करें।" }, { status, headers: noStoreHeaders() });
            }
            const assistant = result.choices?.[0]?.message;
            if (!assistant) throw new Error("AI provider returned an empty response.");
            conversation.push({ role: "assistant", content: assistant.content ?? null, ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}) });
            const calls = assistant.tool_calls ?? [];
            if (!calls.length) { finalText = assistant.content?.trim() ?? ""; break; }

            for (const call of calls) {
              let toolResult: unknown;
              try {
                const executed = await executeReadTool(sessionId, call.function.name, parseArguments(call.function.arguments));
                if (executed.action) {
                  if (pendingAction) {
                    // The UI confirms exactly one action per turn. Never tell the model that
                    // a second action is ready when it will not be shown to the owner.
                    toolResult = { error: "Only one Instagram action can be proposed per chat turn. The first action is pending owner confirmation; ask the owner to send another message for any additional action." };
                  } else {
                    pendingAction = executed.action;
                    toolResult = executed.result;
                  }
                } else {
                  toolResult = executed.result;
                }
              } catch (error) {
                toolResult = { error: error instanceof Error ? error.message : "Tool could not be completed." };
              }
              conversation.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult).slice(0, 12000) });
            }
          }
          if (!finalText) finalText = pendingAction
            ? "मैंने action तैयार कर दिया है। उसे Instagram पर भेजने से पहले नीचे exact details देखकर Confirm दबाएँ।"
            : "मुझे इस बार पूरा जवाब नहीं मिल पाया। कृपया एक बार फिर पूछें।";
          return Response.json({ message: finalText, action: pendingAction }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[AI chat]", error instanceof Error ? error.message : "Unexpected provider error");
          return Response.json({ error: "AI chat में समस्या आई। OPENAI_MODEL और OPENAI_API_KEY configuration जाँचकर फिर प्रयास करें।" }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
