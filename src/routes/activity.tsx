import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { Card, Empty, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [
    { title: "Activity Log — InstaBridge MCP" },
    { name: "description", content: "Real server-recorded Instagram actions." },
  ] }),
  component: Activity,
});

type Entry = { id: string; action: string; detail: string; status: "success" | "cancelled" | "error"; created_at: string };
const tone = { success: "bg-teal-soft text-accent-foreground", cancelled: "bg-muted text-muted-foreground", error: "bg-destructive/10 text-destructive" };

function Activity() {
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
    <PageHeader title="Activity log" subtitle="Real server-recorded Instagram actions." />
    <Card><p role="alert" className="text-sm text-destructive">{statusError}</p><button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold">Retry</button></Card>
  </>;
  if (connected === null) return <div className="py-10 text-sm text-muted-foreground">Checking activity source…</div>;
  if (!connected) return <>
    <PageHeader title="Activity log" subtitle="Real server-recorded Instagram actions." />
    <Card>
      <h2 className="font-bold">Instagram account not connected</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only real actions recorded by the server appear here. Demo activity and simulated actions are disabled.</p>
      <Link to="/connect" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link>
    </Card>
  </>;
  return <LiveActivity />;
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

