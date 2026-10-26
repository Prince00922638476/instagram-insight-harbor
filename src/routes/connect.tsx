import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Upload, ShieldCheck, Loader2, Info, Copy, KeyRound, Trash2, ExternalLink } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, PageHeader } from "@/components/ui-kit";
import { actions, ALL_SCOPES, useAppState } from "@/lib/app-store";
import { useMetaConfig } from "@/lib/use-mode";

export const Route = createFileRoute("/connect")({
  validateSearch: (s: Record<string, unknown>): { oauth?: string | undefined } => ({ oauth: typeof s["oauth"] === "string" ? s["oauth"] : undefined }),
  head: () => ({ meta: [
    { title: "Connect Instagram — InstaBridge MCP" },
    { name: "description", content: "Connect an Instagram professional account and create a secured MCP key for AI assistants." },
    { property: "og:title", content: "Connect Instagram — InstaBridge MCP" },
  ] }),
  component: Connect,
});

type LiveStatus = {
  connected: boolean;
  account?: { username: string | null; accountType: string | null; scopes: string[]; tokenExpiresAt: string | null } | null;
  error?: string;
};
type KeySummary = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

const oauthMsg: Record<string, string> = {
  connected: "Instagram connected successfully. The account and encrypted token are saved on the server.",
  denied: "You declined access on Instagram. Nothing was connected.",
  misconfigured: "Server settings are missing. Open Setup to see the required configuration.",
  exchange_failed: "Instagram rejected the authorization or token exchange. Check the Instagram App ID/secret and redirect URI.",
  profile_failed: "The token was received, but Instagram profile verification failed. No connection was saved.",
  storage_failed: "Secure token storage failed. Check the database migration and server encryption key.",
  invalid_state: "The OAuth session expired or did not match. Start the connection again.",
  storage_unavailable: "The database is not available. Check the Supabase connection.",
  bad_request: "Instagram returned an incomplete authorization response.",
  denied_by_user: "Instagram access was declined.",
};

function Connect() {
  const s = useAppState();
  const { oauth } = Route.useSearch();
  const cfg = useMetaConfig();
  const live = cfg.data?.configured === true;
  const [name, setName] = useState(s.connector.serverName || "instagram-studio");
  const [icon, setIcon] = useState<string | null>(s.connector.icon);
  const [scopes, setScopes] = useState<string[]>(s.connector.scopes.length ? s.connector.scopes : ALL_SCOPES.map(x => x.id));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({ connected: false });
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [keyName, setKeyName] = useState("My AI assistant");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const nameOk = /^[a-z0-9-]{3,40}$/.test(name);
  const canSubmit = nameOk && consent && scopes.length > 0 && !busy;

  async function refreshLiveStatus() {
    try {
      const response = await fetch("/api/public/meta/status", { cache: "no-store", credentials: "same-origin" });
      const status = await response.json() as LiveStatus;
      setLiveStatus(status);
      if (status.connected) {
        const keyResponse = await fetch("/api/public/mcp-keys", { cache: "no-store", credentials: "same-origin" });
        const keyData = await keyResponse.json() as { keys?: KeySummary[] };
        setKeys(keyData.keys ?? []);
      } else setKeys([]);
    } catch {
      setLiveStatus({ connected: false, error: "status_unavailable" });
    }
  }

  useEffect(() => { void refreshLiveStatus(); }, [oauth]);

  function onIcon(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 500_000) {
      setErr("Icon must be an image under 500 KB.");
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => setIcon(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (live) {
        window.location.href = `/api/public/meta/start?scopes=${encodeURIComponent(scopes.join(","))}`;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 400));
      actions.saveConnector({ serverName: name, icon, scopes, consent, connected: true });
      actions.log({ action: "connector.create", detail: `Created “${name}” in demo mode with ${scopes.length} scopes`, status: "success", mode: "DEMO" });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setConfirm(false);
    if (liveStatus.connected) {
      try {
        const response = await fetch("/api/public/meta/disconnect", { method: "POST", credentials: "same-origin" });
        if (!response.ok) throw new Error("Server could not disconnect the account.");
        setLiveStatus({ connected: false });
        setKeys([]);
        setNewKey(null);
        setKeyMessage("Instagram disconnected. MCP keys have been revoked.");
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Disconnect failed.");
      }
      return;
    }
    actions.disconnect();
    actions.log({ action: "connector.disconnect", detail: `Disconnected “${s.connector.serverName}”`, status: "success", mode: "DEMO" });
  }

  async function createKey() {
    setKeyBusy(true); setKeyMessage(null); setNewKey(null);
    try {
      const response = await fetch("/api/public/mcp-keys", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName }),
      });
      const data = await response.json() as { key?: string; error?: string };
      if (!response.ok || !data.key) throw new Error(data.error || "Could not create API key.");
      setNewKey(data.key);
      setKeyMessage("Copy this key now. It is shown only once and cannot be recovered later.");
      await refreshLiveStatus();
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : "Could not create API key.");
    } finally {
      setKeyBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setKeyMessage(null);
    try {
      const response = await fetch("/api/public/mcp-keys", {
        method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not revoke this key.");
      setKeys(current => current.filter(key => key.id !== id));
      setKeyMessage("API key revoked.");
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : "Could not revoke this key.");
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setKeyMessage("Copied. Store it in your AI client’s secret field; it won’t be shown again.");
    } catch {
      setKeyMessage("Copy is unavailable in this browser. Select and copy the key manually, then store it securely.");
    }
  }

  const connected = liveStatus.connected || (!live && s.connector.connected);

  return (
    <>
      <PageHeader title="Connect Instagram" subtitle="Official Instagram Login, encrypted token storage and an authenticated MCP endpoint." right={!live && <DemoBadge />} />

      {oauth && oauthMsg[oauth] && (
        <div className="mb-4 flex gap-2 rounded-xl bg-warning-soft p-3 text-sm">
          <Info className="h-4 w-4 shrink-0" /><span>{oauthMsg[oauth]}</span>
        </div>
      )}
      {liveStatus.error && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm">Could not verify the live connection. Check the database configuration.</p>}

      {connected && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-primary/40">
          <div className="flex items-center gap-3">
            {icon ? <img src={icon} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-brand" />}
            <div>
              <p className="font-semibold">{liveStatus.connected ? `@${liveStatus.account?.username || "Instagram account"}` : s.connector.serverName}</p>
              <p className="text-xs text-muted-foreground">{liveStatus.connected ? `Live connection · ${liveStatus.account?.scopes?.length ?? 0} permissions` : "Demo connection — no Instagram data is accessed"}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setConfirm(true)}>Disconnect</Button>
        </Card>
      )}

      <Card className="mx-auto max-w-xl space-y-6">
        <Step n={1} title="Connector name">
          <input value={name} onChange={event => setName(event.target.value.toLowerCase())} className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="instagram-studio" />
          {!nameOk && <p className="mt-1 text-xs text-destructive">3–40 lowercase letters, numbers or dashes.</p>}
        </Step>
        <Step n={2} title="Icon (optional)">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 hover:bg-muted">
            {icon ? <img src={icon} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-muted"><Upload className="h-5 w-5 text-muted-foreground" /></div>}
            <span className="text-sm text-muted-foreground">PNG or JPG, under 500 KB</span>
            <input type="file" accept="image/*" className="hidden" onChange={event => onIcon(event.target.files?.[0])} />
          </label>
        </Step>
        <Step n={3} title="Server configuration">
          <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
            <span>Instagram API + secure storage</span>
            {cfg.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : live ? <span className="font-semibold text-primary">Configured</span> : <span className="font-semibold text-magenta">Setup required</span>}
          </div>
        </Step>
        <Step n={4} title="Permissions">
          <div className="space-y-2">
            {ALL_SCOPES.map(scope => {
              const checked = scopes.includes(scope.id);
              return <button key={scope.id} type="button" onClick={() => setScopes(checked ? scopes.filter(value => value !== scope.id) : [...scopes, scope.id])}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm ${checked ? "border-primary bg-teal-soft" : ""}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-md border ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}>{checked && <Check className="h-3 w-3" />}</span>
                <span className="flex-1"><span className="font-medium">{scope.label}</span><code className="block text-[10px] text-muted-foreground">{scope.id}</code></span>
                {scope.write && <span className="rounded-full bg-magenta-soft px-2 py-0.5 text-[10px] font-bold text-magenta">write</span>}
              </button>;
            })}
          </div>
        </Step>
        <label className="flex items-start gap-3 rounded-xl bg-muted p-4 text-sm">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          <span>I understand the AI tools can read my Instagram data. Publishing, hiding and replying require an explicit confirmation. I can revoke access from this app or Instagram settings.</span>
        </label>
        {err && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
        <Button className="w-full py-3" disabled={!canSubmit} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {live ? "Connect with Instagram" : connected ? "Update connector (demo)" : "Create connector (demo)"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Your Instagram password is never collected. Authorization happens on Instagram.</p>
      </Card>

      {liveStatus.connected && (
        <Card className="mx-auto mt-6 max-w-xl space-y-4">
          <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-bold">Connect an AI assistant (MCP)</h2></div>
          <p className="text-sm text-muted-foreground">Server endpoint: <code className="break-all">/api/mcp</code>. Create a key and configure your MCP client with this URL and the key as a Bearer token.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={keyName} onChange={event => setKeyName(event.target.value)} maxLength={60} className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm" aria-label="API key name" />
            <Button disabled={keyBusy || !keyName.trim()} onClick={createKey}>{keyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create key</Button>
          </div>
          {newKey && <div className="space-y-2 rounded-xl border border-primary/40 bg-muted p-3">
            <p className="text-xs font-semibold">New API key — copy now</p>
            <code className="block break-all text-xs">{newKey}</code>
            <Button variant="outline" onClick={copyKey}><Copy className="h-4 w-4" /> Copy key</Button>
          </div>}
          {keyMessage && <p className="rounded-xl bg-muted p-3 text-xs">{keyMessage}</p>}
          {keys.filter(key => !key.revoked_at).length > 0 && <div className="space-y-2">
            <p className="text-sm font-semibold">Active keys</p>
            {keys.filter(key => !key.revoked_at).map(key => <div key={key.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{key.name}</p><code className="text-xs text-muted-foreground">{key.key_prefix}…</code><p className="text-[10px] text-muted-foreground">{key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleString()}` : "Not used yet"}</p></div>
              <Button variant="outline" className="shrink-0" onClick={() => revokeKey(key.id)}><Trash2 className="h-4 w-4" /> Revoke</Button>
            </div>)}
          </div>}
          <a href="/setup#mcp" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">View MCP setup instructions <ExternalLink className="h-3 w-3" /></a>
        </Card>
      )}

      <ConfirmDialog open={confirm} title="Disconnect Instagram?" summary="Stored access will be removed and all MCP API keys for this session will be revoked." confirmLabel="Disconnect" onCancel={() => setConfirm(false)} onConfirm={() => { void disconnect(); }} />
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs text-background">{n}</span>{title}</p>{children}</div>;
}
