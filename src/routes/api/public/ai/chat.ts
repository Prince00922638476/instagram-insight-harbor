import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readLimitedRequestBody, readSession } from "@/lib/instagram.server";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ProposedAction =
  | { action: "reply"; comment_id: string; message: string }
  | { action: "hide"; comment_id: string; hidden: boolean }
  | { action: "publish"; media_type: "IMAGE" | "REELS"; media_url: string; caption: string }
  | { action: "generate_image_post"; image_prompt: string; caption: string };

type GeminiFunctionCall = {
  name: string;
  args?: Record<string, unknown>;
  id?: string;
};
type GeminiPart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
};
type GeminiResponse = {
  candidates?: Array<{
    content?: { role?: string; parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string; code?: number };
};

/**
 * Keep this allowlist to models whose standard Gemini API tier is listed as free.
 * Fallback is model-level only; it never switches to a paid provider or paid model.
 */
const FREE_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
] as const;

const tools = [
  { type: "function", function: { name: "get_profile", description: "Read the connected Instagram professional profile.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "list_media", description: "Read recent media from the connected Instagram account.", parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false } } },
  { type: "function", function: { name: "list_comments", description: "Read comments on one of the connected account's media items.", parameters: { type: "object", properties: { media_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["media_id"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_reply_to_comment", description: "Prepare a public reply to an existing comment. This only creates a proposal; it does not send anything.", parameters: { type: "object", properties: { comment_id: { type: "string" }, message: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["comment_id", "message"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_hide_comment", description: "Prepare a hide/unhide action for an existing comment. This only creates a proposal; it does not execute it.", parameters: { type: "object", properties: { comment_id: { type: "string" }, hidden: { type: "boolean" } }, required: ["comment_id", "hidden"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_publish_media", description: "Prepare an Instagram image or Reel post using a publicly accessible HTTPS media URL. This only creates a proposal; it does not publish anything.", parameters: { type: "object", properties: { media_type: { type: "string", enum: ["IMAGE", "REELS"] }, media_url: { type: "string" }, caption: { type: "string", maxLength: 2200 } }, required: ["media_type", "media_url", "caption"], additionalProperties: false } } },
  { type: "function", function: { name: "propose_generate_image_post", description: "Prepare a generated AI image post. This only creates a proposal; the server will not generate or publish the image until the owner confirms it.", parameters: { type: "object", properties: { image_prompt: { type: "string", minLength: 10, maxLength: 2500 }, caption: { type: "string", maxLength: 2200 } }, required: ["image_prompt", "caption"], additionalProperties: false } } },
];

function toGeminiSchema(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const allowedKeys = new Set([
    "type", "description", "enum", "items", "minimum", "maximum",
    "properties", "required", "additionalProperties",
  ]);
  const schema = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(schema)) {
    if (!allowedKeys.has(key)) continue;
    if (key === "properties" && nested && typeof nested === "object" && !Array.isArray(nested)) {
      output[key] = Object.fromEntries(
        Object.entries(nested as Record<string, unknown>).map(([name, propertySchema]) => [name, toGeminiSchema(propertySchema)]),
      );
    } else if (key === "items") {
      output[key] = toGeminiSchema(nested);
    } else {
      output[key] = nested;
    }
  }

  return output;
}

const geminiFunctionDeclarations = tools.map((tool) => {
  const definition = tool.function as {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  return {
    name: definition.name,
    description: definition.description,
    parametersJsonSchema: toGeminiSchema(definition.parameters),
  };
});

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

function parseArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function executeReadTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<{ result: unknown; action?: ProposedAction }> {
  if (name === "get_profile") {
    return { result: await instagramApi(sessionId, "me", { fields: "user_id,username,account_type,media_count" }) };
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

        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI chat चालू करने के लिए Cloudflare Worker में GEMINI_API_KEY secret सेट करें। API key को वेबसाइट या GitHub code में न रखें।" }, { status: 503, headers: noStoreHeaders() });

        // Bound the raw request before parsing JSON so a valid session cannot submit
        // an arbitrarily large body and consume memory before per-message limits apply.
        const bodyRead = await readLimitedRequestBody(request, 100_000);
        if (!bodyRead.ok) {
          const tooLarge = bodyRead.reason === "too_large";
          return Response.json(
            { error: tooLarge ? "Chat request बहुत बड़ा है। Messages छोटा करके फिर भेजें।" : "Request body पढ़ा नहीं जा सका।" },
            { status: tooLarge ? 413 : 400, headers: noStoreHeaders() },
          );
        }
        const rawBody = bodyRead.text;
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
        const conversation: Array<Record<string, unknown>> = messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        }));
        const configuredModel = process.env["GEMINI_MODEL"]?.trim();
        const models: string[] = configuredModel && (FREE_GEMINI_MODELS as readonly string[]).includes(configuredModel)
          ? [configuredModel, ...FREE_GEMINI_MODELS.filter((candidate) => candidate !== configuredModel)]
          : [...FREE_GEMINI_MODELS];
        if (configuredModel && !models.includes(configuredModel)) {
          console.warn("[AI chat] Ignoring GEMINI_MODEL outside the free-model allowlist.");
        }
        let nextModelIndex = 0;

        try {
          let finalText = "";
          for (let turn = 0; turn < 4; turn++) {
            let result: GeminiResponse | null = null;
            let lastStatus = 502;
            let lastProviderError = "";

            while (nextModelIndex < models.length) {
              const model = models[nextModelIndex];
              const providerUrl = new URL(
                "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
              );
              let response: Response;
              try {
                response = await fetch(providerUrl, {
                  method: "POST",
                  headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: conversation,
                    tools: [{ functionDeclarations: geminiFunctionDeclarations }],
                    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
                    generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
                  }),
                  signal: AbortSignal.timeout(45000),
                });
              } catch (error) {
                lastStatus = 502;
                lastProviderError = error instanceof Error ? error.name : "network_error";
                console.error("[AI chat] Gemini model request failed", { model, status: lastStatus, reason: lastProviderError });
                nextModelIndex++;
                continue;
              }

              const candidateResult = await response.json().catch(() => ({})) as GeminiResponse;
              if (response.ok) {
                result = candidateResult;
                break;
              }

              lastStatus = response.status;
              lastProviderError = candidateResult.error?.status || candidateResult.error?.message || "provider_error";
              console.error("[AI chat] Gemini model request failed", {
                model,
                status: response.status,
                providerCode: candidateResult.error?.code,
                providerStatus: candidateResult.error?.status,
                providerMessage: candidateResult.error?.message?.slice(0, 240),
              });

              if (response.status === 401 || response.status === 403) {
                return Response.json(
                  { error: "Gemini API key या प्रोजेक्ट access में समस्या है। Cloudflare secret GEMINI_API_KEY और Google AI Studio में project status जाँचें।" },
                  { status: 503, headers: noStoreHeaders() },
                );
              }

              // Quotas and temporary/model-availability errors can differ by model.
              // Move to the next free model instead of failing the whole chat.
              if (response.status === 429 || response.status === 404 || response.status >= 500) {
                nextModelIndex++;
                continue;
              }

              return Response.json(
                { error: "AI अनुरोध अस्वीकार हुआ। Server logs में सुरक्षित provider error दर्ज है।" },
                { status: 502, headers: noStoreHeaders() },
              );
            }

            if (!result) {
              if (lastStatus === 429) {
                return Response.json(
                  { error: "सभी उपलब्ध free Gemini models की quota सीमा पूरी हो सकती है। थोड़ी देर बाद फिर कोशिश करें।" },
                  { status: 429, headers: noStoreHeaders() },
                );
              }
              console.error("[AI chat] All free Gemini models failed.", { status: lastStatus, reason: lastProviderError });
              return Response.json(
                { error: "सभी उपलब्ध free Gemini models अभी जवाब नहीं दे पाए। थोड़ी देर बाद फिर कोशिश करें।" },
                { status: 502, headers: noStoreHeaders() },
              );
            }

            const assistant = result.candidates?.[0]?.content;
            if (!assistant || !Array.isArray(assistant.parts)) {
              throw new Error("Gemini returned an empty response.");
            }
            conversation.push(assistant as unknown as Record<string, unknown>);

            const calls = assistant.parts
              .map((part) => part.functionCall)
              .filter((call): call is GeminiFunctionCall => Boolean(call?.name));
            if (!calls.length) {
              finalText = assistant.parts
                .filter((part) => typeof part.text === "string")
                .map((part) => part.text)
                .join("\n")
                .trim();
              break;
            }

            const functionResponseParts: Array<Record<string, unknown>> = [];
            for (const call of calls) {
              let toolResult: unknown;
              try {
                const executed = await executeReadTool(sessionId, call.name, parseArguments(call.args));
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
              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  response: { result: toolResult },
                  ...(call.id ? { id: call.id } : {}),
                },
              });
            }
            conversation.push({ role: "user", parts: functionResponseParts });
          }
          if (!finalText) finalText = pendingAction
            ? "मैंने action तैयार कर दिया है। उसे Instagram पर भेजने से पहले नीचे exact details देखकर Confirm दबाएँ।"
            : "मुझे इस बार पूरा जवाब नहीं मिल पाया। कृपया एक बार फिर पूछें।";
          return Response.json({ message: finalText, action: pendingAction }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[AI chat]", error instanceof Error ? error.message : "Unexpected provider error");
          return Response.json({ error: "AI chat में समस्या आई। GEMINI_MODEL और GEMINI_API_KEY configuration जाँचकर फिर प्रयास करें।" }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
