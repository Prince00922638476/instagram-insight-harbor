import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { LayoutGrid, Plug, Image, Send, MessageCircle, ScrollText, BookOpen, Bot } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "InstaBridge MCP" },
      { name: "description", content: "Connect an Instagram professional account to AI assistants via MCP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const nav = [
  { to: "/", label: "Home", icon: LayoutGrid },
  { to: "/connect", label: "Connect", icon: Plug },
  { to: "/content", label: "Content", icon: Image },
  { to: "/publish", label: "Publish", icon: Send },
  { to: "/comments", label: "Comments", icon: MessageCircle },
  { to: "/ai-chat", label: "AI Chat", icon: Bot },
  { to: "/activity", label: "Activity", icon: ScrollText },
  { to: "/setup", label: "Setup", icon: BookOpen },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen md:flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card p-5 md:flex">
          <Brand />
          <nav className="mt-8 flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted data-[status=active]:bg-teal-soft data-[status=active]:text-accent-foreground"
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </nav>
          <p className="mt-auto text-xs text-muted-foreground">Uses Meta's official Instagram API only. Live integration pending setup.</p>
        </aside>
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <Brand />
          <Link to="/setup" className="text-sm font-medium text-primary">Setup</Link>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-10 md:pt-10">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-card md:hidden">
          {nav.slice(0, 6).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground data-[status=active]:text-primary"
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </QueryClientProvider>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-display text-sm font-extrabold text-primary-foreground">IB</span>
      <span className="font-display text-lg font-bold">InstaBridge</span>
    </Link>
  );
}
