import { Link, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";
import { CalendarClock, Library, Plus, Settings } from "lucide-react";
import { LandingThemeToggle, ThemeToggle } from "@/components/theme-toggle";
import { addFiles, useLibrary } from "@/lib/use-library";
import { formatSize } from "@/lib/extract";
import { cn } from "@/lib/utils";

/** Offset for the fixed sidebar: icon rail on small screens, full labels from md up. */
export const appFrameClass = "min-h-screen bg-background pt-6 pl-[4.5rem] md:pl-64";

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-foreground">
      <rect x="4.5" y="2.5" width="13" height="17" rx="1.6" fill="var(--card)" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7" y="5" width="13" height="17" rx="1.6" fill="var(--card)" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10h7M10 13h7M10 16h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader({ className }: { className?: string }) {
  const { docs } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const count = docs?.length ?? 0;
  const bytes = docs?.reduce((sum, doc) => sum + (doc.size || 0), 0) ?? 0;

  const item = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)
      ? "bg-muted font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[4.5rem] flex-col border-r border-border bg-card md:w-64",
        className,
      )}
    >
      <Link to="/" aria-label="Privytrail" className="flex items-center gap-2 px-4 py-5 text-foreground transition-opacity hover:opacity-80 md:px-5">
        <Logo />
        <span className="text-ink-serif hidden text-xl font-semibold md:inline">Privytrail</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-2 text-sm md:px-3">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:justify-start md:px-3"
          aria-label="Add documents"
          onClick={() => input.current?.click()}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Add documents</span>
        </button>
        <Link to="/library" aria-label={`Library, ${count}`} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/library"))}>
          <Library className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Library</span>
          <span className="ml-auto hidden text-xs tabular-nums md:inline">{count}</span>
        </Link>
        <Link to="/dates" aria-label="Important dates" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/dates"))}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Important dates</span>
        </Link>
        <Link to="/settings" aria-label="Settings" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/settings"))}>
          <Settings className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Settings</span>
        </Link>
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 py-3 md:px-3 md:py-4">
        <ThemeToggle showLabel />
        <div className="hidden flex-col gap-1 px-2 text-xs text-muted-foreground md:flex">
          <Link to="/settings" className="hover:text-foreground">
            {docs === null ? "…" : `${formatSize(bytes)} in ${count} ${count === 1 ? "document" : "documents"}`}
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Stored only in this browser
          </Link>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.csv"
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </aside>
  );
}

export function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
        <Logo />
        <span className="text-ink-serif text-xl font-semibold">Privytrail</span>
      </Link>
      <div className="flex items-center gap-2">
        <LandingThemeToggle />
        <Link to="/privacy" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          How your data is handled
        </Link>
      </div>
    </header>
  );
}
