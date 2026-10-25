import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Upload, ShieldCheck, Loader2, Info } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, PageHeader } from "@/components/ui-kit";
import { actions, ALL_SCOPES, useAppState } from "@/lib/app-store";
import { useMetaConfig } from "@/lib/use-mode";
import { getOAuthUrl } from "@/lib/meta.functions";

export const Route = createFileRoute("/connect")({
  validateSearch: (s: Record<string, unknown>): { oauth?: string } => ({ oauth: typeof s["oauth"] === "string" ? s["oauth"] : undefined }),
  head: () => ({
    meta: [
      { title: "Connect Instagram — InstaBridge MCP" },
      { name: "description", content: "Set up an MCP connector for your Instagram professional account with official Meta OAuth." },
      { property: "og:title", content: "Connect Instagram — InstaBridge MCP" },
      { property: "og:description", content: "Official Meta OAuth connection wizard." },
    ],
  }),
  component: Connect,
});

const oauthMsg: Record<string, string> = {
  denied: "You declined access on Instagram. Nothing was connected.",
  misconfigured: "Meta app credentials are missing on the server.",
  exchange_failed: "Instagram rejected the authorization code. Check your app's redirect URI and try again.",
  exchanged_not_stored: "Authorization succeeded, but token storage isn't set up yet. See the setup guide.",
};

function Connect() {
  const s = useAppState();
  const { oauth } = Route.useSearch();
  const cfg = useMetaConfig();
  const live = cfg.data?.configured;
  const [name, setName] = useState(s.connector.serverName || "instagram-studio");
  const [icon, setIcon] = useState<string | null>(s.connector.icon);
  const [scopes, setScopes] = useState<string[]>(s.connector.scopes.length ? s.connector.scopes : ALL_SCOPES.map((x) => x.id));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"disconnect" | null>(null);

  const nameOk = /^[a-z0-9-]{3,40}$/.test(name);
  const canSubmit = nameOk && consent && scopes.length > 0 && !busy;

  function onIcon(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 500_000) {
      setErr("Icon must be an image under 500 KB.");
      return;
    }
    setErr(null);
    const r = new FileReader();
    r.onload = () => setIcon(String(r.result));
    r.readAsDataURL(f);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (live) {
        const { url } = await getOAuthUrl({ data: { scopes } });
        actions.log({ action: "oauth.start", detail: `Redirecting to Instagram for ${scopes.length} scopes`, status: "success", mode: "LIVE" });
        window.location.href = url;
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
      actions.saveConnector({ serverName: name, icon, scopes, consent, connected: true });
      actions.log({ action: "connector.create", detail: `Created “${name}” with ${scopes.length} scopes`, status: "success", mode: "DEMO" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Connect Instagram" subtitle="Create an MCP connector backed by Meta's official OAuth." right={!live && <DemoBadge />} />

      {oauth && oauthMsg[oauth] && (
        <div className="mb-4 flex gap-2 rounded-xl bg-warning-soft p-3 text-sm"><Info className="h-4 w-4 shrink-0" />{oauthMsg[oauth]}</div>
      )}

      {s.connector.connected && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-primary/40">
          <div className="flex items-center gap-3">
            {s.connector.icon ? <img src={s.connector.icon} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-brand" />}
            <div>
              <p className="font-semibold">{s.connector.serverName}</p>
              <p className="text-xs text-muted-foreground">Connected · {s.connector.scopes.length} permissions</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
        </Card>
      )}

      <Card className="mx-auto max-w-xl space-y-6">
        <Step n={1} title="Server name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="instagram-studio"
          />
          {!nameOk && <p className="mt-1 text-xs text-destructive">3–40 lowercase letters, numbers or dashes.</p>}
        </Step>

        <Step n={2} title="Icon (optional)">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 hover:bg-muted">
            {icon ? <img src={icon} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-muted"><Upload className="h-5 w-5 text-muted-foreground" /></div>}
            <span className="text-sm text-muted-foreground">PNG or JPG, under 500 KB</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onIcon(e.target.files?.[0])} />
          </label>
        </Step>

        <Step n={3} title="OAuth status">
          <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
            <span>Meta app credentials</span>
            {cfg.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : live ? <span className="font-semibold text-primary">Configured</span> : <span className="font-semibold text-magenta">Not configured (demo)</span>}
          </div>
        </Step>

        <Step n={4} title="Permissions">
          <div className="space-y-2">
            {ALL_SCOPES.map((sc) => {
              const on = scopes.includes(sc.id);
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setScopes(on ? scopes.filter((x) => x !== sc.id) : [...scopes, sc.id])}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm ${on ? "border-primary bg-teal-soft" : ""}`}
                >
                  <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="flex-1">
                    <span className="font-medium">{sc.label}</span>
                    <code className="block text-[10px] text-muted-foreground">{sc.id}</code>
                  </span>
                  {sc.write && <span className="rounded-full bg-magenta-soft px-2 py-0.5 text-[10px] font-bold text-magenta">write</span>}
                </button>
              );
            })}
          </div>
        </Step>

        <label className="flex items-start gap-3 rounded-xl bg-muted p-4 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          <span>
            I understand that AI assistants connected through this MCP server can read my Instagram data and, for write permissions, take actions on my behalf after confirmation. I can revoke access anytime in Instagram settings.
          </span>
        </label>

        {err && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}

        <Button className="w-full py-3" disabled={!canSubmit} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {live ? "Connect with Instagram" : s.connector.connected ? "Update connector (demo)" : "Create connector (demo)"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">We never ask for your Instagram password. Sign-in happens on Instagram.</p>
      </Card>

      <ConfirmDialog
        open={confirm === "disconnect"}
        title="Disconnect account?"
        summary="AI assistants will lose access to this Instagram account through the MCP server."
        confirmLabel="Disconnect"
        onCancel={() => {
          actions.log({ action: "connector.disconnect", detail: "Cancelled by user", status: "cancelled", mode: live ? "LIVE" : "DEMO" });
          setConfirm(null);
        }}
        onConfirm={() => {
          actions.disconnect();
          actions.log({ action: "connector.disconnect", detail: `Disconnected “${s.connector.serverName}”`, status: "success", mode: live ? "LIVE" : "DEMO" });
          setConfirm(null);
        }}
      />
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs text-background">{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}
