import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

type ImageResponse = { data?: Array<{ b64_json?: string }> ; error?: { message?: string } };

export const Route = createFileRoute("/api/public/ai/image-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "पहले Instagram account connect करें।" }, { status: 401, headers: noStoreHeaders() });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return Response.json({ error: "Origin mismatch." }, { status: 403, headers: noStoreHeaders() });
        }
        let input: { prompt?: unknown; caption?: unknown; confirmed?: unknown };
        try { input = await request.json() as typeof input; } catch {
          return Response.json({ error: "Valid JSON भेजें।" }, { status: 400, headers: noStoreHeaders() });
        }
        if (input.confirmed !== true) return Response.json({ error: "Image generation और Instagram publishing से पहले explicit confirmation जरूरी है।" }, { status: 400, headers: noStoreHeaders() });
        const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
        const caption = typeof input.caption === "string" ? input.caption.trim() : "";
        if (prompt.length < 10 || prompt.length > 2500) return Response.json({ error: "Image prompt 10 से 2,500 characters का होना चाहिए।" }, { status: 400, headers: noStoreHeaders() });
        if (caption.length > 2200) return Response.json({ error: "Instagram caption अधिकतम 2,200 characters का हो सकता है।" }, { status: 400, headers: noStoreHeaders() });
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI image generation के लिए Cloudflare secret OPENAI_API_KEY सेट करें।" }, { status: 503, headers: noStoreHeaders() });

        let storagePath: string | null = null;
        let admin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"] | null = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          admin = supabaseAdmin;
          const { data: connection, error: connectionError } = await admin.from("instagram_connections")
            .select("ig_user_id,scopes,status").eq("user_id", sessionId).maybeSingle();
          if (connectionError || connection?.status !== "connected") {
            return Response.json({ error: "Instagram connected नहीं है। पहले Connect page से account connect करें।" }, { status: 409, headers: noStoreHeaders() });
          }
          if (!(connection.scopes ?? []).includes("instagram_business_content_publish")) {
            return Response.json({ error: "Content publishing permission missing है। Instagram reconnect करके publish permission approve करें।" }, { status: 403, headers: noStoreHeaders() });
          }

          const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: process.env["OPENAI_IMAGE_MODEL"] || "gpt-image-2.5-sunburst",
              prompt,
              size: "1024x1024",
              quality: "low",
              n: 1,
              output_format: "png",
            }),
            signal: AbortSignal.timeout(90000),
          });
          const imageResult = await imageResponse.json().catch(() => ({})) as ImageResponse;
          if (!imageResponse.ok) {
            console.error("[AI image] Provider rejected generation:", imageResponse.status);
            return Response.json({ error: "AI image generation असफल हुई। API key, model access और provider billing/configuration जाँचें।" }, { status: 502, headers: noStoreHeaders() });
          }
          const encoded = imageResult.data?.[0]?.b64_json;
          if (!encoded || encoded.length > 14_000_000) throw new Error("AI provider did not return a usable image.");

          const bucket = "instagram-generated";
          const { error: bucketError } = await admin.storage.getBucket(bucket);
          if (bucketError) {
            const { error: createBucketError } = await admin.storage.createBucket(bucket, {
              public: true,
              allowedMimeTypes: ["image/png"],
              fileSizeLimit: "10MB",
            });
            if (createBucketError) {
              const { error: verifyBucketError } = await admin.storage.getBucket(bucket);
              if (verifyBucketError) throw new Error("Could not create the public image bucket. Create Supabase Storage bucket 'instagram-generated' with public read access and PNG allowed.");
            }
          }

          const bytes = Buffer.from(encoded, "base64");
          if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Generated image is larger than the 10 MB upload limit.");
          storagePath = `${sessionId}/${randomUUID()}.png`;
          const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, bytes, {
            contentType: "image/png",
            cacheControl: "86400",
            upsert: false,
          });
          if (uploadError) throw new Error("Generated image could not be uploaded to Supabase Storage.");
          const { data: publicData } = admin.storage.from(bucket).getPublicUrl(storagePath);
          const mediaUrl = publicData.publicUrl;
          if (!mediaUrl.startsWith("https://")) throw new Error("Storage did not provide a public HTTPS URL.");

          const container = await instagramApi(sessionId, `${connection.ig_user_id}/media`, { image_url: mediaUrl, caption }, "POST");
          const containerId = typeof container.id === "string" ? container.id : "";
          if (!containerId) throw new Error("Instagram did not return a media container ID.");
          const published = await instagramApi(sessionId, `${connection.ig_user_id}/media_publish`, { creation_id: containerId }, "POST");
          const mediaId = typeof published.id === "string" ? published.id : "";
          await admin.from("activity_log").insert({
            user_id: sessionId,
            action: "ai.image_publish",
            detail: `Generated and published image ${mediaId || containerId}: ${caption.slice(0, 250)}`,
            status: "success",
          });
          return Response.json({ success: true, media_id: mediaId || containerId, media_url: mediaUrl }, { headers: noStoreHeaders() });
        } catch (error) {
          if (storagePath && admin) {
            try { await admin.storage.from("instagram-generated").remove([storagePath]); } catch { /* best effort cleanup */ }
          }
          console.error("[AI image publish]", error instanceof Error ? error.message : "Unexpected error");
          return Response.json({ error: error instanceof Error ? error.message : "Image generation or publishing failed. Check setup and try again." }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
