import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Search,
  CalendarPlus,
  Upload,
  FileText,
  ImageIcon,
  FileType2,
  Table2,
  CalendarClock,
  Trash2,
  Plus,
  LayoutGrid,
  List,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { SiteHeader, appFrameClass } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useObjectUrl } from "@/hooks/use-object-url";
import { useLibrary, addFiles, addSampleDocuments, KIND_LABEL } from "@/lib/use-library";
import { downloadBlob, downloadIcs, exportBackup } from "@/lib/backup";
import { formatSize } from "@/lib/extract";
import { BUILT_IN_CATEGORIES, getCustomCategories } from "@/lib/categories";
import {
  EMPTY_FILTER,
  changedAt,
  filterActive,
  matchesFilter,
  orderDocuments,
  searchHit,
  type DatePreset,
  type LibraryFilter,
  type LibrarySort,
  type SearchHit,
} from "@/lib/library-view";
import { deleteDocument, deleteWorkspaceData, getDocument, getMeta, listDocuments, patchDocument, setMeta, setWorkspace } from "@/lib/db";
import { daysUntil, isOpenReminder } from "@/lib/reminders";
import type { DocKind, DocumentRecord } from "@/lib/types";

export const Route = createFileRoute("/library/")({
  head: () => ({
    meta: [
      { title: "Library — Privytrail" },
      {
        name: "description",
        content: "Browse and search the documents stored in this browser.",
      },
    ],
  }),
  component: LibraryIndex,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function LibraryIndex() {
  const navigate = useNavigate();
  const { docs, workspace } = useLibrary();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [nudge, setNudge] = useState<{ kind: "never" | "stale"; count: number } | null>(null);
  const [categories, setCategories] = useState<string[]>([...BUILT_IN_CATEGORIES]);
  const [bulkTag, setBulkTag] = useState("");
  const addInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const next = query.trim();
    if (next) url.searchParams.set("q", next);
    else url.searchParams.delete("q");
    if (url.pathname === window.location.pathname && url.search !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }
  }, [query]);

  useEffect(() => {
    if (!docs || docs.length === 0 || workspace !== "main") {
      setNudge(null);
      return;
    }
    void (async () => {
      const last = await getMeta<string | null>("lastBackup", null);
      const snoozeUntil = await getMeta<number>("backupNudgeSnoozeUntil", 0);
      if (Date.now() < snoozeUntil) {
        setNudge(null);
        return;
      }
      if (!last) {
        setNudge({ kind: "never", count: docs.length });
        return;
      }
      const changed = docs.filter((doc) => changedAt(doc) > Date.parse(last)).length;
      setNudge(changed > 0 ? { kind: "stale", count: changed } : null);
    })();
  }, [docs, workspace]);

  useEffect(() => {
    void getCustomCategories().then((custom) => setCategories([...BUILT_IN_CATEGORIES, ...custom]));
  }, [docs]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs ?? [])
      for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const hits = useMemo(() => {
    const searching = query.trim().length > 0;
    const matched = (docs ?? [])
      .filter((doc) => matchesFilter(doc, filter))
      .map((doc) => searchHit(doc, query))
      .filter((hit): hit is SearchHit => hit != null);
    return orderDocuments(matched, sort, searching);
  }, [docs, query, filter, sort]);

  const reminders = useMemo(() => {
    const events = (docs ?? []).flatMap((d) =>
      d.dates.filter((date) => isOpenReminder(date)).map((dt) => ({ ...dt, doc: d, days: daysUntil(dt.date) })),
    );
    return events.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [docs]);

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchSelected = async (patch: Partial<DocumentRecord>) => {
    for (const id of selected) await patchDocument(id, patch);
    setSelected(new Set());
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  const discardSamples = async () => {
    setWorkspace("main");
    await deleteWorkspaceData("sample");
    toast.success("Sample workspace discarded");
    void navigate({ to: "/library" });
  };

  const trySamples = async () => {
    setWorkspace("sample");
    void navigate({ to: "/library" });
    const existing = await listDocuments();
    if (existing.length === 0) await addSampleDocuments();
  };

  return (
    <div
      className={appFrameClass}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <SiteHeader />

      <main
        className={`mx-auto w-full max-w-6xl px-6 pb-20 ${
          dragging ? "rounded-xl ring-2 ring-primary/50 ring-offset-4 ring-offset-background" : ""
        }`}
      >
        {workspace === "sample" && (
          <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sage px-4 py-3 text-sm">
            <p className="text-sage-foreground">
              <strong className="font-semibold">Sample workspace.</strong> These documents aren't
              yours — nothing here will mix with your own files.
            </p>
            <Button variant="outline" size="sm" onClick={() => void discardSamples()}>
              <Trash2 className="h-3.5 w-3.5" />
              Discard samples
            </Button>
          </div>
        )}
        {workspace === "main" && (docs?.length ?? 0) > 0 && (
          <div className="mt-2 mb-6 flex justify-center">
            <button
              onClick={() => void trySamples()}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the sample workspace
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, tags, notes — and the words inside your documents"
              className="h-11 pl-9"
              aria-label="Search documents"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  return;
                }
                if (e.key === "Enter" && hits[0]) {
                  e.preventDefault();
                  void navigate({ to: "/library/$id", params: { id: hits[0].doc.id } });
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  document.querySelector<HTMLAnchorElement>("[data-result-link]")?.focus();
                }
              }}
            />
          </div>
          <Select value={query.trim() && sort === "recent" ? "relevance" : sort} onValueChange={(value) => setSort(value as LibrarySort)}>
            <SelectTrigger className="h-11 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {query.trim() && <SelectItem value="relevance">Relevance</SelectItem>}
              <SelectItem value="recent">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex h-11 overflow-hidden rounded-md border border-border">
            <button
              className={`px-3 ${view === "list" ? "bg-muted" : ""}`}
              aria-label="List view"
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              className={`px-3 ${view === "grid" ? "bg-muted" : ""}`}
              aria-label="Grid view"
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button className="h-11" onClick={() => addInput.current?.click()}>
            <Plus className="h-4 w-4" />
            Add files
          </Button>
          <input
            ref={addInput}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {nudge && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sage px-4 py-3 text-sm text-sage-foreground">
            <div>
              <p>
                {nudge.kind === "never"
                  ? `${nudge.count} ${nudge.count === 1 ? "document isn't" : "documents aren't"} backed up yet.`
                  : `${nudge.count} ${nudge.count === 1 ? "document" : "documents"} changed since your last backup.`}
              </p>
              <p className="text-xs opacity-80">Browser storage can be cleared, so keep a copy somewhere safe.</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void exportBackup().then((n) => {
                    toast.success(`Backup downloaded (${n} ${n === 1 ? "document" : "documents"})`);
                    setNudge(null);
                  })
                }
              >
                Export backup
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void setMeta("backupNudgeSnoozeUntil", Date.now() + 7 * 86400000);
                  setNudge(null);
                }}
              >
                Remind me in a week
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Category"
            value={filter.categories[0] ?? "any"}
            options={[
              ["any", "Any category"],
              ["__none__", "Uncategorized"],
              ...categories.map((name) => [name, name] as [string, string]),
            ]}
            onChange={(value) => setFilter({ ...filter, categories: value === "any" ? [] : [value] })}
          />
          <FilterSelect
            label="Tag"
            value={filter.tags[0] ?? "any"}
            options={[["any", "Any tag"], ...allTags.map(([tag]) => [tag, tag] as [string, string])]}
            onChange={(value) => setFilter({ ...filter, tags: value === "any" ? [] : [value] })}
          />
          <FilterSelect
            label="Type"
            value={filter.kinds[0] === "markdown" ? "text" : (filter.kinds[0] ?? "any")}
            options={[
              ["any", "Any type"],
              ["pdf", "PDF"],
              ["image", "Image"],
              ["text", "Text"],
            ]}
            onChange={(value) =>
              setFilter({
                ...filter,
                kinds: value === "any" ? [] : value === "text" ? ["text", "markdown", "csv"] : [value as DocKind],
              })
            }
          />
          <FilterSelect
            label="Date"
            value={filter.dateField}
            options={[
              ["added", "Date added"],
              ["document", "Document date"],
            ]}
            onChange={(value) => setFilter({ ...filter, dateField: value as LibraryFilter["dateField"] })}
          />
          <FilterSelect
            label="Range"
            value={filter.datePreset}
            options={[
              ["any", "Any time"],
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["12m", "Last 12 months"],
              ["custom", "Custom range"],
            ]}
            onChange={(value) => setFilter({ ...filter, datePreset: value as DatePreset })}
          />
          <button
            className={`rounded-full border px-2.5 py-1 text-xs ${filter.attention ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            onClick={() => setFilter({ ...filter, attention: !filter.attention })}
          >
            Needs attention
          </button>
          <button
            className={`rounded-full border px-2.5 py-1 text-xs ${filter.withDates ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            onClick={() => setFilter({ ...filter, withDates: !filter.withDates })}
          >
            Has important dates
          </button>
          {filterActive(filter) && (
            <button className="text-xs text-muted-foreground underline" onClick={() => setFilter(EMPTY_FILTER)}>
              Clear filters
            </button>
          )}
        </div>
        {filter.datePreset === "custom" && (
          <div className="mt-2 flex gap-2">
            <Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} className="h-9 w-40" />
            <Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className="h-9 w-40" />
          </div>
        )}

        {reminders.length > 0 && (
          <section className="mt-8 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Coming up
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() =>
                  downloadIcs(
                    reminders.map((r) => ({ title: r.doc.title, label: r.label, date: r.date, remindDays: r.remindDays })),
                  )
                }
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Add all to calendar
              </Button>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {reminders.map((r) => (
                <li key={`${r.doc.id}-${r.label}-${r.date}`} className="flex items-center gap-3 py-2 text-sm">
                  <Link to="/library/$id" params={{ id: r.doc.id }} className="min-w-0 flex-1 truncate hover:underline">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground"> — {r.doc.title}</span>
                  </Link>
                  <span className="shrink-0 text-muted-foreground">
                    {formatDate(r.date)}
                    {r.days < 0 ? ` · ${-r.days}d overdue` : r.days === 0 ? " · today" : ` · in ${r.days}d`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Add to calendar (.ics)"
                    onClick={() => downloadIcs([{ title: r.doc.title, label: r.label, date: r.date, remindDays: r.remindDays }])}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          {docs === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <EmptyLibrary onChoose={() => addInput.current?.click()} />
          ) : hits.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              Nothing matches{query.trim() ? ` “${query.trim()}”` : " these filters"}.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                <button
                  className="text-muted-foreground underline"
                  onClick={() =>
                    setSelected(
                      selected.size === hits.length ? new Set() : new Set(hits.map((hit) => hit.doc.id)),
                    )
                  }
                >
                  {selected.size === hits.length ? "Deselect all" : "Select all"}
                </button>
                <span className="text-muted-foreground">{hits.length} shown</span>
              </div>
              {selected.size > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                  <span className="font-medium">{selected.size} selected</span>
                  <Input
                    value={bulkTag}
                    onChange={(e) => setBulkTag(e.target.value)}
                    placeholder="Tag"
                    className="h-8 w-32"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bulkTag.trim()}
                    onClick={() => {
                      const tag = bulkTag.trim();
                      void (async () => {
                        for (const id of selected) {
                          const doc = docs?.find((item) => item.id === id);
                          if (!doc || doc.tags.includes(tag)) continue;
                          await patchDocument(id, { tags: [...doc.tags, tag] });
                        }
                        setBulkTag("");
                        setSelected(new Set());
                      })();
                    }}
                  >
                    Tag selected
                  </Button>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      const value = e.target.value;
                      e.target.value = "";
                      if (!value) return;
                      void patchSelected({ category: value === "__clear__" ? "" : value });
                    }}
                  >
                    <option value="">Set category</option>
                    {categories.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__clear__">Remove category</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void exportBackup({ ids: [...selected] }).then((n) =>
                        toast.success(`Exported ${n} ${n === 1 ? "document" : "documents"}`),
                      )
                    }
                  >
                    Export selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!confirm(`Delete ${selected.size} selected ${selected.size === 1 ? "document" : "documents"}?`)) return;
                      void (async () => {
                        for (const id of selected) await deleteDocument(id);
                        setSelected(new Set());
                      })();
                    }}
                  >
                    Delete
                  </Button>
                  <button className="text-xs text-muted-foreground underline" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </button>
                </div>
              )}
              {view === "list" ? (
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                  {hits.map((hit) => (
                    <DocRow
                      key={hit.doc.id}
                      hit={hit}
                      query={query}
                      selected={selected.has(hit.doc.id)}
                      onToggle={() => toggleSelected(hit.doc.id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {hits.map((hit) => (
                    <DocCard
                      key={hit.doc.id}
                      hit={hit}
                      query={query}
                      selected={selected.has(hit.doc.id)}
                      onToggle={() => toggleSelected(hit.doc.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function EmptyLibrary({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-input px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
        <Upload className="h-5 w-5 text-sage-foreground" />
      </div>
      <h2 className="mt-4 font-semibold">Your library is empty</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop receipts, bills, warranties — anything you want to find later.
      </p>
      <Button className="mt-5" onClick={onChoose}>
        Choose files
      </Button>
    </div>
  );
}

const KIND_ICON = {
  pdf: FileText,
  image: ImageIcon,
  text: FileType2,
  markdown: FileType2,
  csv: Table2,
  other: FileText,
} as const;

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function DocMenu({ doc }: { doc: DocumentRecord }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(doc.title);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-md bg-card/90 p-1 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${doc.title}`}
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setTitle(doc.title); setRenaming(true); }}>Rename…</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void getDocument(doc.id).then((full) => {
                if (full?.blob) downloadBlob(full.blob, full.fileName);
              })
            }
          >
            Download original
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (confirm(`Delete “${doc.title}”?`)) void deleteDocument(doc.id);
            }}
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && (
        <form
          className="absolute top-10 right-2 z-10 flex gap-1 rounded-md border border-border bg-card p-2 shadow-md"
          onSubmit={(e) => {
            e.preventDefault();
            void patchDocument(doc.id, { title: title.trim() || doc.title });
            setRenaming(false);
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 w-40" />
          <Button type="submit" size="sm">Save</Button>
        </form>
      )}
    </>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = needle.toLowerCase();
  const parts: Array<string | { match: string }> = [];
  let index = 0;
  while (index < text.length) {
    const at = lower.indexOf(q, index);
    if (at === -1) {
      parts.push(text.slice(index));
      break;
    }
    if (at > index) parts.push(text.slice(index, at));
    parts.push({ match: text.slice(at, at + q.length) });
    index = at + q.length;
  }
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <mark key={i} className="rounded-sm bg-primary/15 text-foreground">
            {part.match}
          </mark>
        ),
      )}
    </>
  );
}

function onResultKey(event: { key: string; preventDefault: () => void; currentTarget: HTMLElement }) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const links = [...document.querySelectorAll<HTMLElement>("[data-result-link]")];
  const next = links[links.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
  next?.focus();
}

function MatchNote({ hit, query }: { hit: SearchHit; query: string }) {
  if (!hit.snippet && hit.hits === 0) return null;
  return (
    <p className="mt-2 line-clamp-2 rounded-md bg-muted px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
      {hit.page ? `Page ${hit.page} · ` : ""}
      {hit.hits > 1 ? `${hit.hits} matches · ` : ""}
      {hit.snippet ? <Highlighted text={hit.snippet} query={query} /> : null}
    </p>
  );
}

function DocRow({ hit, query, selected, onToggle }: { hit: SearchHit; query: string; selected: boolean; onToggle: () => void }) {
  const doc = hit.doc;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${doc.title}`} />
      <Link
        to="/library/$id"
        params={{ id: doc.id }}
        data-result-link
        className="min-w-0 flex-1"
        onKeyDown={onResultKey}
      >
        <span className="block truncate font-medium">
          <Highlighted text={doc.title} query={query} />
        </span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABEL[doc.kind]} · {formatSize(doc.size)}
        </span>
        <MatchNote hit={hit} query={query} />
      </Link>
      <DocMenu doc={doc} />
    </li>
  );
}

function DocCard({ hit, query, selected, onToggle }: { hit: SearchHit; query: string; selected: boolean; onToggle: () => void }) {
  const doc = hit.doc;
  const thumb = useObjectUrl(doc.thumbnail);
  const Icon = KIND_ICON[doc.kind] ?? FileText;
  const nextDate = doc.dates
    .filter((date) => date.source !== "found")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((d) => daysUntil(d.date) >= -7);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="absolute top-2 left-2 z-10">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${doc.title}`} className="bg-card" />
      </div>
      <div className="absolute top-2 right-2 z-10">
        <DocMenu doc={doc} />
      </div>
      <Link to="/library/$id" params={{ id: doc.id }} data-result-link className="block" onKeyDown={onResultKey}>
        <div className="flex h-40 items-center justify-center overflow-hidden border-b border-border bg-muted">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          ) : (
            <Icon className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          )}
        </div>
        <div className="p-4">
          <h3 className="line-clamp-1 font-medium text-foreground">
            <Highlighted text={doc.title} query={query} />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {KIND_LABEL[doc.kind]} · {formatSize(doc.size)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
          </p>
          <MatchNote hit={hit} query={query} />
          {doc.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {doc.tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="secondary" className="rounded-full px-2 py-0 text-[11px] font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {nextDate && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-accent-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {nextDate.label}: {formatDate(nextDate.date)}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
