import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Send, CheckCircle2, Info } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";

export const Route = createFileRoute("/publish")({
  head: () => ({
    meta: [
      { title: "Publish — InstaBridge MCP" },
      { name: "description", content: "Publish images and reels to Instagram via the official Content Publishing API." },
      { property: "og:title", content: "Publish — InstaBridge MCP" },
      { property: "og:description", content: "Confirmed publishing workflow for posts and reels." },
    ],
  }),
  component: Publish,
});

const STEPS = ["Create media container", "Wait for processing", "Publish container"];

function Publish() {
  const s = useAppState();
  const [kind, setKind] = useState<"IMAGE" | "REEL">("IMAGE");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [step, setStep] = useState(-1);
  const urlOk = /^https:\/\/\S+\.(jpe?g|mp4|mov)(\?\S*)?$/i.test(url);
  const allowed = s.connector.connected && s.connector.scopes.includes("instagram_business_content_publish");

  async function run() {
    setConfirm(false);
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 900));
    }
    setStep(STEPS.length);
    actions.addDraft({ kind, mediaUrl: url, caption, status: "published" });
    actions.log({ action: "media.publish", detail: `${kind}: “${caption.slice(0, 40) || "(no caption)"}”`, status: "success", mode: "DEMO" });
    setTimeout(() => {
      setStep(-1);
      setUrl("");
      setCaption("");
    }, 1500);
  }

  return (
    <>
      <PageHeader title="Publish" subtitle="Single image or reel via the Content Publishing API." right={<DemoBadge />} />
      <div className="mb-4 flex gap-2 rounded-xl bg-teal-soft p-3 text-xs text-accent-foreground">
        <Info className="h-4 w-4 shrink-0" />
        Meta requires media at a public HTTPS URL (JPEG for images, MP4/MOV for reels). Stories and filters aren't available via the API. Accounts have a rolling 24h publishing limit.
      </div>

      {!allowed ? (
        <Empty icon={<Send className="h-8 w-8" />} title="Publishing not enabled" text="Connect an account with the “Publish posts & reels” permission first." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="space-y-4">
            <div className="flex gap-2">
              {(["IMAGE", "REEL"] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)} className={`flex-1 rounded-xl py-2 text-sm font-semibold ${kind === k ? "bg-foreground text-background" : "border"}`}>{k}</button>
              ))}
            </div>
            <div>
              <label className="text-sm font-semibold">Public media URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "IMAGE" ? "https://…/photo.jpg" : "https://…/clip.mp4"} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              {url && !urlOk && <p className="mt-1 text-xs text-destructive">Must be an https URL ending in .jpg, .mp4 or .mov</p>}
            </div>
            <div>
              <label className="text-sm font-semibold">Caption</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={4} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-right text-xs text-muted-foreground">{caption.length}/2200</p>
            </div>
            <Button variant="magenta" className="w-full" disabled={!urlOk || step >= 0} onClick={() => setConfirm(true)}>
              {step >= 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Review & publish
            </Button>
            {step >= 0 && (
              <ol className="space-y-2 text-sm">
                {STEPS.map((t, i) => (
                  <li key={t} className="flex items-center gap-2">
                    {i < step ? <CheckCircle2 className="h-4 w-4 text-primary" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border" />}
                    {t}
                  </li>
                ))}
                {step === STEPS.length && <li className="font-semibold text-primary">Published (demo)</li>}
              </ol>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Publishing history</h2>
            {s.drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {s.drafts.map((d) => (
                  <li key={d.id} className="py-2">
                    <span className="font-semibold">{d.kind}</span> · {d.caption || "(no caption)"}
                    <p className="text-xs text-muted-foreground">{new Date(d.ts).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/activity" className="mt-3 inline-block text-sm font-semibold text-primary">View activity log →</Link>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title={`Publish this ${kind.toLowerCase()}?`}
        summary={<><p className="break-all"><strong>URL:</strong> {url}</p><p className="mt-1"><strong>Caption:</strong> {caption || "(none)"}</p><p className="mt-2">It will be visible publicly on your profile.</p></>}
        confirmLabel="Publish"
        onCancel={() => {
          setConfirm(false);
          actions.log({ action: "media.publish", detail: "Cancelled before publishing", status: "cancelled", mode: "DEMO" });
        }}
        onConfirm={run}
      />
    </>
  );
}
