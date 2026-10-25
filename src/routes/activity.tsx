import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { Button, Card, ConfirmDialog, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — InstaBridge MCP" },
      { name: "description", content: "Audit trail of every connection, publish and comment action." },
      { property: "og:title", content: "Activity Log — InstaBridge MCP" },
      { property: "og:description", content: "Audit trail of every action." },
    ],
  }),
  component: Activity,
});

const tone = { success: "bg-teal-soft text-accent-foreground", cancelled: "bg-muted text-muted-foreground", error: "bg-destructive/10 text-destructive" };

function Activity() {
  const s = useAppState();
  const [reset, setReset] = useState(false);
  return (
    <>
      <PageHeader title="Activity log" subtitle="Every write action, confirmed or cancelled." right={s.activity.length > 0 && <Button variant="outline" onClick={() => setReset(true)}>Reset demo</Button>} />
      {s.activity.length === 0 ? (
        <Empty icon={<ScrollText className="h-8 w-8" />} title="No activity yet" text="Create a connector, reply to a comment or publish a post to see entries here." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {s.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone[a.status]}`}>{a.status}</span>
                <code className="text-xs font-semibold">{a.action}</code>
                <span className="flex-1 text-sm">{a.detail}</span>
                <span className="text-xs text-muted-foreground">{a.mode} · {new Date(a.ts).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmDialog open={reset} title="Reset demo data?" summary="Clears the demo connector, replies, publish history and this log." confirmLabel="Reset" onCancel={() => setReset(false)} onConfirm={() => { actions.reset(); setReset(false); }} />
    </>
  );
}
