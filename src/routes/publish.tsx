import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, Info } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";

export const Route = createFileRoute("/publish")({
  head: () => ({ meta: [
    { title: "Publish — InstaBridge MCP" },
    { name: "description", content: "Publish an image or reel after explicit confirmation." },
  ] }),
  component: Publish,
});

const STEPS = ["Create media container", "Wait for processing", "Publish container"];

function Publish() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/meta/status", { cache: "no-store" })
      .then(response => response.json()).then((data: { connected?: boolean }) => { if (!cancelled) setConnected(Boolean(data.connected)); })
      .catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, []);
  if (connected === null) return <div className="py-10 text-sm text-muted-foreground">Checking Instagram connection…</div>;
  return connected ? <LivePublish /> : <DemoPublish />;
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

function DemoPublish() {
  const s = useAppState();
  const [kind, setKind] = useState<"IMAGE" | "REEL">("IMAGE");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [step, setStep] = useState(-1);
  const urlOk = (() => { try { const parsed = new URL(url); return parsed.protocol === "https:" && /\\.(jpe?g|mp4|mov)$/i.test(parsed.pathname); } catch { return false; } })();
  const allowed = s.connector.connected && s.connector.scopes.includes("instagram_business_content_publish");

  async function run() {
    setConfirm(false);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(resolve => setTimeout(resolve, 500)); }
    setStep(STEPS.length);
    actions.addDraft({ kind, mediaUrl: url, caption, status: "published" });
    actions.log({ action: "media.publish", detail: `DEMO ${kind}: ${caption.slice(0, 40) || "(no caption)"}`, status: "success", mode: "DEMO" });
    setTimeout(() => { setStep(-1); setUrl(""); setCaption(""); }, 1500);
  }

  return <>
    <PageHeader title="Publish" subtitle="Demo preview — connect a live Instagram account to publish for real." right={<DemoBadge />} />
    <div className="mb-4 flex gap-2 rounded-xl bg-teal-soft p-3 text-xs text-accent-foreground"><Info className="h-4 w-4 shrink-0" /><span>In demo mode, no post is sent to Instagram.</span></div>
    {!allowed ? <Empty icon={<Send className="h-8 w-8" />} title="Demo publishing preview" text="The demo connector is not active. Use Connect Instagram to start setup, then configure Meta and database secrets for live publishing." />
      : <div className="grid gap-6 md:grid-cols-2"><Card className="space-y-4">
        <div className="flex gap-2">{(["IMAGE", "REEL"] as const).map(type => <button key={type} onClick={() => setKind(type)} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${kind === type ? "bg-foreground text-background" : "border"}`}>{type}</button>)}</div>
        <div><label className="text-sm font-semibold">Public media URL</label><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/photo.jpg" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" /></div>
        <div><label className="text-sm font-semibold">Caption</label><textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} rows={4} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" /></div>
        <Button className="w-full" disabled={!urlOk || step >= 0} onClick={() => setConfirm(true)}>{step >= 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Review demo publish</Button>
        {step >= 0 && <ol className="space-y-2 text-sm">{STEPS.map((label, index) => <li key={label} className="flex items-center gap-2">{index < step ? <CheckCircle2 className="h-4 w-4 text-primary" /> : index === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border" />}{label}</li>)}{step === STEPS.length && <li className="font-semibold text-primary">Demo only — nothing was posted to Instagram</li>}</ol>}
      </Card><Card><h2 className="mb-3 font-bold">Demo history</h2>{s.drafts.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in demo history yet.</p> : <ul className="divide-y text-sm">{s.drafts.map(draft => <li key={draft.id} className="py-2"><span className="font-semibold">{draft.kind}</span> · {draft.caption || "(no caption)"}<p className="text-xs text-muted-foreground">{new Date(draft.ts).toLocaleString()}</p></li>)}</ul>}</Card></div>}
    <ConfirmDialog open={confirm} title={`Simulate ${kind.toLowerCase()} publishing?`} summary={<><p className="break-all"><strong>URL:</strong> {url}</p><p className="mt-1"><strong>Caption:</strong> {caption || "(none)"}</p><p className="mt-2">Demo only. It will not be posted on Instagram.</p></>} confirmLabel="Simulate" onCancel={() => setConfirm(false)} onConfirm={run} />
  </>;
}
