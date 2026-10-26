import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { Button, Card, ConfirmDialog, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { actions, useAppState } from "@/lib/app-store";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [
    { title: "Activity Log — InstaBridge MCP" },
    { name: "description", content: "Audit trail of connection and Instagram write actions." },
  ] }),
  component: Activity,
});

type Entry = { id: string; action: string; detail: string; status: "success" | "cancelled" | "error"; created_at: string };
const tone = { success: "bg-teal-soft text-accent-foreground", cancelled: "bg-muted text-muted-foreground", error: "bg-destructive/10 text-destructive" };

function Activity() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/meta/status", { cache: "no-store" }).then(response => response.json()).then((data: { connected?: boolean }) => { if (!cancelled) setConnected(Boolean(data.connected)); }).catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, []);
  if (connected === null) return <div className="py-10 text-sm text-muted-foreground">Checking activity source…</div>;
  return connected ? <LiveActivity /> : <DemoActivity />;
}

function LiveActivity() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/instagram/activity", { cache: "no-store" })
      .then(async response => { const json = await response.json() as { data?: Entry[]; error?: string }; if (!response.ok) throw new Error(json.error || "Activity log unavailable."); return json.data ?? []; })
      .then(data => { if (!cancelled) setItems(data); })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Activity log unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return <>
    <PageHeader title="Activity log" subtitle="Live write actions recorded by the server." />
    {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading activity…</div>
      : error ? <Card><p className="text-sm text-destructive">{error}</p></Card>
      : items.length === 0 ? <Empty icon={<ScrollText className="h-8 w-8" />} title="No live activity yet" text="Successful comment replies and publishing actions will appear here." />
      : <Card className="p-0"><ul className="divide-y">{items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 p-4"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone[item.status] ?? tone.success}`}>{item.status}</span><code className="text-xs font-semibold">{item.action}</code><span className="flex-1 text-sm">{item.detail}</span><span className="text-xs text-muted-foreground">LIVE · {new Date(item.created_at).toLocaleString()}</span></li>)}</ul></Card>}
  </>;
}

function DemoActivity() {
  const s = useAppState();
  const [reset, setReset] = useState(false);
  return <>
    <PageHeader title="Activity log" subtitle="Demo activity only. Live actions are logged on the server." right={<DemoBadge />} />
    {s.activity.length === 0 ? <Empty icon={<ScrollText className="h-8 w-8" />} title="No demo activity yet" text="Create a demo connector, reply to a demo comment or simulate publishing to see entries here." />
      : <Card className="p-0"><ul className="divide-y">{s.activity.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 p-4"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone[item.status]}`}>{item.status}</span><code className="text-xs font-semibold">{item.action}</code><span className="flex-1 text-sm">{item.detail}</span><span className="text-xs text-muted-foreground">DEMO · {new Date(item.ts).toLocaleString()}</span></li>)}</ul></Card>}
    <ConfirmDialog open={reset} title="Reset demo data?" summary="Clears the demo connector, replies, publish history and local log." confirmLabel="Reset" onCancel={() => setReset(false)} onConfirm={() => { actions.reset(); setReset(false); }} />
    {s.activity.length > 0 && <Button variant="outline" className="mt-4" onClick={() => setReset(true)}>Reset demo</Button>}
  </>;
}
