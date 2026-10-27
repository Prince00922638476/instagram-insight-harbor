# Instagram Insight Harbor (InstaBridge MCP)

Connect an Instagram professional account using Meta's official **Instagram API with Instagram Login**. This app includes a secure OAuth callback, server-encrypted access tokens, an integrated AI chat, keyword-triggered comment automation with a draft review queue, confirmed write actions, and a stateless Streamable HTTP MCP endpoint.

## Features

- Real OAuth state persisted server-side, expires after 10 minutes and is consumed once.
- Browser session cookie is HttpOnly, Secure, SameSite=Lax and signed on the server.
- Long-lived access tokens are encrypted with AES-256-GCM before database storage.
- Instagram profile, media, eligible insights and comment listing through official Graph API endpoints.
- Confirmed comment replies, comment hide/unhide and image/reel publishing workflows.
- MCP endpoint at `/api/mcp` with API-key authentication. Clear API keys are shown only at creation; only a keyed hash is stored.
- Demo content is kept separate and explicitly labeled when Instagram is not connected.

## Required server-side secrets

Set these using your hosting provider's server-side Secrets/Environment settings. **Never commit values to GitHub or expose them in browser JavaScript.**

| Name | Purpose |
|---|---|
| `META_APP_ID` | Instagram App ID from the Instagram API with Instagram Login product settings |
| `META_APP_SECRET` | Matching Instagram App Secret |
| `META_REDIRECT_URI` | Exact callback URL, for example `https://YOUR-DOMAIN/api/public/meta/callback` |
| `INSTAGRAM_SESSION_SECRET` | Random secret, at least 32 characters, for signing browser sessions and hashing MCP keys |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters for AES-256-GCM |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key |
| `INSTAGRAM_GRAPH_API_VERSION` | Optional override; defaults to `v25.0` |

Generate random secrets locally with a trusted random generator and save them directly in deployment secrets, not in chat or source control. `META_WEBHOOK_VERIFY_TOKEN` may be any strong random string; enter the same value in Meta. Do not rotate the encryption key unless you have a plan to re-encrypt existing stored tokens.

## Database setup

Against the connected Supabase database, apply these SQL migrations **once and in order** if they have not already been applied:

1. `drizzle/migrations/0000_instagram_core.sql`
2. `drizzle/migrations/0001_mcp_api_keys.sql`
3. `drizzle/migrations/0002_instagram_automation.sql`

The token, OAuth state and automation tables are protected by RLS and only grant server-side service-role access. The clear Instagram token is never sent to the browser. Run migration 0002 before using Automation.

## Meta setup and testing

1. Use an Instagram **Business or Creator** account. Personal accounts are not supported by this API path.
2. In Meta for Developers, configure the Instagram API with Instagram Login and copy the Instagram App ID and App Secret from that product's settings.
3. Register the exact callback URL as the redirect URI.
4. Add server secrets and apply database migrations.
5. Open `/connect`, choose the permissions needed, and authorize using an account assigned to your Meta app. Test while the app is in Development mode first.
6. Test loading media, reading insights, replying to a comment and publishing with a non-sensitive test post before using write tools.
7. Meta App Review / Advanced Access may be required for accounts outside the app's roles.

## AI comment data and safety

When you use AI Chat, your messages and the Instagram profile/media/comment data needed for the requested answer may be sent to OpenAI for processing. Chat history is held in page state and is not saved to the app database. When an enabled automation rule receives a new comment containing the configured keyword, that comment text and public username are sent to OpenAI to draft a reply. The webhook never sends a reply if the AI provider fails. In **draft** mode the reply waits in the dashboard for owner review; in **auto** mode, matching comments can receive a public reply without a separate confirmation for each comment. Keep auto-send disabled until a controlled test succeeds. Disable the rule to stop future automation.

## Connect an AI client

After a real Instagram connection succeeds, open the **Connect** page and create an MCP API key. It appears once; copy it to the AI client's secret/header configuration.

- Transport: Streamable HTTP / JSON-RPC
- Endpoint: `https://YOUR-DOMAIN/api/mcp`
- Header: `Authorization: Bearer YOUR_MCP_KEY`
- Supported tools: `get_profile`, `list_media`, `get_media_insights`, `list_comments`, `reply_to_comment`, `hide_comment`, `publish_media`

Every MCP write tool requires `confirmed: true` after the account owner explicitly reviews the exact public action. AI Chat similarly shows a proposal before a reply, hide, or post. Do not configure the MCP key in frontend code, a public URL, or a shared repository. Revoke keys from the Connect page. Disconnecting removes the stored account token and revokes keys for that browser session.

## Free hosting setup: Cloudflare Workers

This repository includes a **manual** GitHub Actions workflow at `.github/workflows/deploy-cloudflare.yml`. It builds and tests the app, then deploys the generated Nitro Worker. It does not run until manually triggered.

1. Create/sign in to a Cloudflare account and enable Workers.
2. In GitHub repository Settings → Secrets and variables → Actions, add `CLOUDFLARE_API_TOKEN` (a token with permission to deploy Workers) and `CLOUDFLARE_ACCOUNT_ID`.
3. Open Actions → **Deploy to Cloudflare Workers** → Run workflow. Check that the build and deploy steps both pass, then copy the assigned `workers.dev` URL.
4. In Cloudflare Dashboard → Workers & Pages → the deployed Worker → Settings → Variables and Secrets, add all required server-side variables listed above. Mark `META_APP_SECRET`, session secret, encryption key, Supabase service-role key, `OPENAI_API_KEY` and `META_WEBHOOK_VERIFY_TOKEN` as **Secrets**, not plain text. Set `META_REDIRECT_URI` to `https://YOUR-WORKER-URL/api/public/meta/callback`.
5. In Meta for Developers, add that exact callback URL to the Instagram Login redirect URI allowlist. Save the Meta settings.
6. In the Supabase SQL Editor, run all three migrations above in order. Use the server-side service-role key only in Cloudflare Secrets; never publish it to GitHub or send it in chat.
7. Open the deployed site → `/setup` to check environment readiness, then `/connect` to authorize the Instagram account. Test read-only profile/media first, then test write actions only with a safe test post/comment. Configure and verify the Meta comments webhook before enabling Auto-send in `/automation`.

Free tier note: Cloudflare Workers currently has request/CPU limits; free service is not an unlimited or permanent guarantee. Supabase and Meta may also impose their own quotas or review requirements. A custom domain is optional; use the assigned `workers.dev` URL to start.

**Do not paste any tokens, app secrets, or Supabase service-role keys into conversations or source files.** The required values must be added directly in the respective account dashboards.

## Deployment and verification notes

A correct code deployment still needs valid Meta app settings, a reachable Supabase database, the SQL migrations, and Meta-granted permissions. Some API fields/metrics depend on media type and permissions, so the app returns API errors rather than manufacturing sample metrics for live accounts. The repository's live endpoints should be tested in the deployment environment after secrets are configured.
