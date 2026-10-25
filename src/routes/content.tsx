import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  const [q, setQ] = useState("");
  const [type, setType] = useState<"ALL" | Media["type"]>("ALL");
  const [sel, setSel] = useState<Media | null>(demoMedia[0]);
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

function Metric({ icon, label, v }: { icon: React.ReactNode; label: string; v: number }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="font-display text-lg font-bold">{v.toLocaleString()}</p>
    </div>
  );
}
