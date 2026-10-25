import { createFileRoute } from "@tanstack/react-router";

// OAuth redirect target for Instagram API with Instagram Login.
// Exchanges the code server-side. The token never reaches the browser.
// Persistent encrypted token storage requires a backend database (see README).
export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (status: string) =>
          new Response(null, { status: 302, headers: { Location: `/connect?oauth=${status}` } });

        if (url.searchParams.get("error")) return back("denied");
        const code = url.searchParams.get("code");
        const appId = process.env["META_APP_ID"];
        const secret = process.env["META_APP_SECRET"];
        const redirect = process.env["META_REDIRECT_URI"];
        if (!code || !appId || !secret || !redirect) return back("misconfigured");

        try {
          const body = new URLSearchParams({
            client_id: appId,
            client_secret: secret,
            grant_type: "authorization_code",
            redirect_uri: redirect,
            code,
          });
          const res = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
          if (!res.ok) return back("exchange_failed");
          // TODO(storage): persist the token encrypted, keyed to the signed-in app user.
          return back("exchanged_not_stored");
        } catch {
          return back("exchange_failed");
        }
      },
    },
  },
});
