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
          const after = url.searchParams.get("after")?.trim() ?? "";
          if (after.length > 500 || /[\r\n]/.test(after)) {
            return Response.json({ error: "Invalid pagination cursor. Refresh the media list and try again." }, { status: 400, headers: noStoreHeaders() });
          }
          const pagingParams = { limit: String(limit), ...(after ? { after } : {}) };
          const fields = [
            "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
            "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
            "id,caption,media_type,timestamp,permalink",
          ];
          let result: Record<string, unknown> | null = null;
          let lastError: unknown = null;
          for (const fieldSet of fields) {
            try {
              result = await instagramApi(sessionId, "me/media", { fields: fieldSet, ...pagingParams });
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (!result) throw lastError instanceof Error ? lastError : new Error("Instagram media could not be loaded.");
          const paging = result["paging"] && typeof result["paging"] === "object" ? result["paging"] as Record<string, unknown> : null;
          const cursors = paging?.["cursors"] && typeof paging["cursors"] === "object" ? paging["cursors"] as Record<string, unknown> : null;
          return Response.json({
            data: Array.isArray(result["data"]) ? result["data"] : [],
            paging: paging ? { cursors: cursors ? { after: typeof cursors["after"] === "string" ? cursors["after"] : null } : null, next: typeof paging["next"] === "string" ? Boolean(paging["next"]) : false } : null,
          }, { headers: noStoreHeaders() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Instagram media could not be loaded.";
          return Response.json({ error: message }, { status: 502, headers: noStoreHeaders() });
        }
      },
    },
  },
});
