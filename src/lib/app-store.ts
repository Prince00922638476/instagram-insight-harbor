import { useSyncExternalStore } from "react";
import { demoComments, type Comment } from "./demo-data";

export type Activity = {
  id: string;
  ts: string;
  action: string;
  detail: string;
  status: "success" | "cancelled" | "error";
  mode: "DEMO" | "LIVE";
};

export type Draft = { id: string; kind: "IMAGE" | "REEL"; mediaUrl: string; caption: string; status: "published" | "failed"; ts: string };

export type ConnectorConfig = {
  serverName: string;
  icon: string | null;
  scopes: string[];
  consent: boolean;
  connected: boolean;
};

type State = {
  connector: ConnectorConfig;
  activity: Activity[];
  comments: Comment[];
  drafts: Draft[];
};

const KEY = "instabridge-demo-v1";
const initial: State = {
  connector: { serverName: "", icon: null, scopes: [], consent: false, connected: false },
  activity: [],
  comments: demoComments,
  drafts: [],
};

let state: State = initial;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...initial, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt demo state */
  }
}

function set(fn: (s: State) => State) {
  state = fn(state);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full; demo only */
  }
  listeners.forEach((l) => l());
}

export function useAppState() {
  return useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      queueMicrotask(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => initial,
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const actions = {
  log(a: Omit<Activity, "id" | "ts">) {
    set((s) => ({ ...s, activity: [{ ...a, id: uid(), ts: new Date().toISOString() }, ...s.activity].slice(0, 200) }));
  },
  saveConnector(c: ConnectorConfig) {
    set((s) => ({ ...s, connector: c }));
  },
  disconnect() {
    set((s) => ({ ...s, connector: { ...s.connector, connected: false } }));
  },
  reply(commentId: string, text: string) {
    set((s) => ({ ...s, comments: s.comments.map((c) => (c.id === commentId ? { ...c, replies: [...c.replies, text] } : c)) }));
  },
  toggleHide(commentId: string) {
    set((s) => ({ ...s, comments: s.comments.map((c) => (c.id === commentId ? { ...c, hidden: !c.hidden } : c)) }));
  },
  addDraft(d: Omit<Draft, "id" | "ts">) {
    set((s) => ({ ...s, drafts: [{ ...d, id: uid(), ts: new Date().toISOString() }, ...s.drafts] }));
  },
  reset() {
    set(() => initial);
  },
};

export const ALL_SCOPES = [
  { id: "instagram_business_basic", label: "Read profile & media", write: false },
  { id: "instagram_business_manage_insights", label: "Read insights", write: false },
  { id: "instagram_business_manage_comments", label: "Read & reply to comments", write: true },
  { id: "instagram_business_content_publish", label: "Publish posts & reels", write: true },
];
