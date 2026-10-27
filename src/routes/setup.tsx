import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";
import { useMetaConfig } from "@/lib/use-mode";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [
    { title: "Setup Guide — InstaBridge MCP" },
    { name: "description", content: "Configure Instagram Login, secure token storage and an authenticated MCP endpoint." },
  ] }),
  component: Setup,
});

const requiredSecrets = [
  ["META_APP_ID", "Instagram App ID from the Instagram API with Instagram Login product settings."],
  ["META_APP_SECRET", "Instagram App Secret from those same Instagram product settings. Keep it server-side."],
  ["META_REDIRECT_URI", "Exact HTTPS callback URL, for example https://YOUR-DOMAIN/api/public/meta/callback."],
  ["INSTAGRAM_SESSION_SECRET", "A random secret of at least 32 characters used to sign the browser session cookie."],
  ["INSTAGRAM_TOKEN_ENCRYPTION_KEY", "A random 32-byte key encoded as 64 hexadecimal characters, used for AES-256-GCM token encryption."],
  ["SUPABASE_URL", "Your project's Supabase URL."],
  ["SUPABASE_SERVICE_ROLE_KEY", "Server-only Supabase service-role key. Never expose it in browser code."],
] as const;

const optionalSecrets = [
  ["OPENAI_API_KEY", "AI Chat और AI-generated comment replies के लिए server-only OpenAI API key."],
  ["META_WEBHOOK_VERIFY_TOKEN", "Meta comments webhook verify करने के लिए अपना random secret; यही value Meta Dashboard में डालें."],
  ["OPENAI_MODEL", "Optional text model override; default gpt-4.1-mini."],
  ["OPENAI_IMAGE_MODEL", "Optional image model override; default gpt-image-2.5-sunburst."],
] as const;

const steps = [
  ["Use an eligible account", "Instagram Login supports professional (Business or Creator) accounts. Personal accounts need to be converted to a professional account first."],
  ["Configure the Meta app", "In Meta for Developers, add the Instagram API with Instagram Login and use the Instagram App ID/Secret, not a Facebook Login token."],
  ["Set the redirect URI", "Register the exact value of META_REDIRECT_URI in the Instagram product's Business Login settings. It must exactly match the value sent during authorization."],
  ["Add server secrets", "Add every required name below in the deployment's server-side Secrets/Environment settings. Do not commit secret values to GitHub or paste them into chat."],
  ["Apply database migrations", "Run drizzle/migrations/0000_instagram_core.sql, 0001_mcp_api_keys.sql, 0002_instagram_automation.sql and 0003_permissions_hardening.sql in this order against the connected Supabase database."],
  ["Test with your own account", "Start from Connect Instagram and approve the requested scopes. The callback validates one-time state, verifies the profile, exchanges for a long-lived token and stores it encrypted."],
  ["Create an MCP key", "After a successful connection, open Connect Instagram and create an API key. It is shown once; store it in your AI client's secret/header configuration. Revoke it here if needed."],
  ["Configure comment webhooks", "In Meta Developer Dashboard, configure the Instagram comments webhook callback at /api/public/instagram/webhook, use META_WEBHOOK_VERIFY_TOKEN for verification and subscribe to comments. Start with draft mode in /automation."],
  ["Review before public launch", "Meta may require App Review and appropriate access for accounts outside your app roles. Test profile/media, comments and publishing with an account you control before relying on it."],
];

function Setup() {
  const cfg = useMetaConfig();
  return <>
    <PageHeader title="Setup guide" subtitle="Finish the deployment configuration before attempting a live connection." />
    <Card className="mb-6">
      <h2 className="mb-3 font-bold">Server configuration</h2>
      {cfg.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfg.isError ? <p className="text-sm text-destructive">Could not check server configuration.</p> : <ul className="space-y-3 text-sm">
        {requiredSecrets.map(([name, description]) => {
          const ok = cfg.data?.checks[name as keyof NonNullable<typeof cfg.data>["checks"]] ?? false;
          return <li key={name} className="flex items-start gap-2"><span className="mt-0.5">{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}</span><div><div className="flex flex-wrap items-center gap-2"><code>{name}</code><span className={ok ? "text-primary" : "text-destructive"}>{ok ? "set" : "missing"}</span></div><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></li>;
        })}
      </ul>}
      <h3 className="mb-2 mt-5 font-semibold">AI Chat and Automation</h3>
      <ul className="space-y-3 text-sm">
        {optionalSecrets.map(([name, description]) => {
          const ok = cfg.data?.optionalChecks[name as keyof NonNullable<typeof cfg.data>["optionalChecks"]] ?? false;
          const optional = name === "OPENAI_MODEL" || name === "OPENAI_IMAGE_MODEL";
          return <li key={name} className="flex items-start gap-2"><span className="mt-0.5">{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : optional ? <ShieldCheck className="h-4 w-4 text-muted-foreground" /> : <XCircle className="h-4 w-4 text-warning" />}</span><div><div className="flex flex-wrap items-center gap-2"><code>{name}</code><span className={ok ? "text-primary" : optional ? "text-muted-foreground" : "text-warning"}>{ok ? "set" : optional ? "optional — default used" : "needed for AI/webhooks"}</span></div><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></li>;
        })}
      </ul>
      <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Optional: set INSTAGRAM_GRAPH_API_VERSION if you need to override the default Graph API version. Secret values are never sent to the browser.</p>
    </Card>
    <ol className="space-y-3">{steps.map(([title, description], index) => <Card key={title} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand font-bold text-primary-foreground">{index + 1}</span><div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div></Card>)}</ol>
    <Card className="mt-6">
      <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">Security design</h2></div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>• OAuth state is one-time, stored server-side and bound to a signed HttpOnly cookie.</li>
        <li>• Access tokens are encrypted with AES-256-GCM before being stored; browser code never receives them.</li>
        <li>• MCP keys are shown once and only a keyed hash is stored in the database.</li>
        <li>• MCP write tools require confirmed=true; the connected AI must ask the account owner to approve the exact reply or public post.</li>
        <li>• Revoke an MCP key or disconnect the account to remove access.</li>
      </ul>
    </Card>
    <div id="mcp"><Card className="mt-6">
      <div className="mb-3 flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-bold">MCP endpoint</h2></div>
      <p className="mb-3 text-sm text-muted-foreground">Endpoint: <code>https://YOUR-DOMAIN/api/mcp</code>. Use Streamable HTTP / JSON-RPC and send the generated key in <code>Authorization: Bearer YOUR_KEY</code>. Do not put the key in a URL or frontend source.</p>
      <pre className="overflow-x-auto rounded-xl bg-foreground p-4 text-xs text-background">{`tools:
  get_profile
  list_media
  get_media_insights
  list_comments
  reply_to_comment       # confirmed=true required
  hide_comment           # confirmed=true required
  publish_media          # confirmed=true required`}</pre>
      <p className="mt-3 text-xs text-muted-foreground">Instagram only allows operations supported by its API, the approved permissions, account type and Meta app mode. A successful code deployment alone does not grant Meta permissions.</p>
    </Card></div>
  </>;
}
