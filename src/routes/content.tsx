import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Eye, Bookmark, Search, ImageOff } from "lucide-react";
import { Card, DemoBadge, Empty, PageHeader } from "@/components/ui-kit";
import { demoMedia, type Media } from "@/lib/demo-data";

export const Route = createFileRoute("/content")({
  head: () => ({
    meta: [
      { title: "Content & Insights — InstaBridge MCP" },
      { name: "description", content: "Browse Instagram posts and reels with reach, likes, saves and comments." },
      { property: "og:title", content: "Content & Insights — InstaBridge MCP" },
      { property: "og:description", content: "Post and reel insights from the Instagram Graph API." },
    ],
  }),
  component: Content,
});

function Content() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/meta/status", { cache: "no-store" }).then(response => response.json()).then((data: { connected?: boolean }) => { if (!cancelled) setConnected(Boolean(data.connected)); }).catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, []);
  if (connected === null) return <div className="py-10 text-sm text-muted-foreground">Checking Instagram connection…</div>;
  if (connected) return <LiveContent />;
  const [q, setQ] = useState("");
  const [type, setType] = useState<"ALL" | Media["type"]>("ALL");
  const [sel, setSel] = useState<Media | null>(demoMedia[0] ?? null);
  const list = demoMedia.filter((m) => (type === "ALL" || m.type === type) && m.caption.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Content & insights" subtitle="Read-only via instagram_business_basic + manage_insights." right={<DemoBadge />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search captions" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </div>
        {(["ALL", "IMAGE", "REEL", "CAROUSEL"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${type === t ? "bg-foreground text-background" : "border bg-card"}`}>
            {t}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty icon={<ImageOff className="h-8 w-8" />} title="No media found" text="Try a different search or filter." />
      ) : (
        <div className="grid gap-6 md:grid-cols-5">
          <div className="grid grid-cols-2 gap-3 md:col-span-3 md:grid-cols-3">
            {list.map((m) => (
              <button key={m.id} onClick={() => setSel(m)} className={`overflow-hidden rounded-2xl border bg-card text-left ${sel?.id === m.id ? "ring-2 ring-primary" : ""}`}>
                <div className="relative aspect-square" style={{ background: `linear-gradient(135deg, oklch(0.7 0.12 ${m.hue}), oklch(0.5 0.15 ${m.hue + 40}))` }}>
                  <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-bold">{m.type}</span>
                </div>
                <p className="truncate p-2 text-xs">{m.caption}</p>
              </button>
            ))}
          </div>
          {sel && (
            <Card className="h-fit md:col-span-2 md:sticky md:top-6">
              <p className="text-xs text-muted-foreground">{sel.date} · {sel.type}</p>
              <p className="mt-1 font-semibold">{sel.caption}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric icon={<Eye className="h-4 w-4" />} label="Reach" v={sel.reach} />
                <Metric icon={<Heart className="h-4 w-4" />} label="Likes" v={sel.likes} />
                <Metric icon={<MessageCircle className="h-4 w-4" />} label="Comments" v={sel.comments} />
                <Metric icon={<Bookmark className="h-4 w-4" />} label="Saves" v={sel.saves} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Engagement rate: {(((sel.likes + sel.comments + sel.saves) / sel.reach) * 100).toFixed(1)}%</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

type LiveMedia = {
  id: string; caption?: string; media_type?: string; media_product_type?: string;
  media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string;
  like_count?: number; comments_count?: number;
};
type Insight = { name?: string; values?: Array<{ value?: number }> };

function LiveContent() {
  const [items, setItems] = useState<LiveMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "IMAGE" | "REEL" | "CAROUSEL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/instagram/media?limit=50", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { data?: LiveMedia[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load Instagram media.");
        return data.data ?? [];
      })
      .then(data => { if (!cancelled) { setItems(data); setSelectedId(data[0]?.id ?? null); setError(null); } })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Could not load Instagram media."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = items.filter(item => {
    const type = item.media_product_type === "REELS" ? "REEL" : item.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : item.media_type === "VIDEO" ? "REEL" : item.media_type ?? "IMAGE";
    return (filter === "ALL" || filter === type) && (item.caption ?? "").toLowerCase().includes(query.toLowerCase());
  });
  const selected = filtered.find(item => item.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected?.id) { setInsights([]); return; }
    let cancelled = false;
    fetch(`/api/public/instagram/insights?media_id=${encodeURIComponent(selected.id)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { data?: Insight[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Insights not available for this media item.");
        return data.data ?? [];
      })
      .then(data => { if (!cancelled) { setInsights(data); setInsightError(null); } })
      .catch(error => { if (!cancelled) { setInsights([]); setInsightError(error instanceof Error ? error.message : "Insights not available."); } });
    return () => { cancelled = true; };
  }, [selected?.id]);

  return <>
    <PageHeader title="Content & insights" subtitle="Live posts and reels from your connected Instagram professional account." />
    <div className="mb-4 flex flex-wrap gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-xl border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search captions" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div>
      {(["ALL", "IMAGE", "REEL", "CAROUSEL"] as const).map(type => <button key={type} onClick={() => setFilter(type)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === type ? "bg-foreground text-background" : "border bg-card"}`}>{type}</button>)}
    </div>
    {loading ? <div className="py-10 text-sm text-muted-foreground">Loading Instagram media…</div>
      : error ? <Card><p className="text-sm text-destructive">{error}</p><p className="mt-2 text-xs text-muted-foreground">Check Instagram permissions and reconnect if necessary.</p></Card>
      : filtered.length === 0 ? <Empty icon={<ImageOff className="h-8 w-8" />} title="No media found" text="This Instagram account has no matching recent posts, or the search/filter excludes them." />
      : <div className="grid gap-6 md:grid-cols-5">
        <div className="grid grid-cols-2 gap-3 md:col-span-3 md:grid-cols-3">{filtered.map(item => {
          const type = item.media_product_type === "REELS" ? "REEL" : item.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : item.media_type === "VIDEO" ? "REEL" : item.media_type ?? "IMAGE";
          return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`overflow-hidden rounded-2xl border bg-card text-left ${selected?.id === item.id ? "ring-2 ring-primary" : ""}`}>
            <div className="relative aspect-square bg-muted">{(item.thumbnail_url || item.media_url) ? <img src={item.thumbnail_url || item.media_url} alt={item.caption ?? "Instagram media"} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">Media preview unavailable</div>}<span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-bold">{type}</span></div>
            <p className="truncate p-2 text-xs">{item.caption || "(no caption)"}</p>
          </button>;
        })}</div>
        {selected && <Card className="h-fit md:col-span-2 md:sticky md:top-6">
          <p className="text-xs text-muted-foreground">{selected.timestamp ? new Date(selected.timestamp).toLocaleString() : "Instagram media"}</p>
          <p className="mt-1 font-semibold">{selected.caption || "(no caption)"}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={<Heart className="h-4 w-4" />} label="Likes" v={selected.like_count ?? 0} />
            <Metric icon={<MessageCircle className="h-4 w-4" />} label="Comments" v={selected.comments_count ?? 0} />
            {insights.map(item => <Metric key={item.name} icon={<Eye className="h-4 w-4" />} label={item.name ?? "Metric"} v={Number(item.values?.[0]?.value ?? 0)} />)}
          </div>
          {insightError && <p className="mt-3 text-xs text-muted-foreground">{insightError}</p>}
          {selected.permalink && <a href={selected.permalink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-primary">Open post on Instagram ↗</a>}
        </Card>}
      </div>}
  </>;
}

function Metric({ icon, label, v }: { icon: React.ReactNode; label: string; v: number }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="font-display text-lg font-bold">{v.toLocaleString()}</p>
    </div>
  );
}
