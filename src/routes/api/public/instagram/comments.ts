import { createFileRoute } from "@tanstack/react-router";
import { instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/instagram/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        const url = new URL(request.url);
        const mediaId = url.searchParams.get("media_id");
        if (!mediaId || !/^[A-Za-z0-9_.-]{1,128}$/.test(mediaId)) {
          return Response.json({ error: "A valid media_id is required." }, { status: 400, headers: noStoreHeaders() });
        }
        try {
          const result = await instagramApi(sessionId, `${mediaId}/comments`, { fields: "id,text,username,timestamp", limit: "100" });
          return Response.json({ data: Array.isArray(result["data"]) ? result["data"] : [], paging: result["paging"] ?? null }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Comments could not be loaded.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
