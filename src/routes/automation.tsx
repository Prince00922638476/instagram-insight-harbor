import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Save, Send, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/automation")({
  head: () => ({ meta: [
    { title: "Automation — InstaBridge" },
    { name: "description", content: "Set keyword-triggered Instagram comment replies and review AI-generated drafts." },
  ] }),
  component: Automation,
});

type Settings = {
  enabled: boolean;
  mode: "draft" | "auto";
  trigger_keyword: string;
  reply_instruction: string;
  updated_at?: string;
};
type Draft = {
  id: string;
  comment_id: string;
  media_id: string;
  commenter_username: string;
  comment_text: string;
  suggested_reply: string;
  status: "pending" | "sending" | "needs_review";
  created_at: string;
};
type Status = {
  settings: Settings;
  connected: boolean;
  commentPermission: boolean;
  aiConfigured: boolean;
  webhookConfigured: boolean;
};

const defaultSettings: Settings = {
  enabled: false,
  mode: "draft",
  trigger_keyword: "INFO",
  reply_instruction: "Write a short, helpful, friendly reply in the same language as the comment. Do not make promises, invent prices, or request personal information.",
};

function Automation() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [serverStatus, setServerStatus] = useState<Omit<Status, "settings"> | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, draftsResponse] = await Promise.all([
        fetch("/api/public/instagram/automation/settings", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/public/instagram/automation/drafts", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const settingsData = await settingsResponse.json() as Partial<Status> & { settings?: Settings; error?: string };
      const draftsData = await draftsResponse.json() as { drafts?: Draft[]; error?: string };
      if (!settingsResponse.ok) throw new Error(settingsData.error || "Automation settings load नहीं हुईं।");
      if (!draftsResponse.ok) throw new Error(draftsData.error || "Reply queue load नहीं हुई।");
      setSettings({ ...defaultSettings, ...(settingsData.settings ?? {}) });
      setServerStatus({
        connected: Boolean(settingsData.connected),
        commentPermission: Boolean(settingsData.commentPermission),
        aiConfigured: Boolean(settingsData.aiConfigured),
        webhookConfigured: Boolean(settingsData.webhookConfigured),
      });
      setDrafts(draftsData.drafts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Automation data load नहीं हुआ।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/public/instagram/automation/settings", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json() as { error?: string; settings?: Settings };
      if (!response.ok) throw new Error(data.error || "Settings save नहीं हुईं।");
      if (data.settings) setSettings({ ...defaultSettings, ...data.settings });
      setNotice("Settings save हो गईं। Meta webhook में comments subscription भी चालू होना चाहिए।");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings save नहीं हुईं।");
    } finally {
      setSaving(false);
    }
  }

  async function handleDraft(id: string, action: "send" | "dismiss") {
    setDraftBusy(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/public/instagram/automation/drafts", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, message: editedReplies[id] }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Draft action पूरा नहीं हुआ।");
      setNotice(action === "send" ? "Reply Instagram पर भेज दिया गया।" : "Draft हटा दिया गया।");
      setDrafts(current => current.filter(item => item.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Draft action पूरा नहीं हुआ।";
      // Reload status after an ambiguous send failure so the UI never leaves a
      // possibly-sent reply looking like a normal, safely retryable pending draft.
      await load();
      setError(message);
    } finally {
      setDraftBusy(null);
    }
  }

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/instagram/webhook` : "/api/public/instagram/webhook";

  return (
    <>
      <PageHeader title="Automation" subtitle="Keyword-triggered comment replies. Draft mode is safer; auto-send is opt-in and only runs for matching comments." right={<button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button>} />
      {error && <div role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-teal-soft p-3 text-sm text-accent-foreground">{notice}</div>}
      {loading ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Automation settings load हो रही हैं…</div> : <>
        <Card className="mb-5">
          <div className="mb-4 flex items-center gap-2"><Workflow className="h-5 w-5 text-primary" /><h2 className="font-bold">Connection checks</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusItem ok={Boolean(serverStatus?.connected)} label="Instagram account connected" />
            <StatusItem ok={Boolean(serverStatus?.commentPermission)} label="Comment permission approved" />
            <StatusItem ok={Boolean(serverStatus?.aiConfigured)} label="AI provider key configured" />
            <StatusItem ok={Boolean(serverStatus?.webhookConfigured)} label="Webhook secrets configured" />
          </div>
          {!serverStatus?.connected && <p className="mt-4 text-sm">पहले <Link to="/connect" className="font-semibold text-primary underline">Connect Instagram</Link> खोलकर account connect करो।</p>}
          {!serverStatus?.aiConfigured && <p className="mt-2 text-sm text-muted-foreground">AI replies के लिए Cloudflare Worker secret <code>OPENAI_API_KEY</code> जोड़ना होगा। Key को chat या GitHub में मत डालना।</p>}
          {!serverStatus?.webhookConfigured && <p className="mt-2 text-sm text-muted-foreground">Draft और Auto दोनों modes के लिए Cloudflare Worker secrets <code>META_WEBHOOK_VERIFY_TOKEN</code> और <code>META_APP_SECRET</code> भी जरूरी हैं।</p>}
        </Card>

        <Card className="mb-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold">Comment reply rule</h2><p className="mt-1 text-sm text-muted-foreground">जब comment में trigger keyword होगा तभी rule चलेगा।</p></div><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings(s => ({ ...s, enabled: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />Enabled</label></div>
          <label className="mb-2 block text-sm font-semibold">Trigger keyword</label>
          <input value={settings.trigger_keyword} onChange={e => setSettings(s => ({ ...s, trigger_keyword: e.target.value.slice(0, 80) }))} maxLength={80} placeholder="INFO" className="mb-4 w-full rounded-xl border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <p className="mb-4 text-xs text-muted-foreground">उदाहरण: keyword <code>INFO</code> होने पर “Please INFO” जैसे comment match होंगे। सभी comments पर reply करने वाला rule नहीं है, ताकि अनचाहे replies न जाएँ। Keyword match होने पर उस comment का text और username AI reply बनाने के लिए OpenAI को भेजा जाएगा।</p>
          <label className="mb-2 block text-sm font-semibold">Reply mode</label>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setSettings(s => ({ ...s, mode: "draft" }))} className={`rounded-xl border p-3 text-left ${settings.mode === "draft" ? "border-primary bg-teal-soft" : "bg-background"}`}><p className="font-semibold">Prepare drafts</p><p className="mt-1 text-xs text-muted-foreground">AI reply queue में draft बनाएगा। तुम edit करके Send दबाओगे।</p></button>
            <button type="button" onClick={() => setSettings(s => ({ ...s, mode: "auto" }))} className={`rounded-xl border p-3 text-left ${settings.mode === "auto" ? "border-primary bg-warning-soft" : "bg-background"}`}><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Auto-send</p><p className="mt-1 text-xs text-muted-foreground">Keyword match होते ही AI public reply भेजेगा। हर reply की अलग confirmation नहीं होगी।</p></button>
          </div>
          <label className="mb-2 block text-sm font-semibold">AI reply instructions</label>
          <textarea value={settings.reply_instruction} onChange={e => setSettings(s => ({ ...s, reply_instruction: e.target.value.slice(0, 600) }))} maxLength={600} rows={3} className="mb-4 w-full rounded-xl border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          {settings.mode === "auto" && <div className="mb-4 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm"><p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Public replies automatic होंगे</p><p className="mt-1">यह केवल matching keyword वाले नए comments पर लागू होगा। पहले अपने test account पर जाँचो। Auto-send के लिए Meta webhook subscription, सही secrets, AI key और migration 0002 जरूरी हैं।</p></div>}
          <button onClick={() => void saveSettings()} disabled={saving || !settings.trigger_keyword.trim() || !settings.reply_instruction.trim()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save automation settings"}</button>
        </Card>

        <Card className="mb-5">
          <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">Meta webhook setup</h2></div>
          <p className="mb-2 text-sm text-muted-foreground">Webhook server-side पर चलता है—browser बंद होने पर भी Meta event भेजे तो rule चल सकता है। Meta Developer Dashboard में app के Webhooks में Instagram object और <code>comments</code> field subscribe करनी होगी।</p>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Callback URL</label>
          <div className="break-all rounded-xl bg-muted p-3 font-mono text-xs">{webhookUrl}</div>
          <p className="mb-2 mt-3 text-xs text-muted-foreground">Verify token: Cloudflare Worker secret <code>META_WEBHOOK_VERIFY_TOKEN</code> में अपना random token set करो और Meta dashboard में वही token डालो। Meta App Secret और AI key केवल server secrets में रहें।</p>
          <p className="text-xs text-muted-foreground">इसके बाद Supabase में <code>drizzle/migrations/0002_instagram_automation.sql</code> एक बार run करना है।</p>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold">Reply approval queue</h2><p className="mt-1 text-sm text-muted-foreground">नए matching comments के AI drafts यहाँ आएँगे।</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{drafts.length} pending</span></div>
          {drafts.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><Clock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="text-sm font-semibold">अभी कोई pending draft नहीं है</p><p className="mt-1 text-xs text-muted-foreground">Keyword वाला नया comment आने पर, webhook setup और rule enable होने के बाद draft यहाँ दिखेगा।</p></div>
            : <div className="space-y-4">{drafts.map(item => <div key={item.id} className="rounded-xl border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">@{item.commenter_username || "instagram-user"}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></div>
              <p className="mb-2 rounded-lg bg-muted p-3 text-sm">{item.comment_text}</p>
              {item.status !== "pending" && <p role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs">{item.status === "sending" ? "Reply request अभी process हो रही है। दोबारा Send मत करो; कुछ देर बाद Refresh करो।" : "Reply भेजी गई हो सकती है, लेकिन final status confirm नहीं हुआ। पहले Instagram comments जाँचो; यह draft दोबारा send नहीं किया जा सकता।"}</p>}
              <label className="mb-1 block text-xs font-semibold">AI reply (edit before sending)</label>
              <textarea value={editedReplies[item.id] ?? item.suggested_reply} onChange={e => setEditedReplies(current => ({ ...current, [item.id]: e.target.value }))} maxLength={1000} rows={2} disabled={item.status !== "pending"} className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
              <div className="mt-3 flex flex-wrap gap-2">{item.status === "pending" && <button disabled={draftBusy === item.id || !(editedReplies[item.id] ?? item.suggested_reply).trim()} onClick={() => void handleDraft(item.id, "send")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" />{draftBusy === item.id ? "Working…" : "Send reply"}</button>}{item.status !== "sending" && <button disabled={draftBusy === item.id} onClick={() => void handleDraft(item.id, "dismiss")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"><Trash2 className="h-4 w-4" />Dismiss</button>}</div>
            </div>)}</div>}
        </Card>
      </>}
    </>
  );
}

function StatusItem({ ok, label }: { ok: boolean; label: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm"><span>{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-warning" />}</span><span>{label}</span><span className="ml-auto text-xs text-muted-foreground">{ok ? "Ready" : "Missing"}</span></div>;
}
