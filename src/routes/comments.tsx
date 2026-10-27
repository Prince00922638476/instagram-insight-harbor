import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, EyeOff, Eye, Reply, Loader2 } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";
import { demoMedia } from "@/lib/demo-data";

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
  const s = useAppState();
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

  const demoList = s.comments.filter(comment => filter === "all" || (comment.replies.length === 0 && !comment.hidden));
  const liveList = useMemo(() => liveComments.filter(comment => filter === "all" || (comment.replies.length === 0 && !comment.hidden)), [liveComments, filter]);
  const liveTarget = pending ? liveComments.find(comment => comment.id === pending.id) : undefined;

  async function confirmLiveAction() {
    if (!pending || !liveTarget) return;
    setLiveBusy(true);
    try {
      const body = pending.kind === "reply"
        ? { action: "reply", comment_id: pending.id, message: pending.text, confirmed: true }
        : { action: "hide", comment_id: pending.id, hidden: !pending.hidden, confirmed: true };
      const response = await fetch("/api/public/instagram/actions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Instagram action failed.");
      setLiveComments(current => current.map(comment => comment.id !== pending.id ? comment : pending.kind === "reply"
        ? { ...comment, replies: [...comment.replies, pending.text] }
        : { ...comment, hidden: !pending.hidden }));
      setDrafts(current => ({ ...current, [pending.id]: "" }));
      setLiveError(null);
      setPending(null);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Instagram action failed.");
    } finally {
      setLiveBusy(false);
    }
  }

  if (live) {
    return (
      <>
        <PageHeader title="Comments" subtitle="Live comments from your Instagram account. Every write action requires confirmation." />
        <div className="mb-4 flex gap-2">{(["open", "all"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === f ? "bg-foreground text-background" : "border bg-card"}`}>{f === "open" ? "Needs reply" : "All"}</button>)}</div>
        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading recent comments…</div>
          : liveError ? <Card><p className="text-sm text-destructive">{liveError}</p><Button className="mt-3" onClick={() => window.location.reload()}>Retry</Button></Card>
          : liveList.length === 0 ? <Empty icon={<MessageCircle className="h-8 w-8" />} title="No comments found" text="No comments were returned for the eight latest media items, or all comments are replied to." />
          : <div className="space-y-3">{liveList.map(comment => <Card key={comment.id} className={comment.hidden ? "opacity-60" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm"><strong>@{comment.user}</strong> <span className="text-xs text-muted-foreground">on “{comment.mediaCaption}” · {comment.date}</span></p><p className="mt-1">{comment.text}</p></div>
              <button onClick={() => setPending({ kind: "hide", id: comment.id, hidden: comment.hidden ?? false })} className="rounded-lg p-2 hover:bg-muted" aria-label={comment.hidden ? "Unhide comment" : "Hide comment"}>{comment.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
            </div>
            {comment.replies.map((reply, i) => <p key={i} className="mt-2 rounded-xl bg-teal-soft p-2 text-sm text-accent-foreground">↳ {reply}</p>)}
            <div className="mt-3 flex gap-2"><input value={drafts[comment.id] ?? ""} onChange={e => setDrafts({ ...drafts, [comment.id]: e.target.value })} placeholder="Write a public reply…" className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><Button disabled={!drafts[comment.id]?.trim()} onClick={() => setPending({ kind: "reply", id: comment.id, text: (drafts[comment.id] ?? "").trim() })}><Reply className="h-4 w-4" /></Button></div>
          </Card>)}</div>}
        <ConfirmDialog open={!!pending} title={pending?.kind === "reply" ? "Post public reply?" : pending?.hidden ? "Unhide comment?" : "Hide comment?"} summary={pending?.kind === "reply" ? <>Reply to <strong>@{liveTarget?.user}</strong>: “{pending.text}”</> : <>Comment by <strong>@{liveTarget?.user}</strong>: “{liveTarget?.text}”</>} confirmLabel={pending?.kind === "reply" ? "Post reply" : "Confirm"} onCancel={() => setPending(null)} onConfirm={() => { void confirmLiveAction(); }} />
        {liveBusy && <div className="fixed bottom-20 right-4 rounded-xl bg-card p-3 text-sm shadow-card"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Sending to Instagram…</div>}
      </>
    );
  }

  const target = pending && s.comments.find(comment => comment.id === pending.id);
  return (
    <>
      <PageHeader title="Comments" subtitle="Demo preview — connect Instagram to load your real inbox." right={<DemoBadge />} />
      {loading ? <p className="mb-3 text-xs text-muted-foreground">Checking connection…</p> : null}
      <div className="mb-4 flex gap-2">{(["open", "all"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === f ? "bg-foreground text-background" : "border bg-card"}`}>{f === "open" ? "Needs reply" : "All"}</button>)}</div>
      {demoList.length === 0 ? <Empty icon={<MessageCircle className="h-8 w-8" />} title="Inbox zero" text="No demo comments match this filter." /> : <div className="space-y-3">{demoList.map(comment => <Card key={comment.id} className={comment.hidden ? "opacity-60" : ""}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm"><strong>@{comment.user}</strong> <span className="text-xs text-muted-foreground">on “{demoMedia.find(media => media.id === comment.mediaId)?.caption}” · {comment.date}</span></p><p className="mt-1">{comment.text}</p></div><button onClick={() => setPending({ kind: "hide", id: comment.id, hidden: comment.hidden })} className="rounded-lg p-2 hover:bg-muted" aria-label={comment.hidden ? "Unhide comment" : "Hide comment"}>{comment.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button></div>
        {comment.replies.map((reply, i) => <p key={i} className="mt-2 rounded-xl bg-teal-soft p-2 text-sm text-accent-foreground">↳ {reply}</p>)}
        <div className="mt-3 flex gap-2"><input value={drafts[comment.id] ?? ""} onChange={e => setDrafts({ ...drafts, [comment.id]: e.target.value })} placeholder="Write a reply…" className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><Button disabled={!drafts[comment.id]?.trim()} onClick={() => setPending({ kind: "reply", id: comment.id, text: (drafts[comment.id] ?? "").trim() })}><Reply className="h-4 w-4" /></Button></div>
      </Card>)}</div>}
      <ConfirmDialog open={!!pending} title={pending?.kind === "reply" ? "Post demo reply?" : target?.hidden ? "Unhide demo comment?" : "Hide demo comment?"} summary={pending?.kind === "reply" ? <>Demo reply to <strong>@{target?.user}</strong>: “{pending.text}”</> : <>Demo comment by <strong>@{target?.user}</strong>: “{target?.text}”</>} confirmLabel={pending?.kind === "reply" ? "Save demo reply" : "Confirm"} onCancel={() => setPending(null)} onConfirm={() => {
        if (!pending || !target) return;
        if (pending.kind === "reply") { actions.reply(pending.id, pending.text); setDrafts({ ...drafts, [pending.id]: "" }); actions.log({ action: "comment.reply", detail: `Demo @${target.user}: “${pending.text}”`, status: "success", mode: "DEMO" }); }
        else { actions.toggleHide(pending.id); actions.log({ action: "comment.hide", detail: `Demo ${target.hidden ? "unhid" : "hid"} comment by @${target.user}`, status: "success", mode: "DEMO" }); }
        setPending(null);
      }} />
    </>
  );
}
