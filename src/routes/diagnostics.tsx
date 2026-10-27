import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, Wifi, ExternalLink } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/diagnostics")({
  head: () => ({ meta: [
    { title: "Live Diagnostics — InstaBridge" },
    { name: "description", content: "Check Instagram connection, permissions, media, insights, Stories and hashtag API availability." },
  ] }),
  component: Diagnostics,
});

type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "blocked" | "error";
  detail: string;
  nextStep: string;
  apiCode?: number;
  httpStatus?: number;
};
type DiagnosticResult = {
  connected?: boolean;
  account?: { username?: string | null; accountType?: string | null; tokenExpiresAt?: string | null; scopes?: string[] };
  checks?: Check[];
  checkedAt?: string;
  error?: string;
};

function Diagnostics() {
  const [data, setData] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/public/instagram/diagnostics", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as DiagnosticResult;
      if (!response.ok && response.status !== 503) throw new Error(result.error || "Connect Instagram to run live diagnostics.");
      setData(result);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostics could not be loaded.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const okCount = data?.checks?.filter(check => check.status === "ok").length ?? 0;
  const issueCount = data?.checks?.filter(check => check.status !== "ok").length ?? 0;

  return (
    <>
      <PageHeader title="Live Diagnostics" subtitle="यह page वास्तविक Instagram API calls जाँचता है; sample/demo data को live data नहीं मानता।" right={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>} />
      {error && <div role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!data && loading && <p className="py-8 text-sm text-muted-foreground">Instagram, permissions और data endpoints जाँचे जा रहे हैं…</p>}
      {!data && !loading && <Card><p className="font-semibold">Live account अभी जाँचा नहीं जा सका।</p><p className="mt-1 text-sm text-muted-foreground">पहले connect करें, फिर दोबारा diagnostics चलाएँ।</p><Link to="/connect" className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link></Card>}
      {data && <>
        <Card className="mb-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted"><Wifi className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{data.connected ? `@${data.account?.username || "Instagram account"}` : "No active connection"}</p>
              <p className="text-sm text-muted-foreground">{data.account?.accountType || "Account type unknown"} · Instagram Login</p>
              <p className="mt-2 text-xs text-muted-foreground">{okCount} checks passed · {issueCount} need attention{data.checkedAt ? ` · Checked ${new Date(data.checkedAt).toLocaleString()}` : ""}</p>
            </div>
            <Link to="/connect" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">Connect <ExternalLink className="h-3 w-3" /></Link>
          </div>
        </Card>
        <div className="space-y-3">
          {(data.checks ?? []).map(check => <Card key={check.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{check.status === "ok" ? <CheckCircle2 className="h-5 w-5 text-primary" /> : check.status === "warn" ? <AlertTriangle className="h-5 w-5 text-warning" /> : <XCircle className="h-5 w-5 text-destructive" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{check.label}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${check.status === "ok" ? "bg-teal-soft text-accent-foreground" : check.status === "warn" ? "bg-warning-soft text-foreground" : "bg-destructive/10 text-destructive"}`}>{check.status}</span></div>
                <p className="mt-1 break-words text-sm">{check.detail}</p>
                {check.apiCode !== undefined && <p className="mt-1 text-xs text-muted-foreground">Meta error code: {check.apiCode}{check.httpStatus !== undefined ? ` · HTTP ${check.httpStatus}` : ""}</p>}
                {check.status !== "ok" && <p className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><strong>Next step:</strong> {check.nextStep}</p>}
              </div>
            </div>
          </Card>)}
        </div>
        <Card className="mt-5">
          <h2 className="font-bold">यह report क्या बताती है?</h2>
          <p className="mt-2 text-sm text-muted-foreground">अगर profile और media पास हैं लेकिन Insights fail हैं, तो metric/media type या insights permission जाँचो। अगर Posts पास हैं लेकिन Stories fail हैं, तो current Instagram Login configuration की API सीमा या account eligibility हो सकती है। Hashtag check current login-flow limitation बताता है—AI Chat hashtags सुझा सकता है, लेकिन उन्हें live/trending data कहकर नहीं दिखाएगा।</p>
          <div className="mt-3 flex flex-wrap gap-2"><Link to="/content" className="rounded-xl border px-3 py-2 text-sm font-semibold">Content & insights</Link><Link to="/automation" className="rounded-xl border px-3 py-2 text-sm font-semibold">Automation setup</Link><Link to="/setup" className="rounded-xl border px-3 py-2 text-sm font-semibold">Server setup</Link></div>
        </Card>
      </>}
    </>
  );
}
