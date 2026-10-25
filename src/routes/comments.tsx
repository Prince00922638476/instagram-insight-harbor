import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle, EyeOff, Eye, Reply } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";
import { demoMedia } from "@/lib/demo-data";

export const Route = createFileRoute("/comments")({
  head: () => ({
    meta: [
      { title: "Comments Inbox — InstaBridge MCP" },
      { name: "description", content: "Read and reply to Instagram comments with confirmation before every reply." },
      { property: "og:title", content: "Comments Inbox — InstaBridge MCP" },
      { property: "og:description", content: "Comment inbox with confirmed replies." },
    ],
  }),
  component: Comments,
});

type Pending = { kind: "reply"; id: string; text: string } | { kind: "hide"; id: string };

function Comments() {
  const s = useAppState();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const list = s.comments.filter((c) => filter === "all" || (c.replies.length === 0 && !c.hidden));
  const target = pending && s.comments.find((c) => c.id === pending.id);

  return (
    <>
      <PageHeader title="Comments" subtitle="Requires instagram_business_manage_comments." right={<DemoBadge />} />
      <div className="mb-4 flex gap-2">
        {(["open", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === f ? "bg-foreground text-background" : "border bg-card"}`}>
            {f === "open" ? "Needs reply" : "All"}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon={<MessageCircle className="h-8 w-8" />} title="Inbox zero" text="Every comment has a reply. Nice work." />
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <Card key={c.id} className={c.hidden ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm"><strong>@{c.user}</strong> <span className="text-xs text-muted-foreground">on “{demoMedia.find((m) => m.id === c.mediaId)?.caption}” · {c.date}</span></p>
                  <p className="mt-1">{c.text}</p>
                </div>
                <button onClick={() => setPending({ kind: "hide", id: c.id })} className="rounded-lg p-2 hover:bg-muted" aria-label={c.hidden ? "Unhide comment" : "Hide comment"}>
                  {c.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              {c.replies.map((r, i) => (
                <p key={i} className="mt-2 rounded-xl bg-teal-soft p-2 text-sm text-accent-foreground">↳ {r}</p>
              ))}
              <div className="mt-3 flex gap-2">
                <input
                  value={drafts[c.id] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                  placeholder="Write a reply…"
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button disabled={!drafts[c.id]?.trim()} onClick={() => setPending({ kind: "reply", id: c.id, text: (drafts[c.id] ?? "").trim() })}>
                  <Reply className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === "reply" ? "Post public reply?" : target?.hidden ? "Unhide comment?" : "Hide comment?"}
        summary={pending?.kind === "reply" ? <>Reply to <strong>@{target?.user}</strong>: “{pending.text}”</> : <>Comment by <strong>@{target?.user}</strong>: “{target?.text}”</>}
        confirmLabel={pending?.kind === "reply" ? "Post reply" : "Confirm"}
        onCancel={() => {
          actions.log({ action: pending?.kind === "reply" ? "comment.reply" : "comment.hide", detail: "Cancelled by user", status: "cancelled", mode: "DEMO" });
          setPending(null);
        }}
        onConfirm={() => {
          if (!pending || !target) return;
          if (pending.kind === "reply") {
            actions.reply(pending.id, pending.text);
            setDrafts({ ...drafts, [pending.id]: "" });
            actions.log({ action: "comment.reply", detail: `@${target.user}: “${pending.text}”`, status: "success", mode: "DEMO" });
          } else {
            actions.toggleHide(pending.id);
            actions.log({ action: "comment.hide", detail: `${target.hidden ? "Unhid" : "Hid"} comment by @${target.user}`, status: "success", mode: "DEMO" });
          }
          setPending(null);
        }}
      />
    </>
  );
}
