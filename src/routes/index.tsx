import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plug, Users, Image as ImageIcon, Eye, MessageCircle, ArrowRight, Server } from "lucide-react";
import { Card, DemoBadge, PageHeader, Skeleton } from "@/components/ui-kit";
import { demoAccount, demoMedia, weeklyReach } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { useMetaConfig } from "@/lib/use-mode";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — InstaBridge MCP" },
      { name: "description", content: "Overview of your Instagram professional account connection, insights and MCP tools." },
      { property: "og:title", content: "Dashboard — InstaBridge MCP" },
      { property: "og:description", content: "Overview of your Instagram connection, insights and MCP tools." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useAppState();
  const cfg = useMetaConfig();
  const [live, setLive] = useState<{ connected: boolean; account?: { username: string | null; accountType: string | null } | null } | null>(null);
  const [liveMedia, setLiveMedia] = useState<Array<{ id: string; caption?: string; permalink?: string; media_url?: string; thumbnail_url?: string; media_type?: string; like_count?: number; comments_count?: number }>>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoaded, setLiveLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/meta/status", { cache: "no-store" });
        const status = await response.json() as { connected?: boolean; account?: { username: string | null; accountType: string | null } | null };
        if (cancelled) return;
        setLive({ connected: Boolean(status.connected), account: status.account ?? null });
        if (status.connected) {
          const mediaResponse = await fetch("/api/public/instagram/media?limit=50", { cache: "no-store" });
          const media = await mediaResponse.json() as { data?: Array<{ id: string; caption?: string; permalink?: string; media_url?: string; thumbnail_url?: string; media_type?: string; like_count?: number; comments_count?: number }>; error?: string };
          if (!mediaResponse.ok) throw new Error(media.error || "Could not load Instagram media.");
          if (!cancelled) setLiveMedia(media.data ?? []);
        }
      } catch (error) {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "Could not load live Instagram data.");
      } finally { if (!cancelled) setLiveLoaded(true); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  const open = s.comments.filter((c) => c.replies.length === 0 && !c.hidden).length;
  const max = Math.max(...weeklyReach);

  if (live?.connected) {
    const likes = liveMedia.reduce((sum, media) => sum + (media.like_count ?? 0), 0);
    const comments = liveMedia.reduce((sum, media) => sum + (media.comments_count ?? 0), 0);
    return <>
      <PageHeader title="Dashboard" subtitle="Live overview of your connected Instagram account." />
      <Card className="mb-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-display text-xl font-bold">@{live.account?.username || "Instagram professional account"}</p><p className="text-sm text-muted-foreground">{live.account?.accountType || "Instagram account"} · Connected through official Instagram Login</p></div><Link to="/connect" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold">Connection settings</Link></div></Card>
      {liveError && <Card className="mb-5"><p className="text-sm text-destructive">{liveError}</p></Card>}
      {!liveLoaded ? <p className="py-8 text-sm text-muted-foreground">Loading live Instagram data…</p> : <>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat icon={<ImageIcon />} label="Recent media loaded" value={liveMedia.length} /><Stat icon={<Eye />} label="Likes on loaded media" value={likes.toLocaleString()} /><Stat icon={<MessageCircle />} label="Comments on loaded media" value={comments.toLocaleString()} /><Stat icon={<Plug />} label="Connection" value="Live" /></div>
        <h2 className="mb-3 mt-8 text-xl font-bold">Recent posts</h2>
        {liveMedia.length === 0 ? <Card><p className="text-sm text-muted-foreground">No media was returned by Instagram for this account.</p></Card> : <div className="grid grid-cols-3 gap-2 md:grid-cols-6">{liveMedia.slice(0, 12).map(media => <a key={media.id} href={media.permalink || "/content"} target={media.permalink ? "_blank" : undefined} rel={media.permalink ? "noopener noreferrer" : undefined} className="aspect-square overflow-hidden rounded-xl bg-muted">{(media.thumbnail_url || media.media_url) ? <img src={media.thumbnail_url || media.media_url} alt={media.caption || "Instagram post"} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center p-2 text-center text-xs">Media preview unavailable</div>}</a>)}</div>}
      </>}
    </>;
  }
  if (live === null && !liveLoaded) return <div className="py-10 text-sm text-muted-foreground">Checking Instagram connection…</div>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your Instagram ↔ MCP bridge at a glance." right={<DemoBadge />} />

      {cfg.isLoading ? (
        <Skeleton className="mb-6 h-20" />
      ) : !cfg.data?.configured ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-magenta/30 bg-magenta-soft p-4">
          <p className="text-sm">
            <strong>Demo mode.</strong> Meta credentials aren't configured, so everything below is sample data.
          </p>
          <Link to="/setup" className="text-sm font-semibold text-magenta">Setup guide →</Link>
        </div>
      ) : null}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand font-display text-xl font-bold text-primary-foreground">
              {demoAccount.name[0]}
            </div>
            <div>
              <p className="font-display text-xl font-bold">@{demoAccount.username}</p>
              <p className="text-sm text-muted-foreground">{demoAccount.type} account</p>
            </div>
          </div>
          {s.connector.connected ? (
            <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-accent-foreground">
              ● Connected as “{s.connector.serverName}”
            </span>
          ) : (
            <Link to="/connect" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plug className="h-4 w-4" /> Connect account
            </Link>
          )}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Users />} label="Followers" value={demoAccount.followers.toLocaleString()} />
        <Stat icon={<ImageIcon />} label="Media" value={demoAccount.mediaCount} />
        <Stat icon={<Eye />} label="Reach (7d)" value={weeklyReach.reduce((a, b) => a + b).toLocaleString()} />
        <Stat icon={<MessageCircle />} label="Unanswered" value={open} />
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
          <h2 className="mb-4 font-bold">Reach, last 7 days</h2>
          <div className="flex h-40 items-end gap-2">
            {weeklyReach.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-lg bg-brand" style={{ height: `${(v / max) * 100}%` }} />
                <span className="text-[10px] text-muted-foreground">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h2 className="font-bold">MCP tools</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              ["get_profile", "read"],
              ["list_media", "read"],
              ["get_media_insights", "read"],
              ["list_comments", "read"],
              ["reply_to_comment", "write"],
              ["publish_media", "write"],
            ].map(([n, k]) => (
              <li key={n} className="flex items-center justify-between">
                <code className="text-xs">{n}</code>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${k === "write" ? "bg-magenta-soft text-magenta" : "bg-teal-soft text-accent-foreground"}`}>
                  {k}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/setup" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Server scaffold <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-xl font-bold">Recent posts</h2>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {demoMedia.map((m) => (
          <Link key={m.id} to="/content" className="aspect-square rounded-xl" style={{ background: `linear-gradient(135deg, oklch(0.7 0.12 ${m.hue}), oklch(0.5 0.15 ${m.hue + 40}))` }} aria-label={m.caption} />
        ))}
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-2 h-5 w-5 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
