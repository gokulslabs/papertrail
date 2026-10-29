import { processFile, type ProcessStage } from "./process";
import { MAX_DOCUMENT_BYTES } from "./limits";

export type ImportRowStatus = ProcessStage | "waiting";

export interface ImportRow {
  id: string;
  fileName: string;
  size: number;
  status: ImportRowStatus;
  detail: string;
  error?: string;
}

export interface ImportSession {
  id: string;
  total: number;
  saved: number;
  rows: ImportRow[];
  done: boolean;
  collapsed: boolean;
  label: string;
}

type Listener = () => void;

let session: ImportSession | null = null;
const listeners = new Set<Listener>();
const skipIds = new Set<string>();
const cancelIds = new Set<string>();

function emit() {
  for (const fn of listeners) fn();
}

export function getImportSession(): ImportSession | null {
  return session;
}

export function subscribeImport(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setImportCollapsed(collapsed: boolean) {
  if (!session) return;
  session = { ...session, collapsed };
  emit();
}

export function clearImportSession() {
  if (!session) return;
  if (!session.done) {
    // Keep in-progress rows; only clear finished panel when done.
    session = {
      ...session,
      rows: session.rows.filter((r) => r.status !== "done" && r.status !== "failed" && r.status !== "skipped"),
    };
    if (!session.rows.length) session = null;
  } else {
    session = null;
  }
  emit();
}

export function dismissImportRow(id: string) {
  if (!session) return;
  session = { ...session, rows: session.rows.filter((r) => r.id !== id) };
  if (!session.rows.length && session.done) session = null;
  emit();
}

export function skipImportRow(id: string) {
  skipIds.add(id);
  if (!session) return;
  session = {
    ...session,
    rows: session.rows.map((r) =>
      r.id === id && (r.status === "queued" || r.status === "waiting")
        ? { ...r, status: "skipped", detail: "Skipped" }
        : r,
    ),
  };
  emit();
}

export function cancelImportRow(id: string) {
  cancelIds.add(id);
  if (!session) return;
  session = {
    ...session,
    rows: session.rows.map((r) =>
      r.id === id && r.status !== "done" && r.status !== "failed" && r.status !== "skipped"
        ? { ...r, status: "skipped", detail: "Cancelled" }
        : r,
    ),
  };
  emit();
}

function patchRow(id: string, patch: Partial<ImportRow>) {
  if (!session) return;
  session = {
    ...session,
    rows: session.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
  emit();
}

function stageDetail(stage: ProcessStage, fallback?: string): string {
  if (fallback) return fallback;
  switch (stage) {
    case "queued":
    case "waiting":
      return "Waiting to read text";
    case "opening":
      return "Opening…";
    case "reading":
      return "Reading text…";
    case "ocr":
      return "Reading text…";
    case "hashing":
      return "Checking file…";
    case "saving":
      return "Saving…";
    case "done":
      return "Added";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Working…";
  }
}

function isSupported(file: File): boolean {
  const kind = file.name.toLowerCase().match(/\.(pdf|jpe?g|png|webp|txt|md|markdown|csv)$/);
  return !!kind || file.type.startsWith("text/") || file.type.startsWith("image/");
}

export async function runImport(
  files: File[],
  opts?: { label?: string; process?: (file: File, onProgress: (p: { stage: ProcessStage; detail?: string }) => void) => Promise<unknown> },
): Promise<number> {
  const accepted = files.filter(isSupported).filter((f) => f.size <= MAX_DOCUMENT_BYTES);
  if (!accepted.length) return 0;

  const rows: ImportRow[] = accepted.map((file) => ({
    id: crypto.randomUUID(),
    fileName: file.name,
    size: file.size,
    status: "waiting",
    detail: "Waiting to read text",
  }));

  session = {
    id: crypto.randomUUID(),
    total: rows.length,
    saved: 0,
    rows,
    done: false,
    collapsed: false,
    label: opts?.label ?? `Adding ${rows.length} documents…`,
  };
  emit();

  let saved = 0;
  const process = opts?.process ?? ((file, onProgress) => processFile(file, undefined, onProgress));

  for (let i = 0; i < accepted.length; i++) {
    const file = accepted[i]!;
    const row = session.rows[i]!;
    if (skipIds.has(row.id)) {
      skipIds.delete(row.id);
      continue;
    }
    patchRow(row.id, { status: "opening", detail: "Opening…" });
    if (cancelIds.has(row.id)) {
      cancelIds.delete(row.id);
      patchRow(row.id, { status: "skipped", detail: "Cancelled" });
      continue;
    }
    try {
      await process(file, ({ stage, detail }) => {
        if (cancelIds.has(row.id)) return;
        patchRow(row.id, { status: stage, detail: stageDetail(stage, detail) });
      });
      if (cancelIds.has(row.id)) {
        cancelIds.delete(row.id);
        patchRow(row.id, { status: "skipped", detail: "Cancelled" });
        continue;
      }
      saved++;
      const sizeLabel =
        file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} kB`;
      patchRow(row.id, { status: "done", detail: `Added · ${sizeLabel}` });
      if (session) {
        session = {
          ...session,
          saved,
          label: `Adding ${session.total} documents…`,
        };
        emit();
      }
    } catch (err) {
      console.error(err);
      patchRow(row.id, {
        status: "failed",
        detail: "Failed",
        error: err instanceof Error ? err.message : "Could not read file",
      });
    }
  }

  if (session) {
    session = {
      ...session,
      saved,
      done: true,
      label: `${saved} ${saved === 1 ? "document" : "documents"} added`,
    };
    emit();
  }
  return saved;
}
