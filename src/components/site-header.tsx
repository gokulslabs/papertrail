import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { CalendarClock, Library, Plus, Settings, Wallet } from "lucide-react";
import { InstallAppButton } from "@/components/install-app";
import { LandingThemeToggle, ThemeToggle } from "@/components/theme-toggle";
import { addFiles, useLibrary } from "@/lib/use-library";
import { formatSize } from "@/lib/extract";
import { cn } from "@/lib/utils";
import { BUILT_IN_CATEGORIES, countByCategory } from "@/lib/categories";
import { libraryFilterMatchesParam, needsAttention } from "@/lib/library-view";

/** Offset for the fixed sidebar: icon rail on small screens, full labels from md up. */
export const appFrameClass = "min-h-screen bg-background pt-6 pl-[4.5rem] md:pl-64";

/** Landmark id for the skip-to-content link in the app shell. */
export const MAIN_CONTENT_ID = "content";

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-foreground">
      <rect x="4.5" y="2.5" width="13" height="17" rx="1.6" fill="var(--card)" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7" y="5" width="13" height="17" rx="1.6" fill="var(--card)" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10h7M10 13h7M10 16h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SidebarFilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function SiteHeader({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { docs } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const count = docs?.length ?? 0;
  const bytes = docs?.reduce((sum, doc) => sum + (doc.size || 0), 0) ?? 0;

  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const activeCategory = searchParams.get("category") ?? undefined;
  const activeTag = searchParams.get("tag") ?? undefined;

  const attentionCount = useMemo(() => (docs ?? []).filter(needsAttention).length, [docs]);

  const categoryItems = useMemo(() => {
    if (!docs?.length) return [];
    const counts = countByCategory(docs);
    const uncategorized = docs.filter((doc) => !doc.category.trim()).length;
    const items: { key: string; label: string; count: number; order: number }[] = [];
    if (uncategorized > 0) {
      items.push({ key: "__none__", label: "Uncategorized", count: uncategorized, order: -1 });
    }
    const builtInSet = new Set<string>(BUILT_IN_CATEGORIES);
    let order = 0;
    for (const name of BUILT_IN_CATEGORIES) {
      const c = counts.get(name) ?? 0;
      if (c > 0) items.push({ key: name, label: name, count: c, order: order++ });
    }
    const custom = [...counts.entries()]
      .filter(([name, c]) => c > 0 && !builtInSet.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, c] of custom) {
      items.push({ key: name, label: name, count: c, order: order++ });
    }
    return items;
  }, [docs]);

  const tagItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs ?? [])
      for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [docs]);

  const toggleLibraryParam = (key: "category" | "tag", value: string) => {
    const next = new URLSearchParams(searchStr);
    const current = next.get(key) ?? undefined;
    if (libraryFilterMatchesParam(current, value)) next.delete(key);
    else next.set(key, value);
    const search = Object.fromEntries(next.entries()) as Record<string, string>;
    void navigate({ to: "/library", search });
  };

  const item = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))
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
      <nav className="flex flex-col gap-1 px-2 text-sm md:px-3">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:justify-start md:px-3"
          aria-label="Add documents"
          onClick={() => input.current?.click()}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Add documents</span>
        </button>
        <Link to="/" aria-label="Home" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/"))}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs font-semibold">⌂</span>
          <span className="hidden md:inline">Home</span>
        </Link>
        <Link to="/library" aria-label={`Library, ${count}`} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/library"))}>
          <Library className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Library</span>
          <span className="ml-auto hidden text-xs tabular-nums md:inline">{count}</span>
        </Link>
        <Link to="/dates" aria-label="Dates to Remember" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/dates"))}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 md:inline">Dates to Remember</span>
          {attentionCount > 0 && (
            <span className="hidden rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary md:inline">
              {attentionCount} need attention
            </span>
          )}
        </Link>
        <Link to="/expenses" aria-label="Expenses" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/expenses"))}>
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Expenses</span>
        </Link>
        <Link to="/settings" aria-label="Settings" className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 transition-colors md:justify-start md:px-3", item("/settings"))}>
          <Settings className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Settings</span>
        </Link>
      </nav>

      <div className="hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 md:flex">
        {categoryItems.length > 0 && (
          <section>
            <h2 className="mb-1.5 px-3 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Categories
            </h2>
            <ul className="flex flex-col gap-0.5">
              {categoryItems.map(({ key, label, count: n }) => (
                <li key={key}>
                  <SidebarFilterButton
                    active={libraryFilterMatchesParam(activeCategory, key)}
                    label={label}
                    count={n}
                    onClick={() => toggleLibraryParam("category", key)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {tagItems.length > 0 && (
          <section>
            <h2 className="mb-1.5 px-3 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Tags</h2>
            <ul className="flex flex-col gap-0.5">
              {tagItems.map(([tag, n]) => (
                <li key={tag}>
                  <SidebarFilterButton
                    active={libraryFilterMatchesParam(activeTag, tag)}
                    label={tag}
                    count={n}
                    onClick={() => toggleLibraryParam("tag", tag)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

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
        <InstallAppButton />
        <LandingThemeToggle />
        <Link to="/privacy" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          How your data is handled
        </Link>
      </div>
    </header>
  );
}
