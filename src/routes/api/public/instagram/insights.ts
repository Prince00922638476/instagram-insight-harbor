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
        const asked = [...new Set((url.searchParams.get("metrics") ?? "reach,likes,comments,saved,shares,views,total_interactions").split(",").map(item => item.trim()).filter(item => allowed.has(item)))];
        if (!asked.length) return Response.json({ error: "No supported insights metric was requested." }, { status: 400, headers: noStoreHeaders() });
        try {
          // Instagram insight metrics vary by media type and API access. Requesting a
          // mixed set in one call can make every metric disappear when just one is
          // unsupported, so isolate each metric and return partial success.
          const settled = await Promise.all(asked.map(async metric => {
            try {
              const result = await instagramApi(sessionId, `${mediaId}/insights`, { metric });
              const rows = Array.isArray(result["data"]) ? result["data"] as Array<Record<string, unknown>> : [];
              return { metric, rows, error: null as string | null };
            } catch (error) {
              return { metric, rows: [] as Array<Record<string, unknown>>, error: error instanceof Error ? error.message.slice(0, 300) : "Metric unavailable." };
            }
          }));
          const data = settled.flatMap(item => item.rows);
          const unavailable = settled.filter(item => item.error).map(item => ({ metric: item.metric, reason: item.error }));
          return Response.json({ data, unavailable, partial: unavailable.length > 0, requested: asked }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Insights are not available for this media item.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
