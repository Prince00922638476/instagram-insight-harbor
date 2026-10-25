import { useEffect, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card p-5 shadow-card ${className}`}>{children}</div>;
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-magenta px-2 py-0.5 text-[10px] font-bold tracking-widest text-magenta-foreground">
      DEMO
    </span>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const btn = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  magenta: "bg-magenta text-magenta-foreground hover:opacity-90",
  outline: "border bg-card hover:bg-muted",
  ghost: "hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btn }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${btn[variant]} ${className}`}
    />
  );
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed p-10 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function ConfirmDialog({
  open,
  title,
  summary,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  summary: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card animate-in slide-in-from-bottom-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <button onClick={onCancel} aria-label="Close" className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-5 text-sm text-muted-foreground">{summary}</div>
        <p className="mb-5 rounded-xl bg-warning-soft p-3 text-xs">
          This is a write action. It will be recorded in the activity log.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="magenta" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
