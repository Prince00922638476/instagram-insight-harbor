import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, EyeOff, Eye, Reply, Loader2 } from "lucide-react";
import { Button, Card, ConfirmDialog, Empty, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/comments")({
  head: () => ({ meta: [
    { title: "Comments Inbox — InstaBridge MCP" },
    { name: "description", content: "Read and reply to Instagram comments with confirmation before every reply." },
  ] }),
  component: Comments,
});

type LiveComment = { id: string; user: string; text: string; date: string; mediaId: string; mediaCaption: string; replies: string[]; hidden: boolean };
type MediaItem = { id: string; caption?: string; timestamp?: string };
type Pending = { kind: "reply"; id: string; text: string; hidden?: never } | { kind: "hide"; id: string; hidden: boolean; text?: never };

function Comments() {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const statusResponse = await fetch("/api/public/meta/status", { cache: "no-store" });
        const status = await statusResponse.json() as { connected?: boolean };
        if (cancelled) return;
        setLive(Boolean(status.connected));
        if (!status.connected) return;
        const mediaResponse = await fetch("/api/public/instagram/media?limit=8", { cache: "no-store" });
        const mediaJson = await mediaResponse.json() as { data?: MediaItem[]; error?: string };
        if (!mediaResponse.ok) throw new Error(mediaJson.error || "Could not load Instagram media.");
        const media = mediaJson.data ?? [];
        const batches = await Promise.all(media.map(async item => {
          const response = await fetch(`/api/public/instagram/comments?media_id=${encodeURIComponent(item.id)}`, { cache: "no-store" });
          const json = await response.json() as { data?: Array<{ id?: string; username?: string; text?: string; timestamp?: string }>; error?: string };
          if (!response.ok) throw new Error(json.error || "Could not load comments.");
          return (json.data ?? []).map(comment => ({
            id: comment.id ?? "",
            user: comment.username ?? "instagram-user",
            text: comment.text ?? "",
            date: comment.timestamp ? new Date(comment.timestamp).toLocaleDateString() : "",
            mediaId: item.id,
            mediaCaption: item.caption ?? "(no caption)",
            replies: [] as string[],
            hidden: false,
          }));
        }));
        if (!cancelled) {
          setLiveComments(batches.flat().filter(comment => comment.id));
          setLiveError(null);
        }
      } catch (error) {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "Instagram comments are unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const liveList = useMemo(() => liveComments.filter(comment => filter === "all" || (comment.replies.length === 0 && !comment.hidden)), [liveComments, filter]);
  const liveTarget = pending ? liveComments.find(comment => comment.id === pending.id) : undefined;

  if (loading && !live) {
    return <div className="py-10 text-sm text-muted-foreground">Checking your live Instagram connection…</div>;
  }
  if (!live && liveError) {
    return <>
      <PageHeader title="Comments" subtitle="Live comments from your Instagram account." />
      <Card><p role="alert" className="text-sm text-destructive">{liveError}</p><Button className="mt-3" onClick={() => window.location.reload()}>Retry</Button></Card>
    </>;
  }
  if (!live) {
    return <>
      <PageHeader title="Comments" subtitle="Live comments from your Instagram account." />
      <Card>
        <h2 className="font-bold">Instagram account not connected</h2>
        <p className="mt-2 text-sm text-muted-foreground">No sample comments or simulated replies are shown. Connect a real professional Instagram account to read and manage its comments.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/connect" className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link>
          <Link to="/setup" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">Setup guide</Link>
        </div>
      </Card>
    </>;
  }

  return (
    <>
      <PageHeader title="Comments" subtitle="Live comments from your Instagram account. Every write action requires confirmation." />
      <div className="mb-4 flex gap-2">{(["open", "all"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === f ? "bg-foreground text-background" : "border bg-card"}`}>{f === "open" ? "Needs reply" : "All"}</button>)}</div>
      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading recent comments…</div>
        : liveError ? <Card><p role="alert" className="text-sm text-destructive">{liveError}</p><Button className="mt-3" onClick={() => window.location.reload()}>Retry</Button></Card>
        : liveList.length === 0 ? <Empty icon={<MessageCircle className="h-8 w-8" />} title="No comments found" text="No comments were returned for the eight latest media items, or all comments are replied to." />
        : <div className="space-y-3">{liveList.map(comment => <Card key={comment.id} className={comment.hidden ? "opacity-60" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm"><strong>@{comment.user}</strong> <span className="text-xs text-muted-foreground">on “{comment.mediaCaption}” · {comment.date}</span></p><p className="mt-1">{comment.text}</p></div>
            <button onClick={() => setPending({ kind: "hide", id: comment.id, hidden: comment.hidden ?? false })} className="rounded-lg p-2 hover:bg-muted" aria-label={comment.hidden ? "Unhide comment" : "Hide comment"}>{comment.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
          </div>
          {comment.replies.map((reply, i) => <p key={i} className="mt-2 rounded-xl bg-teal-soft p-2 text-sm text-accent-foreground">↳ {reply}</p>)}
          <div className="mt-3 flex gap-2"><input value={drafts[comment.id] ?? ""} onChange={e => setDrafts({ ...drafts, [comment.id]: e.target.value })} placeholder="Write a public reply…" className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><Button disabled={!drafts[comment.id]?.trim() || liveBusy} onClick={() => setPending({ kind: "reply", id: comment.id, text: (drafts[comment.id] ?? "").trim() })}><Reply className="h-4 w-4" /></Button></div>
        </Card>)}</div>}
      <ConfirmDialog open={!!pending} title={pending?.kind === "reply" ? "Post public reply?" : pending?.hidden ? "Unhide comment?" : "Hide comment?"} summary={pending?.kind === "reply" ? <>Reply to <strong>@{liveTarget?.user}</strong>: “{pending.text}”</> : <>Comment by <strong>@{liveTarget?.user}</strong>: “{liveTarget?.text}”</>} confirmLabel={pending?.kind === "reply" ? "Post reply" : "Confirm"} onCancel={() => setPending(null)} onConfirm={() => { void confirmLiveAction(); }} />
      {liveBusy && <div className="fixed bottom-20 right-4 rounded-xl bg-card p-3 text-sm shadow-card"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Sending to Instagram…</div>}
    </>
  );
}
