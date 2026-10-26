import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/instagram/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        try {
          const url = new URL(request.url);
          const limitRaw = Number(url.searchParams.get("limit") ?? "30");
          const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 30;
          const result = await instagramApi(sessionId, "me/media", {
            fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
            limit: String(limit),
          });
          return Response.json({ data: Array.isArray(result.data) ? result.data : [], paging: result.paging ?? null }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Instagram media could not be loaded.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
