import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Check, CircleHelp, Loader2, MessageCircle, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/ai-chat")({
  head: () => ({ meta: [
    { title: "AI Chat — InstaBridge" },
    { name: "description", content: "Chat with an AI assistant to review Instagram data and prepare confirmed actions." },
  ] }),
  component: AiChat,
});

type Message = { role: "user" | "assistant"; content: string };
type ProposedAction =
  | { action: "reply"; comment_id: string; message: string }
  | { action: "hide"; comment_id: string; hidden: boolean }
  | { action: "publish"; media_type: "IMAGE" | "REELS"; media_url: string; caption: string }
  | { action: "generate_image_post"; image_prompt: string; caption: string };

const suggestions = [
  { label: "मेरी profile बताओ", prompt: "मेरी connected Instagram profile और account type बताओ।" },
  { label: "Recent posts", prompt: "मेरी recent Instagram posts और उनके comments/likes का छोटा summary दो।" },
  { label: "Reply draft", prompt: "Recent comments देखकर एक अच्छा, natural reply तैयार करो, लेकिन बिना मेरी confirmation के कुछ भेजना मत।" },
  { label: "Post तैयार करो", prompt: "Instagram पर image post तैयार करने के लिए मुझे क्या-क्या चाहिए, बताओ। अभी publish मत करना।" },
];

function actionTitle(action: ProposedAction): string {
  if (action.action === "reply") return "Instagram comment reply";
  if (action.action === "hide") return action.hidden ? "Hide Instagram comment" : "Unhide Instagram comment";
  if (action.action === "generate_image_post") return "Generate AI image + publish";
  return action.media_type === "IMAGE" ? "Publish image post" : "Publish Reel";
}

function AiChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "नमस्ते! मैं InstaBridge AI हूँ। मैं connected Instagram profile, posts और comments देखने में मदद कर सकता हूँ। Reply, hide या publish जैसे public actions पहले proposal के रूप में दिखेंगे—तुम्हारे Confirm करने से पहले कुछ नहीं भेजूँगा।" },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pending, setPending] = useState<ProposedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/meta/status", { cache: "no-store" })
      .then(async response => ({ ok: response.ok, data: await response.json() as { connected?: boolean } }))
      .then(({ data }) => { if (!cancelled) setConnected(Boolean(data.connected)); })
      .catch(() => { if (!cancelled) setConnected(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, pending, busy]);

  async function send(text = draft) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const next: Message[] = [...messages, { role: "user", content: prompt }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const response = await fetch("/api/public/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = await response.json() as { message?: string; error?: string; action?: ProposedAction | null };
      if (!response.ok) throw new Error(data.error || "AI reply नहीं मिल पाया।");
      setMessages([...next, { role: "assistant", content: data.message || "मुझे जवाब नहीं मिला।" }]);
      setPending(data.action ?? null);
    } catch (err) {
      setMessages(next);
      setError(err instanceof Error ? err.message : "AI chat से connect नहीं हो पाया।");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!pending || actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const isGeneratedImage = pending.action === "generate_image_post";
      const response = await fetch(isGeneratedImage ? "/api/public/ai/image-publish" : "/api/public/instagram/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isGeneratedImage
          ? { prompt: pending.action === "generate_image_post" ? pending.image_prompt : "", caption: pending.action === "generate_image_post" ? pending.caption : "", confirmed: true }
          : { ...pending, confirmed: true }),
      });
      const data = await response.json() as { error?: string; success?: boolean; media_id?: string; media_url?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Instagram action पूरा नहीं हुआ।");
      const successText = isGeneratedImage ? "✅ AI image generate होकर Instagram पर publish हो गई। Media ID: " + (data.media_id || "published") + "." : "✅ Action Instagram को भेज दिया गया है। Activity/Comments page पर भी check कर सकते हो.";
      setMessages(current => [...current, { role: "assistant", content: successText }]);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action पूरा नहीं हुआ।");
    } finally {
      setActionBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <>
      <PageHeader title="AI Chat" subtitle="Instagram management और AI help एक ही जगह—public actions पर हमेशा तुम्हारी confirmation।" />
      {connected === false && <Card className="mb-4 border-warning/40 bg-warning-soft">
        <div className="flex items-start gap-3"><CircleHelp className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">पहले Instagram connect करो</p><p className="mt-1 text-sm">Live profile, comments और actions के लिए एक professional Instagram account connected होना चाहिए।</p><Link to="/connect" className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect Instagram</Link></div></div>
      </Card>}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-primary-foreground"><Bot className="h-5 w-5" /></div><div><p className="font-semibold">InstaBridge Assistant</p><p className="text-xs text-muted-foreground">Instagram tools · action confirmation enabled</p></div></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground"><ShieldCheck className="h-3.5 w-3.5" />Owner controlled</span>
        </div>
        <div className="min-h-[360px] space-y-4 px-4 py-5 sm:px-5">
          {messages.map((message, index) => <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={message.role === "user" ? "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm"}>
              {message.role === "assistant" && <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary"><Sparkles className="h-3 w-3" /> INSTABRIDGE AI</p>}
              {message.content}
            </div>
          </div>)}
          {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Instagram data जाँच रहा हूँ और जवाब तैयार कर रहा हूँ…</div>}
          {pending && <div className="rounded-2xl border border-primary/40 bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2"><p className="font-semibold">{actionTitle(pending)}</p><span className="rounded-full bg-warning-soft px-2 py-1 text-[11px] font-semibold">Confirmation needed</span></div>
            {pending.action === "reply" ? <div className="space-y-2 text-sm"><p className="text-muted-foreground">Comment ID: <code>{pending.comment_id}</code></p><div className="rounded-xl bg-muted p-3">{pending.message}</div></div>
              : pending.action === "hide" ? <p className="text-sm">Comment ID <code>{pending.comment_id}</code> को {pending.hidden ? "hide" : "unhide"} किया जाएगा।</p>
              : pending.action === "generate_image_post" ? <div className="space-y-2 text-sm"><p className="font-semibold">AI image prompt</p><div className="rounded-xl bg-muted p-3">{pending.image_prompt}</div><p className="font-semibold">Instagram caption</p><div className="rounded-xl bg-muted p-3">{pending.caption || "(बिना caption)"}</div><p className="text-xs text-muted-foreground">Confirm करने पर AI image generation, public media upload और Instagram publishing चलेंगे। Image generation API charges लग सकते हैं।</p></div>
              : <div className="space-y-2 text-sm"><p>Type: {pending.media_type}</p><p className="break-all text-muted-foreground">Media URL: {pending.media_url}</p><div className="rounded-xl bg-muted p-3">{pending.caption || "(बिना caption)"}</div><p className="text-xs text-muted-foreground">Instagram को media URL खोलने योग्य public HTTPS URL होना चाहिए।</p></div>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={actionBusy} onClick={() => void confirmAction()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />{actionBusy ? "Sending…" : "Confirm and send"}</button><button type="button" disabled={actionBusy} onClick={() => setPending(null)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><X className="h-4 w-4" />Cancel</button></div>
          </div>}
          {error && <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div ref={bottomRef} />
        </div>
        {messages.length <= 2 && <div className="border-t px-4 py-4 sm:px-5"><p className="mb-2 text-xs font-semibold text-muted-foreground">TRY ASKING</p><div className="flex flex-wrap gap-2">{suggestions.map(s => <button key={s.label} onClick={() => void send(s.prompt)} disabled={busy} className="rounded-full border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">{s.label}</button>)}</div></div>}
        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t bg-background p-3 sm:p-4">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} maxLength={4000} rows={1} placeholder="Instagram के बारे में कुछ पूछो…" className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send message" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
        </form>
      </Card>
      <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Chat ब्राउज़र में रखी जाती है। AI सेवा चालू करने के लिए server secret <code>OPENAI_API_KEY</code> चाहिए। सार्वजनिक reply या post इस पेज से तुम्हारे Confirm दबाने पर ही भेजे जाते हैं।</p></div>
    </>
  );
}
