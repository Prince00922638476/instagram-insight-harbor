import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Send, Info } from "lucide-react";
import { Button, Card, ConfirmDialog, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/publish")({
  head: () => ({ meta: [
    { title: "Publish — InstaBridge MCP" },
    { name: "description", content: "Publish an image or reel to Instagram after explicit confirmation." },
  ] }),
  component: Publish,
});

function Publish() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/meta/status", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        const data = await response.json() as { connected?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "Instagram connection status could not be loaded.");
        return Boolean(data.connected);
      })
      .then(value => { if (!cancelled) { setConnected(value); setStatusError(null); } })
      .catch(error => { if (!cancelled) setStatusError(error instanceof Error ? error.message : "Instagram connection status is unavailable."); });
    return () => { cancelled = true; };
  }, []);

  if (statusError) return <>
    <PageHeader title="Publish" subtitle="Publish real media to your connected Instagram account." />
    <Card><p role="alert" className="text-sm text-destructive">{statusError}</p><Button className="mt-3" onClick={() => window.location.reload()}>Retry</Button></Card>
  </>;
  if (connected === null) return <div className="py-10 text-sm text-muted-foreground">Checking Instagram connection…</div>;
  if (!connected) return <>
    <PageHeader title="Publish" subtitle="Publish real media to your connected Instagram account." />
    <Card>
      <h2 className="font-bold">Instagram account not connected</h2>
      <p className="mt-2 text-sm text-muted-foreground">Demo publishing is disabled. Connect a real professional Instagram account before publishing any post or Reel.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to="/connect" className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link>
        <Link to="/setup" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">Setup guide</Link>
      </div>
    </Card>
  </>;
  return <LivePublish />;
}

function LivePublish() {
  const [kind, setKind] = useState<"IMAGE" | "REELS">("IMAGE");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const urlOk = (() => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; } })();

  async function publish() {
    setConfirm(false); setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/public/instagram/actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", media_type: kind, media_url: url, caption, confirmed: true }),
      });
      const result = await response.json() as { data?: { id?: string }; error?: string };
      if (!response.ok) throw new Error(result.error || "Instagram could not publish this media.");
      setSuccess(`Published successfully. Instagram media ID: ${result.data?.id ?? "returned"}`);
      setUrl(""); setCaption("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Publishing failed.");
    } finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Publish" subtitle="Live Instagram publishing. The exact URL and caption are shown for confirmation before posting." />
    <div className="mb-4 flex gap-2 rounded-xl bg-teal-soft p-3 text-xs text-accent-foreground"><Info className="h-4 w-4 shrink-0" /><span>Instagram must be able to fetch the media from a public HTTPS URL. Image posts need a supported image URL; reels need a supported video URL. Publishing makes the post public.</span></div>
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex gap-2">{(["IMAGE", "REELS"] as const).map(type => <button key={type} onClick={() => setKind(type)} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${kind === type ? "bg-foreground text-background" : "border"}`}>{type === "REELS" ? "REEL" : "IMAGE"}</button>)}</div>
        <div><label className="text-sm font-semibold">Public media URL</label><input value={url} onChange={event => setUrl(event.target.value)} placeholder={kind === "IMAGE" ? "https://example.com/photo.jpg" : "https://example.com/video.mp4"} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />{url && !urlOk && <p className="mt-1 text-xs text-destructive">Enter a valid public HTTPS URL.</p>}</div>
        <div><label className="text-sm font-semibold">Caption</label><textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} rows={4} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /><p className="text-right text-xs text-muted-foreground">{caption.length}/2200</p></div>
        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {success && <p className="rounded-xl bg-teal-soft p-3 text-sm text-accent-foreground">{success}</p>}
        <Button variant="magenta" className="w-full" disabled={!urlOk || busy || caption.length > 2200} onClick={() => setConfirm(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Review & publish</Button>
        {busy && <p className="text-xs text-muted-foreground">Contacting Instagram and waiting for media processing. Do not submit again while this request is running.</p>}
      </Card>
      <Card><h2 className="mb-3 font-bold">Publishing safety</h2><ul className="space-y-2 text-sm text-muted-foreground"><li>• Instagram receives the public media URL; do not use private files.</li><li>• A failed response may mean Meta rejected the media or permission. Review the error before retrying.</li><li>• The server records successful actions in the activity log when the database is available.</li></ul><Link to="/activity" className="mt-4 inline-block text-sm font-semibold text-primary">View activity log →</Link></Card>
    </div>
    <ConfirmDialog open={confirm} title={`Publish this ${kind === "REELS" ? "reel" : "image"}?`} summary={<><p className="break-all"><strong>URL:</strong> {url}</p><p className="mt-1"><strong>Caption:</strong> {caption || "(none)"}</p><p className="mt-2">This will publish publicly on your Instagram profile.</p></>} confirmLabel="Publish to Instagram" onCancel={() => setConfirm(false)} onConfirm={() => { void publish(); }} />
  </>;
}

