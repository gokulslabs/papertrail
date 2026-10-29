import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Download,
  ScanText,
  Trash2,
  Save,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { SiteHeader, appFrameClass } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useObjectUrl } from "@/hooks/use-object-url";
import { getDocument, patchDocument, deleteDocument, onChanged } from "@/lib/db";
import { renderPdfPages, ocrImage, extractPdf, formatSize, KIND_LABEL } from "@/lib/extract";
import { downloadIcs } from "@/lib/backup";
import { DATE_KINDS, dateLabel, inferKind } from "@/lib/date-kinds";
import { DateFields, type DateDraft } from "@/components/date-fields";
import type { DocumentRecord, DocDate, Suggestions } from "@/lib/types";

export const Route = createFileRoute("/library/$id")({
  head: () => ({
    meta: [
      { title: "Document — Privytrail" },
      { name: "description", content: "View and edit a stored document." },
    ],
  }),
  component: DocDetail,
});

function DocDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentRecord | null | undefined>(undefined);
  const [ocrBusy, setOcrBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const found = await getDocument(id);
      if (alive) setDoc(found ?? null);
    };
    void load();
    return onChanged(() => {
      void load();
    });
  }, [id]);

  if (doc === undefined) {
    return (
      <div className={appFrameClass}>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Skeleton className="h-[60vh] rounded-2xl" />
        </main>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className={appFrameClass}>
        <SiteHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">Document not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or it belongs to a different workspace.
          </p>
          <Button className="mt-6" onClick={() => void navigate({ to: "/library" })}>
            <ArrowLeft className="h-4 w-4" /> Back to library
          </Button>
        </main>
      </div>
    );
  }

  const runOcr = async () => {
    if (!doc.blob) return;
    setOcrBusy(true);
    try {
      const text = await ocrImage(doc.blob, (status, progress) => {
        if (status) toast.loading(`Reading text: ${status} (${Math.round(progress * 100)}%)`, { id: "ocr" });
      });
      const next = await patchDocument(doc.id, { text, ocrStatus: text ? "done" : "failed" });
      setDoc(next ?? null);
      toast.success(text ? "Text read and saved — now searchable" : "No text found in this image", {
        id: "ocr",
      });
    } catch (err) {
      console.error(err);
      toast.error("Text recognition failed.", { id: "ocr" });
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="mt-2 mb-5 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/library">
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
          </Button>
          <p className="truncate text-sm text-muted-foreground">
            {doc.fileName} · {KIND_LABEL[doc.kind]} · {formatSize(doc.size)}
          </p>
          <div className="ml-auto flex gap-2">
            {doc.blob && <DownloadOriginal doc={doc} />}
            <DeleteDoc doc={doc} onDeleted={() => void navigate({ to: "/library" })} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <Viewer doc={doc} onOcr={runOcr} ocrBusy={ocrBusy} onDoc={setDoc} />
            {doc.text && (
              <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">Text in this document</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {doc.ocrStatus === "done" ? "Read with text recognition." : "Read from the document."}{" "}
                  Search finds these words.
                </p>
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {doc.text}
                </pre>
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <SuggestionsPanel doc={doc} onDoc={setDoc} />
            <DetailsEditor doc={doc} onDoc={setDoc} />
            <DatesEditor doc={doc} onDoc={setDoc} />
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ---------- Viewer ---------- */

function Viewer({
  doc,
  onOcr,
  ocrBusy,
  onDoc,
}: {
  doc: DocumentRecord;
  onOcr: () => Promise<void>;
  ocrBusy: boolean;
  onDoc: (d: DocumentRecord) => void;
}) {
  if (doc.kind === "pdf") {
    return (
      <PdfPages
        blob={doc.blob}
        onPasswordText={async (password) => {
          if (!doc.blob) return;
          const extracted = await extractPdf(doc.blob, password);
          const next = await patchDocument(doc.id, {
            text: extracted.text,
            pageCount: extracted.pageCount,
            thumbnail: doc.thumbnail ?? extracted.thumbnail,
          });
          onDoc(next ?? doc);
        }}
      />
    );
  }
  if (doc.kind === "image") return <ImageWithOcr doc={doc} onOcr={onOcr} ocrBusy={ocrBusy} />;
  if (doc.kind === "text" || doc.kind === "markdown" || doc.kind === "csv") {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <pre className="max-h-[70vh] overflow-auto text-sm leading-relaxed whitespace-pre-wrap">
          {doc.text || "(empty file)"}
        </pre>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      No preview available for this file type. You can still download the original.
    </div>
  );
}

function PdfPages({
  blob,
  onPasswordText,
}: {
  blob: Blob | null;
  onPasswordText?: (password: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "password" | "error">("loading");
  const [password, setPassword] = useState("");
  const [attempt, setAttempt] = useState(0);
  const onPasswordTextRef = useRef(onPasswordText);
  onPasswordTextRef.current = onPasswordText;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !blob) return;
    let cancelled = false;
    setState("loading");
    void (async () => {
      try {
        await renderPdfPages(
          blob,
          Math.max(320, container.clientWidth - 4),
          (canvas) => {
            if (!cancelled) container.appendChild(canvas);
          },
          password || undefined,
        );
        if (!cancelled) {
          setState("done");
          if (password) await onPasswordTextRef.current?.(password);
        }
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === "PasswordException") setState("password");
        else {
          console.error(err);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [blob, attempt]);

  return (
    <div className="rounded-2xl border border-border bg-muted p-3">
      <div ref={containerRef} className="space-y-3" />
      {state === "loading" && (
        <div className="flex items-center justify-center py-24">
          <Skeleton className="h-96 w-full max-w-xl rounded-lg" />
        </div>
      )}
      {state === "password" && (
        <form
          className="mx-auto max-w-sm space-y-3 py-16 text-center"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempt((a) => a + 1);
          }}
        >
          <p className="text-sm text-muted-foreground">
            This PDF is password-protected. Type its password to view it — the password is used in
            this tab only and is never saved.
          </p>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" size="sm">
            Unlock
          </Button>
        </form>
      )}
      {state === "error" && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          This PDF could not be displayed.
        </p>
      )}
    </div>
  );
}

function ImageWithOcr({
  doc,
  onOcr,
  ocrBusy,
}: {
  doc: DocumentRecord;
  onOcr: () => Promise<void>;
  ocrBusy: boolean;
}) {
  const url = useObjectUrl(doc.blob);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      {url && <img src={url} alt={doc.title} className="mx-auto max-h-[70vh] rounded-md" />}
      {!doc.text && (
        <div className="mt-3 flex items-center justify-center gap-3 rounded-lg bg-muted px-4 py-3">
          <ScanText className="h-4 w-4 text-sage-foreground" />
          <p className="text-sm text-muted-foreground">
            Photos and scans aren't searchable until their text is read.
          </p>
          <Button size="sm" onClick={() => void onOcr()} disabled={ocrBusy}>
            {ocrBusy ? "Reading…" : "Read text with OCR"}
          </Button>
        </div>
      )}
    </div>
  );
}

function DownloadOriginal({ doc }: { doc: DocumentRecord }) {
  const url = useObjectUrl(doc.blob);
  if (!url) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={url} download={doc.fileName}>
        <Download className="h-4 w-4" /> Original
      </a>
    </Button>
  );
}

function DeleteDoc({ doc, onDeleted }: { doc: DocumentRecord; onDeleted: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its file, text, thumbnail, notes and dates are removed from this browser. This cannot
            be undone — export a backup first if you want to keep it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              await deleteDocument(doc.id);
              onDeleted();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------- Details editor ---------- */

function DetailsEditor({ doc, onDoc }: { doc: DocumentRecord; onDoc: (d: DocumentRecord) => void }) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [notes, setNotes] = useState(doc.notes);
  const [category, setCategory] = useState(doc.category);
  const [amount, setAmount] = useState(doc.amount);
  const [dirty, setDirty] = useState(false);
  const docIdRef = useRef(doc.id);

  useEffect(() => {
    if (docIdRef.current === doc.id && dirty) return;
    docIdRef.current = doc.id;
    setTitle(doc.title);
    setTags(doc.tags.join(", "));
    setNotes(doc.notes);
    setCategory(doc.category);
    setAmount(doc.amount);
    setDirty(false);
  }, [doc, dirty]);

  const save = async () => {
    const tagList = Array.from(
      new Set(
        tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    );
    const next = await patchDocument(doc.id, {
      title: title.trim() || doc.title,
      tags: tagList,
      notes,
      category: category.trim(),
      amount: amount.trim(),
    });
    onDoc(next ?? doc);
    setDirty(false);
    toast.success("Details saved");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Details</h2>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input id="tags" value={tags} onChange={(e) => { setTags(e.target.value); setDirty(true); }} placeholder="receipt, warranty…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input id="category" value={category} onChange={(e) => { setCategory(e.target.value); setDirty(true); }} placeholder="Receipt, Bill, Warranty…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" value={amount} onChange={(e) => { setAmount(e.target.value); setDirty(true); }} placeholder="e.g. 2 247.00 SEK" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
        </div>
        <Button onClick={() => void save()} disabled={!dirty} className="w-full">
          <Save className="h-4 w-4" />
          {dirty ? "Save details" : "Saved"}
        </Button>
      </div>
    </section>
  );
}

/* ---------- Dates ---------- */

function draftFrom(date: DocDate): DateDraft {
  const kind = inferKind(date);
  return { kind, date: date.date, note: date.note ?? "", remindDays: date.remindDays === undefined ? DATE_KINDS[kind].remindDays : date.remindDays };
}

function toDocDate(draft: DateDraft, previous?: DocDate): DocDate {
  const note = draft.note.trim();
  const date: DocDate = {
    label: dateLabel({ kind: draft.kind, label: previous?.label ?? "", note }),
    date: draft.date,
    kind: draft.kind,
    remindDays: draft.remindDays,
    status: previous?.status === "dismissed" || previous?.status === "done" ? previous.status : "open",
    source: "user",
  };
  if (note) date.note = note;
  return date;
}

function DatesEditor({ doc, onDoc }: { doc: DocumentRecord; onDoc: (d: DocumentRecord) => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<DateDraft>({ kind: "warranty", date: "", note: "", remindDays: 30 });

  const saveDates = async (dates: DocDate[]) => {
    const next = await patchDocument(doc.id, { dates });
    onDoc(next ?? doc);
  };

  const icsLabel = (date: DocDate) => dateLabel(date);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Dates</h2>
        {doc.dates.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              downloadIcs(doc.dates.map((d) => ({ title: doc.title, label: icsLabel(d), date: d.date, remindDays: d.remindDays })))
            }
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Add all to calendar
          </Button>
        )}
      </div>
      {doc.dates.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Warranty expiries, renewals, due dates — anything worth remembering.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {doc.dates.map((d, i) => (
          <li key={`${d.label}-${d.date}-${i}`} className="rounded-lg border border-border px-3 py-2 text-sm">
            {editing === i ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.date) return;
                  void saveDates(doc.dates.map((item, index) => (index === i ? toDocDate(draft, item) : item)));
                  setEditing(null);
                }}
              >
                <DateFields value={draft} onChange={setDraft} />
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={!draft.date}>Save date</Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{dateLabel(d)}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.date}
                      {d.note && d.kind !== "other" ? ` · ${d.note}` : ""}
                      {d.status === "done" ? " · Done" : d.status === "dismissed" ? " · Dismissed" : ""}
                    </p>
                  </div>
                  {d.status !== "done" && d.status !== "dismissed" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "done" } : item)))}>
                      Done
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Add to calendar (.ics)"
                    onClick={() => downloadIcs([{ title: doc.title, label: icsLabel(d), date: d.date, remindDays: d.remindDays }])}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    className="text-xs underline"
                    onClick={() => {
                      setDraft(draftFrom(d));
                      setEditing(i);
                      setAdding(false);
                    }}
                  >
                    Edit…
                  </button>
                  {d.status === "done" || d.status === "dismissed" ? (
                    <button className="text-xs underline" onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "open" } : item)))}>
                      Reactivate
                    </button>
                  ) : (
                    <button className="text-xs underline" onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "dismissed" } : item)))}>
                      Dismiss reminder
                    </button>
                  )}
                  <button className="text-xs underline" onClick={() => void saveDates(doc.dates.filter((_, index) => index !== i))}>
                    Remove date
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.date) return;
            void saveDates([...doc.dates, toDocDate(draft)]);
            setAdding(false);
          }}
        >
          <DateFields value={draft} onChange={setDraft} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!draft.date}>Add date</Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full border-dashed"
          onClick={() => {
            setDraft({ kind: "warranty", date: "", note: "", remindDays: DATE_KINDS.warranty.remindDays });
            setEditing(null);
            setAdding(true);
          }}
        >
          Add important date
        </Button>
      )}
    </section>
  );
}

/* ---------- Suggestions ---------- */

type IdeaKind = "category" | "amount" | "date";

/** What remains of the suggestions after one is accepted or ignored. */
function remainingSuggestions(
  suggested: Suggestions | null,
  kind: IdeaKind,
  value: string,
  date?: DocDate,
): Suggestions | null {
  if (!suggested) return null;
  const dates = suggested.dates.filter((d) => d !== date);
  const category = kind === "category" ? undefined : suggested.category;
  const amounts = kind === "amount" ? suggested.amounts.filter((a) => a !== value) : suggested.amounts;
  if (!category && !amounts.length && !dates.length) return null;
  const out: Suggestions = { amounts, dates };
  if (category) out.category = category;
  return out;
}

function SuggestionsPanel({ doc, onDoc }: { doc: DocumentRecord; onDoc: (d: DocumentRecord) => void }) {
  const suggested = doc.suggested;
  const ideas = useMemo(() => {
    if (!suggested) return [];
    const list: Array<{ kind: "category" | "amount" | "date"; value: string; date?: DocDate }> = [];
    if (suggested.category && suggested.category.toLowerCase() !== doc.category.toLowerCase())
      list.push({ kind: "category", value: suggested.category });
    for (const a of suggested.amounts) {
      if (a !== doc.amount) list.push({ kind: "amount", value: a });
    }
    for (const d of suggested.dates) {
      if (!doc.dates.some((x) => x.date === d.date)) list.push({ kind: "date", value: `${d.label}: ${d.date}`, date: d });
    }
    return list.slice(0, 5);
  }, [suggested, doc]);

  if (!ideas.length) return null;

  const accept = async (idea: (typeof ideas)[number]) => {
    const patch: Partial<DocumentRecord> = {};
    if (idea.kind === "category") patch.category = idea.value;
    if (idea.kind === "amount") patch.amount = idea.value;
    if (idea.kind === "date" && idea.date) patch.dates = [...doc.dates, idea.date];
    patch.suggested = remainingSuggestions(suggested, idea.kind, idea.value, idea.date);
    const next = await patchDocument(doc.id, patch);
    onDoc(next ?? doc);
    toast.success("Suggestion accepted");
  };

  const dismiss = async (idea: (typeof ideas)[number]) => {
    const next = await patchDocument(doc.id, {
      suggested: remainingSuggestions(suggested, idea.kind, idea.value, idea.date),
    });
    onDoc(next ?? doc);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Suggestions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Found by pattern matching in the document's text. Nothing is applied until you accept it.
      </p>
      <ul className="mt-3 space-y-2">
        {ideas.map((idea) => (
          <li
            key={`${idea.kind}-${idea.value}`}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {idea.kind === "category" && <span className="text-muted-foreground">Category: </span>}
              {idea.kind === "amount" && <span className="text-muted-foreground">Amount: </span>}
              {idea.value}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Accept" onClick={() => void accept(idea)}>
              <Check className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ignore" onClick={() => void dismiss(idea)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
