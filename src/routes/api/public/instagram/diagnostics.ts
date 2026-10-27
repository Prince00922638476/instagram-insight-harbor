import { createFileRoute } from "@tanstack/react-router";
import { InstagramApiError, instagramApi, noStoreHeaders, readSession } from "@/lib/instagram.server";

type Check = { id: string; label: string; status: "ok" | "warn" | "blocked" | "error"; detail: string; nextStep: string; apiCode?: number; httpStatus?: number };

function describeError(error: unknown) {
  if (error instanceof InstagramApiError) return error.toSafeJSON();
  return { message: error instanceof Error ? error.message.slice(0, 400) : "Unknown error" };
}

function recovery(message: string, code?: number): string {
  if (code === 190 || /token.*expired|invalid.*token/i.test(message)) return "Open Connect Instagram and reconnect the account. Never paste tokens into chat.";
  if (code === 10 || code === 200 || /permission|access denied/i.test(message)) return "Check requested Instagram permissions and Meta app review / access level, then reconnect.";
  if (code === 4 || code === 17 || /rate limit|too many calls/i.test(message)) return "Wait a little and refresh once; avoid repeated requests.";
  if (code === 100 || /unsupported get request|invalid.*field/i.test(message)) return "This endpoint or field may not be available for this account, media type, or Instagram Login configuration.";
  return "Check the exact API message, connection permissions, account type, and setup; then refresh once.";
}

export const Route = createFileRoute("/api/public/instagram/diagnostics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId = readSession(request);
        if (!sessionId) return Response.json({ connected: false, checks: [], error: "Connect Instagram first." }, { status: 401, headers: noStoreHeaders() });
        const checks: Check[] = [];
        const fail = (id: string, label: string, error: unknown): Check => {
          const info = describeError(error);
          return {
            id, label, status: "error",
            detail: info.message + (("code" in info && typeof info.code === "number") ? ` (Meta code ${info.code})` : ""),
            nextStep: recovery(info.message, "code" in info && typeof info.code === "number" ? info.code : undefined),
            ...(("code" in info && typeof info.code === "number") ? { apiCode: info.code } : {}),
            ...(("httpStatus" in info && typeof info.httpStatus === "number") ? { httpStatus: info.httpStatus } : {}),
          };
        };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection, error } = await supabaseAdmin.from("instagram_connections")
            .select("ig_user_id,username,account_type,scopes,status,token_expires_at,updated_at")
            .eq("user_id", sessionId).maybeSingle();
          if (error) throw new Error("Could not read the Instagram connection record.");
          if (!connection || connection.status !== "connected") {
            return Response.json({ connected: false, checks: [{ id: "connection", label: "Instagram connection", status: "blocked", detail: "No connected Instagram account was found for this browser session.", nextStep: "Open Connect Instagram and complete authorization." }] }, { headers: noStoreHeaders() });
          }

          const scopes: string[] = Array.isArray(connection.scopes) ? connection.scopes : [];
          checks.push({ id: "connection", label: "Instagram connection", status: "ok", detail: `Connected as @${connection.username || "Instagram account"} (${connection.account_type || "account type unknown"}).`, nextStep: "No action needed." });
          const expiry = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
          const daysLeft = expiry > 0 ? Math.floor((expiry - Date.now()) / 86400000) : null;
          checks.push({
            id: "token", label: "Access token expiry",
            status: daysLeft !== null && daysLeft < 7 ? "warn" : "ok",
            detail: daysLeft === null ? "No expiry date is stored." : daysLeft < 0 ? "Stored token expiry has passed." : `Stored expiry is about ${daysLeft} day(s) away.`,
            nextStep: daysLeft !== null && daysLeft < 7 ? "Refresh or reconnect before the token expires." : "No immediate action indicated.",
          });

          for (const [scope, label] of [
            ["instagram_business_basic", "Profile and media permission"],
            ["instagram_business_manage_insights", "Insights permission"],
            ["instagram_business_manage_comments", "Comment-management permission"],
            ["instagram_business_content_publish", "Publishing permission"],
          ] as const) {
            const granted = scopes.includes(scope);
            checks.push({ id: scope, label, status: granted ? "ok" : "blocked", detail: granted ? "Permission was recorded at connection." : "Permission was not recorded.", nextStep: granted ? "No action needed." : "Select this permission on Connect Instagram and reconnect. Meta review/access may also be required." });
          }

          let media: Array<Record<string, unknown>> = [];
          try {
            const profile = await instagramApi(sessionId, "me", { fields: "id,username,account_type,media_count" });
            checks.push({ id: "profile", label: "Profile endpoint", status: "ok", detail: `Profile endpoint responded for @${String(profile["username"] ?? connection.username ?? "account")}.`, nextStep: "No action needed." });
          } catch (error) { checks.push(fail("profile", "Profile endpoint", error)); }

          try {
            let result: Record<string, unknown>;
            try {
              result = await instagramApi(sessionId, "me/media", { fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count", limit: "3" });
            } catch {
              result = await instagramApi(sessionId, "me/media", { fields: "id,caption,media_type,timestamp,permalink", limit: "3" });
            }
            media = Array.isArray(result["data"]) ? result["data"] as Array<Record<string, unknown>> : [];
            checks.push({ id: "media", label: "Posts and Reels endpoint", status: media.length ? "ok" : "warn", detail: media.length ? `Returned ${media.length} recent item(s).` : "Request succeeded but no media rows were returned.", nextStep: media.length ? "Older items may require loading the next page in Content." : "Check that the connected account has published media and basic permission." });
          } catch (error) { checks.push(fail("media", "Posts and Reels endpoint", error)); }

          try {
            const stories = await instagramApi(sessionId, `${connection.ig_user_id}/stories`, { fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp", limit: "5" });
            const storyRows = Array.isArray(stories["data"]) ? stories["data"] : [];
            checks.push({ id: "stories", label: "Active Stories listing", status: storyRows.length ? "ok" : "warn", detail: storyRows.length ? `Returned ${storyRows.length} active story item(s).` : "Endpoint responded but no active Stories were returned.", nextStep: "Stories are temporary; confirm a Story is currently active and check account eligibility." });
          } catch (error) {
            const info = describeError(error);
            checks.push({ id: "stories", label: "Active Stories listing", status: "blocked", detail: info.message + (("code" in info && typeof info.code === "number") ? ` (Meta code ${info.code})` : ""), nextStep: "This app uses Instagram Login. Some Stories listing operations are not available in every login configuration. Check this exact Meta error before changing auth flow or account type.", ...(("code" in info && typeof info.code === "number") ? { apiCode: info.code } : {}) });
          }

          if (media[0]?.["id"]) {
            try {
              const insight = await instagramApi(sessionId, `${String(media[0]["id"])}/insights`, { metric: "reach" });
              const rows = Array.isArray(insight["data"]) ? insight["data"] : [];
              checks.push({ id: "insights", label: "Media insights endpoint", status: rows.length ? "ok" : "warn", detail: rows.length ? "At least one insights metric was returned." : "Endpoint returned no metric rows for the newest item.", nextStep: "Metric availability varies by media type; Content now separates unavailable metrics from available ones." });
            } catch (error) { checks.push(fail("insights", "Media insights endpoint", error)); }
          } else {
            checks.push({ id: "insights", label: "Media insights endpoint", status: "warn", detail: "No media item was available for the test request.", nextStep: "Select an eligible media item and refresh diagnostics." });
          }

          checks.push({ id: "hashtags", label: "Live hashtag search", status: "blocked", detail: "Live hashtag search is not available through this app's Instagram Login configuration.", nextStep: "AI Chat can suggest relevant hashtags, but they are not live/trending search results. Live hashtag discovery requires a different Meta login configuration, linked Facebook Page, permissions and potentially app review." });
          return Response.json({ connected: true, account: { username: connection.username, accountType: connection.account_type, scopes, tokenExpiresAt: connection.token_expires_at, updatedAt: connection.updated_at }, checks, checkedAt: new Date().toISOString() }, { headers: noStoreHeaders() });
        } catch (error) {
          console.error("[Instagram diagnostics]", error instanceof Error ? error.message : "Diagnostic check failed");
          return Response.json({ connected: true, checks, error: error instanceof Error ? error.message : "Diagnostics failed." }, { status: 503, headers: noStoreHeaders() });
        }
      },
    },
  },
});
