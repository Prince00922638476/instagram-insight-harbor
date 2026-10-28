import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plug, Image as ImageIcon, Eye, MessageCircle } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — InstaBridge MCP" },
      { name: "description", content: "Live overview of your connected Instagram professional account." },
      { property: "og:title", content: "Dashboard — InstaBridge MCP" },
      { property: "og:description", content: "Live Instagram connection, media and metrics." },
    ],
  }),
  component: Dashboard,
});

type LiveMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
};

type LiveStatus = {
  connected?: boolean;
  account?: { username: string | null; accountType: string | null } | null;
  error?: string;
};

function Dashboard() {
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [liveMedia, setLiveMedia] = useState<LiveMedia[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/meta/status", { cache: "no-store", credentials: "same-origin" });
        const status = await response.json() as LiveStatus;
        if (!response.ok) throw new Error(status.error || "Instagram connection status could not be loaded.");
        if (cancelled) return;
        setLive(status);
        if (status.connected) {
          const mediaResponse = await fetch("/api/public/instagram/media?limit=50", { cache: "no-store", credentials: "same-origin" });
          const media = await mediaResponse.json() as { data?: LiveMedia[]; error?: string };
          if (!mediaResponse.ok) throw new Error(media.error || "Could not load live Instagram media.");
          if (!cancelled) setLiveMedia(media.data ?? []);
        }
      } catch (error) {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "Could not load live Instagram data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="py-10 text-sm text-muted-foreground">Checking your live Instagram connection…</div>;

  if (liveError && !live?.connected) {
    return <>
      <PageHeader title="Dashboard" subtitle="Live Instagram account overview." />
      <Card>
        <p role="alert" className="text-sm text-destructive">{liveError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold">Retry</button>
      </Card>
    </>;
  }

  if (!live?.connected) {
    return <>
      <PageHeader title="Dashboard" subtitle="Live overview of your connected Instagram account." />
      <Card className="mb-6">
        <h2 className="font-bold">Instagram account not connected</h2>
        <p className="mt-2 text-sm text-muted-foreground">No sample data is shown. Connect a real Instagram professional account to load live posts and metrics.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/connect" className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link>
          <Link to="/setup" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">Setup guide</Link>
        </div>
      </Card>
    </>;
  }

  const likesComplete = liveMedia.length > 0 && liveMedia.every(media => typeof media.like_count === "number");
  const commentsComplete = liveMedia.length > 0 && liveMedia.every(media => typeof media.comments_count === "number");
  const likes = liveMedia.reduce((sum, media) => sum + (media.like_count ?? 0), 0);
  const comments = liveMedia.reduce((sum, media) => sum + (media.comments_count ?? 0), 0);

  return <>
    <PageHeader title="Dashboard" subtitle="Live overview of your connected Instagram account." />
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold">@{live.account?.username || "Instagram professional account"}</p>
          <p className="text-sm text-muted-foreground">{live.account?.accountType || "Instagram account"} · Connected through official Instagram Login</p>
        </div>
        <Link to="/connect" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold">Connection settings</Link>
      </div>
    </Card>
    {liveError && <Card className="mb-5"><p role="alert" className="text-sm text-destructive">{liveError}</p></Card>}
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat icon={<ImageIcon />} label="Recent media loaded" value={liveMedia.length} />
      <Stat icon={<Eye />} label="Likes on loaded media" value={likesComplete ? likes.toLocaleString() : "Unavailable"} />
      <Stat icon={<MessageCircle />} label="Comments on loaded media" value={commentsComplete ? comments.toLocaleString() : "Unavailable"} />
      <Stat icon={<Plug />} label="Connection" value="Live" />
    </div>
    <h2 className="mb-3 mt-8 text-xl font-bold">Recent posts</h2>
    {liveMedia.length === 0 ? <Card><p className="text-sm text-muted-foreground">Instagram did not return media for this account.</p></Card> : <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
      {liveMedia.slice(0, 12).map(media => <a key={media.id} href={media.permalink || "/content"} target={media.permalink ? "_blank" : undefined} rel={media.permalink ? "noopener noreferrer" : undefined} className="aspect-square overflow-hidden rounded-xl bg-muted">
        {(media.thumbnail_url || media.media_url) ? <img src={media.thumbnail_url || media.media_url} alt={media.caption || "Instagram post"} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center p-2 text-center text-xs">Media preview unavailable</div>}
      </a>)}
    </div>}
  </>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <Card className="p-4">
    <div className="mb-2 h-5 w-5 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
    <p className="font-display text-2xl font-bold">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </Card>;
}
