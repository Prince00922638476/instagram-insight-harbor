# InstaBridge MCP

Connect an Instagram professional account via Meta's official **Instagram API with Instagram Login** and expose supported actions to AI assistants through MCP.

## Modes
- **DEMO** (default): no Meta credentials → sample data, clearly labeled. Demo state is kept in the browser.
- **LIVE**: set `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` in Project Settings → Secrets.

## Setup
1. Business or Creator Instagram account.
2. Meta app with the Instagram product; redirect URI `https://YOUR-DOMAIN/api/public/meta/callback`.
3. Permissions: `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_content_publish`.
4. App Review + Business Verification before non-tester accounts can connect.

## Security
- Secrets are read only inside server functions (`src/lib/meta.functions.ts`) and the callback route.
- The OAuth code is exchanged server-side; tokens never reach the browser.
- No scraping, no password collection.

## Status / next steps
- Token persistence: the callback exchanges the code but does **not** store the token yet. Enable a backend database (Lovable Cloud) to store tokens encrypted per user, add OAuth `state` verification, and refresh long-lived tokens.
- MCP server: tool catalogue documented on `/setup`. Implement with `@lovable.dev/mcp-js` once per-user auth exists, so each assistant acts only as its signed-in user.
- Every write action (publish, reply, hide, disconnect) requires confirmation and is written to the activity log.
