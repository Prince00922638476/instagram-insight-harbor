import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

const allowed = new Set(["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "accounts_engaged"]);

export const Route = createFileRoute("/api/public/instagram/insights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        const url = new URL(request.url);
        const mediaId = url.searchParams.get("media_id");
        if (!mediaId || !/^[A-Za-z0-9_.-]{1,128}$/.test(mediaId)) return Response.json({ error: "A valid media_id is required." }, { status: 400, headers: noStoreHeaders() });
        const asked = (url.searchParams.get("metrics") ?? "reach,likes,comments,saved,shares").split(",").filter(item => allowed.has(item));
        if (!asked.length) return Response.json({ error: "No supported insights metric was requested." }, { status: 400, headers: noStoreHeaders() });
        try {
          const result = await instagramApi(sessionId, `${mediaId}/insights`, { metric: [...new Set(asked)].join(",") });
          return Response.json({ data: Array.isArray(result.data) ? result.data : [] }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Insights are not available for this media item.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
