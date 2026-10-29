import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  Download,
  ExternalLink,
  ScanText,
  Trash2,
  Save,
  Check,
  X,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { SiteHeader, appFrameClass } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { renderPdfPages, extractPdf, formatSize, KIND_LABEL } from "@/lib/extract";
import {
  deriveExtraction,
  extractionStatusLabel,
  textSourceLabel,
} from "@/lib/extraction";
import { reextractDocument } from "@/lib/process";
import { sha256Hex, truncateHash } from "@/lib/hash";
import { downloadIcs } from "@/lib/backup";
import { DATE_KINDS, dateLabel, inferKind } from "@/lib/date-kinds";
import { DateFields, type DateDraft } from "@/components/date-fields";
import { daysUntil, effectiveDate, snoozeDate } from "@/lib/reminders";
import type { DocumentRecord, DocAnnotation, DocDate, Suggestions } from "@/lib/types";

export const Route = createFileRoute("/library/$id")({
  head: () => ({
    meta: [
      { title: "Document — Privytrail" },
      { name: "description", content: "View and edit a stored document." },
    ],
  }),
  component: DocDetail,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReasonList(words: string[]): string {
  const quoted = words.map((w) => `'${w}'`);
  if (quoted.length === 1) return quoted[0]!;
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`;
}

function DocDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentRecord | null | undefined>(undefined);
  const [reextractBusy, setReextractBusy] = useState(false);
  const [datePrefill, setDatePrefill] = useState<DateDraft | null>(null);

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

  const runReextract = async () => {
    if (!doc?.blob) return;
    setReextractBusy(true);
    try {
      const patch = await reextractDocument(doc, (status, progress) => {
        toast.loading(`Reading text: ${status} (${Math.round(progress * 100)}%)`, { id: "reextract" });
      });
      const next = await patchDocument(doc.id, patch);
      setDoc(next ?? null);
      toast.success(patch.text ? "Text read again — now searchable" : "No text found", { id: "reextract" });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Text recognition failed.", { id: "reextract" });
    } finally {
      setReextractBusy(false);
    }
  };

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

  const showPreviewTabs = doc.kind === "pdf" || doc.kind === "image";
  const charCount = doc.text.length;

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
            {doc.blob && <OpenOriginal doc={doc} />}
            {doc.blob && <DownloadOriginal doc={doc} />}
            <DeleteDoc doc={doc} onDeleted={() => void navigate({ to: "/library" })} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            {showPreviewTabs ? (
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="mb-3">
                  <TabsTrigger value="preview">{doc.kind === "pdf" ? "PDF" : "Image"}</TabsTrigger>
                  <TabsTrigger value="text">
                    Extracted text{charCount > 0 ? ` (${charCount.toLocaleString()})` : ""}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="mt-0">
                  <Viewer doc={doc} onDoc={setDoc} onReextract={runReextract} reextractBusy={reextractBusy} />
                </TabsContent>
                <TabsContent value="text" className="mt-0">
                  <ExtractedTextPanel doc={doc} />
                </TabsContent>
              </Tabs>
            ) : (
              <Viewer doc={doc} onDoc={setDoc} onReextract={runReextract} reextractBusy={reextractBusy} />
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <SuggestionsPanel doc={doc} onDoc={setDoc} />
            <DetailsEditor doc={doc} onDoc={setDoc} />
            {doc.mergedFrom?.length ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Merged from {doc.mergedFrom.length} other {doc.mergedFrom.length === 1 ? "document" : "documents"} (
                {doc.mergedFrom.slice(0, 3).join(", ")}
                {doc.mergedFrom.length > 3 ? "…" : ""}
                ).
              </p>
            ) : null}
            <AnnotationsPanel doc={doc} onDoc={setDoc} />
            <TextExtractionPanel
              doc={doc}
              busy={reextractBusy}
              onReextract={() => void runReextract()}
            />
            <FoundInTextPanel
              doc={doc}
              onAddDate={(d) =>
                setDatePrefill({
                  kind: "other",
                  date: d.date,
                  note: d.label,
                  remindDays: 7,
                })
              }
            />
            <DatesEditor
              doc={doc}
              onDoc={setDoc}
              openAddWith={datePrefill}
              onConsumePrefill={() => setDatePrefill(null)}
            />
            <FilePanel doc={doc} onDoc={setDoc} />
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ---------- Extracted text tab ---------- */

function ExtractedTextPanel({ doc }: { doc: DocumentRecord }) {
  const copy = async () => {
    if (!doc.text) {
      toast.error("No text to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(doc.text);
      toast.success("Text copied to clipboard");
    } catch {
      toast.error("Could not copy text");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Extracted text</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {charCountLabel(doc.text.length)} — used for search in your library.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!doc.text.trim()}>
          <Copy className="h-3.5 w-3.5" /> Copy text
        </Button>
      </div>
      {doc.text.trim() ? (
        <pre className="mt-3 max-h-[70vh] overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
          {doc.text}
        </pre>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No text extracted yet. Use Read again in the Text extraction panel when the original file is available.
        </p>
      )}
    </section>
  );
}

function charCountLabel(n: number): string {
  return `${n.toLocaleString()} character${n === 1 ? "" : "s"}`;
}

/* ---------- Viewer ---------- */

function Viewer({
  doc,
  onDoc,
  onReextract,
  reextractBusy,
}: {
  doc: DocumentRecord;
  onDoc: (d: DocumentRecord) => void;
  onReextract: () => Promise<void>;
  reextractBusy: boolean;
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
  if (doc.kind === "image") {
    return (
      <ImageWithOcr doc={doc} onReextract={onReextract} reextractBusy={reextractBusy} />
    );
  }
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "password" | "error">("loading");
  const [password, setPassword] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [visiblePage, setVisiblePage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const onPasswordTextRef = useRef(onPasswordText);
  onPasswordTextRef.current = onPasswordText;

  const zoomIn = () => setScaleFactor((s) => Math.min(3, Math.round(s * 1.25 * 100) / 100));
  const zoomOut = () => setScaleFactor((s) => Math.max(0.5, Math.round((s / 1.25) * 100) / 100));
  const fitWidth = () => setScaleFactor(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !blob) return;
    let cancelled = false;
    setState("loading");
    setVisiblePage(1);
    void (async () => {
      try {
        const width = Math.max(320, (scrollRef.current?.clientWidth ?? 640) - 4);
        const pages = await renderPdfPages(
          blob,
          width,
          (canvas, pageNum, total) => {
            if (!cancelled) {
              setTotalPages(total);
              container.appendChild(canvas);
              if (pageNum === 1) setVisiblePage(1);
            }
          },
          password || undefined,
          scaleFactor,
        );
        if (!cancelled) {
          setTotalPages(pages);
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
  }, [blob, attempt, scaleFactor]);

  useEffect(() => {
    const root = scrollRef.current;
    const container = containerRef.current;
    if (!root || !container || state !== "done" || totalPages < 2) return;
    const canvases = [...container.querySelectorAll("canvas[data-page]")];
    if (!canvases.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target as HTMLCanvasElement | undefined;
        if (top?.dataset.page) setVisiblePage(Number(top.dataset.page));
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    for (const c of canvases) observer.observe(c);
    return () => observer.disconnect();
  }, [state, totalPages, attempt, scaleFactor]);

  const zoomLabel = `${Math.round(scaleFactor * 100)}%`;

  return (
    <div className="rounded-2xl border border-border bg-muted p-3">
      {state === "done" && totalPages > 0 && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          {totalPages > 1 ? (
            <p className="text-xs text-muted-foreground">
              Page {visiblePage} of {totalPages}
            </p>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Zoom out" onClick={zoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 min-w-[5.5rem] text-xs" onClick={fitWidth}>
              {zoomLabel} · Fit width
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Zoom in" onClick={zoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <div ref={scrollRef} className="max-h-[75vh] overflow-auto">
        <div ref={containerRef} className="space-y-3" />
      </div>
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
  onReextract,
  reextractBusy,
}: {
  doc: DocumentRecord;
  onReextract: () => Promise<void>;
  reextractBusy: boolean;
}) {
  const url = useObjectUrl(doc.blob);
  const [actualSize, setActualSize] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setActualSize((v) => !v)}
        >
          {actualSize ? "Fit to view" : "Actual size"}
        </Button>
      </div>
      <div className="max-h-[75vh] overflow-auto">
        {url && (
          <img
            src={url}
            alt={doc.title}
            className={
              actualSize
                ? "mx-auto block max-w-none rounded-md"
                : "mx-auto block max-h-[70vh] w-full rounded-md object-contain"
            }
          />
        )}
      </div>
      {!doc.text && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg bg-muted px-4 py-3">
          <ScanText className="h-4 w-4 shrink-0 text-sage-foreground" />
          <p className="text-sm text-muted-foreground">
            Photos and scans aren&apos;t searchable until their text is read.
          </p>
          <Button size="sm" onClick={() => void onReextract()} disabled={reextractBusy}>
            {reextractBusy ? "Reading…" : "Read text with OCR"}
          </Button>
        </div>
      )}
    </div>
  );
}

function OpenOriginal({ doc }: { doc: DocumentRecord }) {
  const url = useObjectUrl(doc.blob);
  if (!url) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-4 w-4" /> Open original
      </a>
    </Button>
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

/* ---------- Text extraction ---------- */

function TextExtractionPanel({
  doc,
  busy,
  onReextract,
}: {
  doc: DocumentRecord;
  busy: boolean;
  onReextract: () => void;
}) {
  const extraction = deriveExtraction(doc);
  const canReextract =
    !!doc.blob && (doc.kind === "pdf" || doc.kind === "image" || doc.kind === "text" || doc.kind === "markdown" || doc.kind === "csv");

  const pagesLine =
    doc.kind === "pdf" && doc.pageCount
      ? `${extraction.pagesWithText ?? "—"} of ${doc.pageCount} with text`
      : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Text extraction</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Status" value={extractionStatusLabel(doc)} />
        <Row label="Source" value={textSourceLabel(extraction.source)} />
        {pagesLine && <Row label="Pages" value={pagesLine} />}
        <Row label="Characters" value={charCountLabel(extraction.characters)} />
        {extraction.source === "ocr" && typeof extraction.confidence === "number" && (
          <Row label="Recognition" value={`${extraction.confidence}% confidence`} />
        )}
      </dl>
      {canReextract && (
        <Button variant="outline" size="sm" className="mt-4 w-full" disabled={busy} onClick={onReextract}>
          <ScanText className="h-4 w-4" />
          {busy ? "Reading…" : "Read again"}
        </Button>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

/* ---------- FILE panel ---------- */

function FilePanel({ doc, onDoc }: { doc: DocumentRecord; onDoc: (d: DocumentRecord) => void }) {
  const [hashBusy, setHashBusy] = useState(false);
  const fullHash = doc.sha256 ?? "";

  useEffect(() => {
    if (doc.sha256 || !doc.blob) return;
    let alive = true;
    setHashBusy(true);
    void sha256Hex(doc.blob)
      .then(async (sha256) => {
        const next = await patchDocument(doc.id, { sha256 });
        if (alive && next) onDoc(next);
      })
      .finally(() => {
        if (alive) setHashBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [doc.id, doc.sha256, doc.blob, onDoc]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">File</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Name" value={doc.fileName} />
        <Row label="Type" value={`${KIND_LABEL[doc.kind]} · ${doc.mime || "application/octet-stream"}`} />
        <Row label="Size" value={formatSize(doc.size)} />
        <Row label="Added" value={formatTimestamp(doc.addedAt)} />
        {typeof doc.fileModifiedAt === "number" && (
          <Row label="Modified" value={formatTimestamp(doc.fileModifiedAt)} />
        )}
        {doc.category.trim() && <Row label="Category" value={doc.category} />}
        <div className="flex justify-between gap-3 pt-1">
          <dt className="text-muted-foreground">SHA-256</dt>
          <dd
            className="max-w-[12rem] truncate text-right font-mono text-xs text-foreground"
            title={fullHash || undefined}
          >
            {hashBusy ? "Computing…" : fullHash ? truncateHash(fullHash) : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ---------- Found in the text ---------- */

function FoundInTextPanel({
  doc,
  onAddDate,
}: {
  doc: DocumentRecord;
  onAddDate: (date: DocDate) => void;
}) {
  const suggested = doc.suggested;
  const amounts = suggested?.amountDetails ?? [];
  const dates = suggested?.dates ?? [];
  if (!amounts.length && !dates.length) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Found in the text</h2>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Not verified
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Amounts and dates printed in the document, found by pattern matching. They may be wrong — nothing
        is used until you confirm.
      </p>
      {amounts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Amounts</p>
          <ul className="mt-2 space-y-1.5">
            {amounts.map((a) => (
              <li key={a.value} className="rounded-lg border border-border px-3 py-2 text-sm">
                {a.label && <span className="text-muted-foreground">{a.label}: </span>}
                {a.value}
              </li>
            ))}
          </ul>
        </div>
      )}
      {dates.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Dates</p>
          <ul className="mt-2 space-y-2">
            {dates.map((d) => (
              <li key={`${d.date}-${d.label}`} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium">
                  {d.label}: {formatDate(d.date)}
                </p>
                {d.snippet && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">&ldquo;{d.snippet}&rdquo;</p>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => onAddDate(d)}
                >
                  Add as date…
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- Details editor ---------- */

function DetailsEditor({ doc, onDoc }: { doc: DocumentRecord; onDoc: (d: DocumentRecord) => void }) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [notes, setNotes] = useState(doc.notes);
  const [category, setCategory] = useState(doc.category);
  const [amount, setAmount] = useState(doc.amount);
  const [documentDate, setDocumentDate] = useState(doc.documentDate ?? "");
  const [dirty, setDirty] = useState(false);
  const docIdRef = useRef(doc.id);

  const suggestedDocDate = doc.suggested?.documentDate;
  const showDocDateSuggestion = !!suggestedDocDate && !doc.documentDate;

  useEffect(() => {
    if (docIdRef.current === doc.id && dirty) return;
    docIdRef.current = doc.id;
    setTitle(doc.title);
    setTags(doc.tags.join(", "));
    setNotes(doc.notes);
    setCategory(doc.category);
    setAmount(doc.amount);
    setDocumentDate(doc.documentDate ?? "");
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
    const patch: Partial<DocumentRecord> = {
      title: title.trim() || doc.title,
      tags: tagList,
      notes,
      category: category.trim(),
      amount: amount.trim(),
    };
    const trimmedDate = documentDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) patch.documentDate = trimmedDate;
    else if (!trimmedDate && doc.documentDate) patch.documentDate = undefined;

    const next = await patchDocument(doc.id, patch);
    onDoc(next ?? doc);
    setDirty(false);
    toast.success("Details saved");
  };

  const confirmSuggestedDate = async () => {
    if (!suggestedDocDate) return;
    const nextSuggested = clearDocumentDateSuggestion(doc.suggested);
    const next = await patchDocument(doc.id, {
      documentDate: suggestedDocDate,
      suggested: nextSuggested,
    });
    onDoc(next ?? doc);
    setDocumentDate(suggestedDocDate);
    toast.success("Document date confirmed");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Details</h2>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => {
              setTags(e.target.value);
              setDirty(true);
            }}
            placeholder="receipt, warranty…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setDirty(true);
            }}
            placeholder="Receipt, Bill, Warranty…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setDirty(true);
            }}
            placeholder="e.g. 2 247.00 SEK"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="documentDate">Document date</Label>
          <Input
            id="documentDate"
            type="date"
            value={documentDate}
            onChange={(e) => {
              setDocumentDate(e.target.value);
              setDirty(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            When the document was issued, e.g. the purchase or bill date.
          </p>
          {showDocDateSuggestion && (
            <div className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                Suggested: <span className="font-medium text-foreground">{formatDate(suggestedDocDate!)}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Suggested from a date printed in the document — check it, then confirm.
              </p>
              <Button type="button" size="sm" className="mt-2" onClick={() => void confirmSuggestedDate()}>
                <Check className="h-3.5 w-3.5" /> Confirm
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <Button onClick={() => void save()} disabled={!dirty} className="w-full">
          <Save className="h-4 w-4" />
          {dirty ? "Save details" : "Saved"}
        </Button>
      </div>
    </section>
  );
}

function clearDocumentDateSuggestion(suggested: Suggestions | null): Suggestions | null {
  if (!suggested?.documentDate) return suggested;
  const { documentDate: _removed, ...rest } = suggested;
  if (!rest.category && !rest.amounts.length && !rest.dates.length && !rest.categoryReasons?.length && !rest.amountDetails?.length) {
    return null;
  }
  return rest as Suggestions;
}

/* ---------- Dates ---------- */

function draftFrom(date: DocDate): DateDraft {
  const kind = inferKind(date);
  return {
    kind,
    date: date.date,
    note: date.note ?? "",
    remindDays: date.remindDays === undefined ? DATE_KINDS[kind].remindDays : date.remindDays,
    recurrence: date.recurrence === "yearly" ? "yearly" : "none",
  };
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
    recurrence: draft.recurrence === "yearly" ? "yearly" : undefined,
  };
  if (note) date.note = note;
  if (previous?.snoozeUntil) date.snoozeUntil = previous.snoozeUntil;
  return date;
}

function icsForDate(doc: DocumentRecord, d: DocDate) {
  const eff = effectiveDate(d);
  return {
    title: doc.title,
    label: dateLabel(d),
    date: eff,
    remindDays: d.remindDays,
    recurrence: d.recurrence === "yearly" ? ("yearly" as const) : undefined,
  };
}

function AnnotationsPanel({
  doc,
  onDoc,
}: {
  doc: DocumentRecord;
  onDoc: (d: DocumentRecord) => void;
}) {
  const [quote, setQuote] = useState("");
  const [note, setNote] = useState("");
  const list = doc.annotations ?? [];

  const add = async () => {
    const q = quote.trim();
    if (!q) return;
    const entry: DocAnnotation = {
      id: crypto.randomUUID(),
      page: 1,
      quote: q,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    };
    const next = await patchDocument(doc.id, { annotations: [...list, entry] });
    onDoc(next ?? doc);
    setQuote("");
    setNote("");
    toast.success("Highlight saved");
  };

  const remove = async (id: string) => {
    const next = await patchDocument(doc.id, {
      annotations: list.filter((a) => a.id !== id),
    });
    onDoc(next ?? doc);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Highlights &amp; notes</h2>
      <p className="mt-1 text-xs text-muted-foreground">Stored only on this device — not included in search unless you copy them to Notes.</p>
      <div className="mt-3 space-y-2">
        <Input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Quoted text" className="h-9" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-9" />
        <Button size="sm" variant="outline" disabled={!quote.trim()} onClick={() => void add()}>
          Add highlight
        </Button>
      </div>
      {list.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {list.map((a) => (
            <li key={a.id} className="rounded-lg border border-border px-3 py-2">
              <p className="font-medium">{a.quote}</p>
              {a.note ? <p className="mt-1 text-xs text-muted-foreground">{a.note}</p> : null}
              <button type="button" className="mt-2 text-xs underline" onClick={() => void remove(a.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DatesEditor({
  doc,
  onDoc,
  openAddWith,
  onConsumePrefill,
}: {
  doc: DocumentRecord;
  onDoc: (d: DocumentRecord) => void;
  openAddWith?: DateDraft | null;
  onConsumePrefill?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<DateDraft>({ kind: "warranty", date: "", note: "", remindDays: 30 });

  useEffect(() => {
    if (!openAddWith) return;
    setDraft(openAddWith);
    setAdding(true);
    setEditing(null);
    onConsumePrefill?.();
  }, [openAddWith, onConsumePrefill]);

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
              downloadIcs(doc.dates.map((d) => icsForDate(doc, d)))
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
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={!draft.date}>
                    Save date
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{dateLabel(d)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(effectiveDate(d))}
                      {d.recurrence === "yearly" ? " · yearly" : ""}
                      {d.note && d.kind !== "other" ? ` · ${d.note}` : ""}
                      {d.status === "done" ? " · Done" : d.status === "dismissed" ? " · Dismissed" : ""}
                      {d.status !== "done" && d.status !== "dismissed"
                        ? ` · ${(() => {
                            const days = daysUntil(effectiveDate(d));
                            return days === 0 ? "today" : days > 0 ? `in ${days}d` : `${-days}d overdue`;
                          })()}`
                        : ""}
                    </p>
                  </div>
                  {d.status !== "done" && d.status !== "dismissed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "done" } : item)))}
                    >
                      Done
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Add to calendar (.ics)"
                    onClick={() => downloadIcs([icsForDate(doc, d)])}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
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
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "open" } : item)))}
                    >
                      Reactivate
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => void saveDates(doc.dates.map((item, index) => (index === i ? { ...item, status: "dismissed" } : item)))}
                      >
                        Dismiss reminder
                      </button>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() =>
                          void saveDates(
                            doc.dates.map((item, index) => (index === i ? snoozeDate(item, 1) : item)),
                          )
                        }
                      >
                        Snooze 1d
                      </button>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() =>
                          void saveDates(
                            doc.dates.map((item, index) => (index === i ? snoozeDate(item, 7) : item)),
                          )
                        }
                      >
                        Snooze 1w
                      </button>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() =>
                          void saveDates(
                            doc.dates.map((item, index) => (index === i ? snoozeDate(item, 30) : item)),
                          )
                        }
                      >
                        Snooze 1mo
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => void saveDates(doc.dates.filter((_, index) => index !== i))}
                  >
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
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!draft.date}>
              Add date
            </Button>
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

function remainingSuggestions(
  suggested: Suggestions | null,
  kind: IdeaKind,
  value: string,
  date?: DocDate,
): Suggestions | null {
  if (!suggested) return null;
  const dates = suggested.dates.filter((d) => d !== date);
  const category = kind === "category" ? undefined : suggested.category;
  const categoryReasons = kind === "category" ? undefined : suggested.categoryReasons;
  const amounts = kind === "amount" ? suggested.amounts.filter((a) => a !== value) : suggested.amounts;
  const amountDetails =
    kind === "amount"
      ? (suggested.amountDetails ?? []).filter((a) => a.value !== value)
      : suggested.amountDetails;
  if (!category && !amounts.length && !dates.length && !suggested.documentDate) return null;
  const out: Suggestions = { amounts, dates };
  if (category) out.category = category;
  if (categoryReasons?.length) out.categoryReasons = categoryReasons;
  if (amountDetails?.length) out.amountDetails = amountDetails;
  if (suggested.documentDate) out.documentDate = suggested.documentDate;
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

  const categoryReasonText =
    suggested?.categoryReasons?.length ?
      `Suggested because the document mentions ${formatReasonList(suggested.categoryReasons)}.`
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Suggestions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Found by pattern matching in the document&apos;s text. Nothing is applied until you accept it.
      </p>
      <ul className="mt-3 space-y-2">
        {ideas.map((idea) => (
          <li
            key={`${idea.kind}-${idea.value}`}
            className="flex flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {idea.kind === "category" && <span className="text-muted-foreground">Category: </span>}
                {idea.kind === "amount" && <span className="text-muted-foreground">Amount: </span>}
                {idea.value}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Accept" onClick={() => void accept(idea)}>
                <Check className="h-3.5 w-3.5 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Ignore" onClick={() => void dismiss(idea)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {idea.kind === "category" && categoryReasonText && (
              <p className="text-xs text-muted-foreground">{categoryReasonText}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
