import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";
import { useMetaConfig } from "@/lib/use-mode";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Setup Guide — InstaBridge MCP" },
      { name: "description", content: "How to configure a Meta app, permissions, review and the MCP server for InstaBridge." },
      { property: "og:title", content: "Setup Guide — InstaBridge MCP" },
      { property: "og:description", content: "Meta app setup, permissions and MCP server guide." },
    ],
  }),
  component: Setup,
});

const steps = [
  ["Use an eligible account", "Your Instagram account must be a Business or Creator (professional) account. Personal accounts can't use the Instagram API."],
  ["Create a Meta app", "At developers.facebook.com create an app, add the “Instagram” product and choose “API setup with Instagram login”."],
  ["Add the redirect URI", "Set the OAuth redirect to https://YOUR-DOMAIN/api/public/meta/callback in the Instagram product settings."],
  ["Add secrets", "In Project Settings → Secrets add META_APP_ID, META_APP_SECRET and META_REDIRECT_URI. They stay server-side only."],
  ["Request permissions", "instagram_business_basic, _manage_insights, _manage_comments, _content_publish. Test with your own account in Development mode."],
  ["Pass App Review", "Before other people can connect, Meta must approve each permission through App Review and Business Verification."],
  ["Enable token storage", "Add a backend database so tokens can be stored encrypted per user and refreshed before their 60-day expiry."],
];

function Setup() {
  const cfg = useMetaConfig();
  return (
    <>
      <PageHeader title="Setup guide" subtitle="What's needed to go from DEMO to a live Instagram connection." />
      <Card className="mb-6">
        <h2 className="mb-3 font-bold">Server configuration</h2>
        {cfg.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : cfg.isError ? (
          <p className="text-sm text-destructive">Couldn't check configuration.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"].map((k) => {
              const ok = !cfg.data?.missing.includes(k);
              return (
                <li key={k} className="flex items-center gap-2">
                  {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-magenta" />}
                  <code>{k}</code> <span className="text-muted-foreground">{ok ? "set" : "missing"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ol className="space-y-3">
        {steps.map(([t, d], i) => (
          <Card key={t} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand font-bold text-primary-foreground">{i + 1}</span>
            <div>
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-muted-foreground">{d}</p>
            </div>
          </Card>
        ))}
      </ol>

      <Card className="mt-6">
        <h2 className="mb-2 font-bold">MCP server scaffold</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          The planned server exposes these tools. Write tools always require the assistant to show a confirmation and are recorded in the activity log.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-foreground p-4 text-xs text-background">{`tools:
  get_profile          read   instagram_business_basic
  list_media           read   instagram_business_basic
  get_media_insights   read   instagram_business_manage_insights
  list_comments        read   instagram_business_manage_comments
  reply_to_comment     write  instagram_business_manage_comments
  publish_media        write  instagram_business_content_publish
resources:
  instagram://profile
  instagram://media/{id}`}</pre>
        <p className="mt-3 text-sm text-muted-foreground">
          Not supported by Meta's API (so not offered): DMs without separate approval, Stories publishing for most accounts, follower lists, editing captions of published posts, or anything requiring your password.
        </p>
      </Card>
    </>
  );
}
