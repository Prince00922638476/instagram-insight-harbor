import { createFileRoute } from "@tanstack/react-router";
import { encryptToken, noStoreHeaders, readSession } from "@/lib/instagram.server";

export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string) => new Response(null, {
          status: 302,
          headers: noStoreHeaders({ Location: `/connect?oauth=${encodeURIComponent(status)}` }),
        });

        if (url.searchParams.get("error")) return back("denied");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const appId = process.env["META_APP_ID"];
        const secret = process.env["META_APP_SECRET"];
        const redirectUri = process.env["META_REDIRECT_URI"];
        const ownerId = readSession(request);
        if (!code || !state || !appId || !secret || !redirectUri || !ownerId) {
          return back(!appId || !secret || !redirectUri ? "misconfigured" : "invalid_state");
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: savedState, error: stateError } = await supabaseAdmin
            .from("oauth_states")
            .select("state,user_id,scopes,created_at")
            .eq("state", state)
            .maybeSingle();
          if (stateError || !savedState) return back("invalid_state");

          // Consume state before making outbound calls: it may be used only once.
          const { error: deleteStateError } = await supabaseAdmin.from("oauth_states").delete().eq("state", state);
          if (deleteStateError) return back("storage_failed");
          const createdAt = new Date(savedState.created_at).getTime();
          if (savedState.user_id !== ownerId || !Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000 || createdAt > Date.now() + 30_000) {
            return back("invalid_state");
          }

          const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: appId,
              client_secret: secret,
              grant_type: "authorization_code",
              redirect_uri: redirectUri,
              code,
            }),
            signal: AbortSignal.timeout(15000),
          });
          const shortData = await shortResponse.json().catch(() => ({})) as { access_token?: string; user_id?: string | number; error_message?: string };
          if (!shortResponse.ok || !shortData.access_token) return back("exchange_failed");

          const longUrl = new URL("https://graph.instagram.com/access_token");
          longUrl.searchParams.set("grant_type", "ig_exchange_token");
          longUrl.searchParams.set("client_secret", secret);
          longUrl.searchParams.set("access_token", shortData.access_token);
          const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(15000) });
          const longData = await longResponse.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: { message?: string } };
          if (!longResponse.ok || !longData.access_token) {
            console.error("[Instagram OAuth] Long-lived token exchange failed.");
            return back("exchange_failed");
          }

          const meUrl = new URL("https://graph.instagram.com/v25.0/me");
          meUrl.searchParams.set("fields", "user_id,username,account_type");
          meUrl.searchParams.set("access_token", longData.access_token);
          const meResponse = await fetch(meUrl, { signal: AbortSignal.timeout(15000) });
          const profile = await meResponse.json().catch(() => ({})) as {
            id?: string | number; user_id?: string | number; username?: string;
            account_type?: string; error?: { message?: string };
          };
          if (!meResponse.ok || profile.error || !(profile.user_id ?? profile.id ?? shortData.user_id)) {
            console.error("[Instagram OAuth] Profile lookup failed.");
            return back("profile_failed");
          }

          const now = new Date().toISOString();
          const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5_184_000) * 1000).toISOString();
          const resolvedUserId = String(profile.user_id ?? profile.id ?? shortData.user_id);
          const username = typeof profile.username === "string" ? profile.username : null;
          const scopes = Array.isArray(savedState.scopes) ? savedState.scopes : ["instagram_business_basic"];

          const { error: tokenError } = await supabaseAdmin.from("instagram_tokens").upsert({
            user_id: ownerId,
            access_token: encryptToken(longData.access_token),
            updated_at: now,
          });
          const { error: connectionError } = await supabaseAdmin.from("instagram_connections").upsert({
            user_id: ownerId,
            ig_user_id: resolvedUserId,
            username,
            account_type: typeof profile.account_type === "string" ? profile.account_type : null,
            scopes,
            token_expires_at: expiresAt,
            status: "connected",
            updated_at: now,
          });
          if (tokenError || connectionError) {
            // Never return a success redirect when only part of the connection was stored.
            await supabaseAdmin.from("instagram_tokens").delete().eq("user_id", ownerId);
            await supabaseAdmin.from("instagram_connections").delete().eq("user_id", ownerId);
            return back("storage_failed");
          }
          return back("connected");
        } catch (error) {
          console.error("[Instagram OAuth callback]", error instanceof Error ? error.message : "Unexpected error");
          return back("exchange_failed");
        }
      },
    },
  },
});
