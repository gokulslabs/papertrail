import type { DocumentRecord, DocKind, DocDate } from "./types";
import { listDocumentsWithBlobs, listDocuments, putDocument, clearDocuments, getMeta, setMeta, getWorkspace, setWorkspace, documentIdsFor } from "./db";
import { isDateKind } from "./date-kinds";
import { extensionFor, formatSize } from "./extract";
import { MAX_BACKUP_BYTES, MAX_BACKUP_DOCUMENTS, MAX_DOCUMENT_BYTES } from "./limits";

const KINDS = new Set<DocKind>(["pdf", "image", "text", "markdown", "csv", "other"]);
const OCR = new Set(["none", "done", "failed", "unsupported"]);

interface BackupDoc {
  id: string;
  title: string;
  fileName: string;
  kind: DocumentRecord["kind"];
  mime: string;
  size: number;
  addedAt: number;
  updatedAt?: number;
  fileModifiedAt?: number;
  text: string;
  ocrStatus: DocumentRecord["ocrStatus"];
  extraction?: DocumentRecord["extraction"];
  pageCount?: number | undefined;
  tags: string[];
  notes: string;
  dates: DocumentRecord["dates"];
  category: string;
  amount: string;
  documentDate?: string;
  suggested: DocumentRecord["suggested"];
  sha256?: string;
  annotations?: DocumentRecord["annotations"];
  mergedFrom?: string[];
  origin: DocumentRecord["origin"];
  file: string;
  thumbnail?: string;
}

interface BackupMeta {
  autoOcr?: boolean;
  rules?: unknown;
  lastBackup?: string;
  rememberDates?: unknown;
  expenses?: unknown;
  expenseCurrency?: unknown;
}

interface Manifest {
  /** Newer backups use privytrail; older Papertrail ZIPs still restore. */
  app: "privytrail" | "papertrail";
  version: 1 | 2;
  exportedAt: string;
  documents: BackupDoc[];
  meta?: BackupMeta;
  /** True when the ZIP is an export of a selection, not the whole library. */
  partial?: boolean;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function isSafeBackupPath(path: string, folder: "files" | "thumbnails"): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 240) return false;
  if (path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  const prefix = `${folder}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  if (!name || name.includes("/")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function uncompressedSize(entry: { _data?: { uncompressedSize?: number } }): number {
  const size = entry._data?.uncompressedSize;
  return typeof size === "number" ? size : 0;
}

export async function exportBackup(opts?: {
  ids?: string[];
  onProgress?: (done: number, total: number) => void;
  /** When set, the ZIP is encrypted with AES-GCM before download (.enc). */
  password?: string;
}): Promise<number> {
  const JSZip = (await import("jszip")).default;
  const wanted = opts?.ids ? new Set(opts.ids) : null;
  const docs = (await listDocumentsWithBlobs()).filter((doc) => !wanted || wanted.has(doc.id));
  const zip = new JSZip();
  const files = zip.folder("files")!;
  const thumbs = zip.folder("thumbnails")!;
  const manifest: Manifest = {
    app: "privytrail",
    version: 2,
    exportedAt: new Date().toISOString(),
    documents: [],
    meta: {
      autoOcr: await getMeta<boolean>("autoOcr", true),
      rules: await getMeta("rules", { rules: [], customCategories: [] }),
      rememberDates: await getMeta("rememberDates", []),
      expenses: await getMeta("expenses", []),
      expenseCurrency: await getMeta("expenseCurrency", "USD"),
    },
    ...(wanted ? { partial: true } : {}),
  };
  for (const doc of docs) {
    opts?.onProgress?.(manifest.documents.length + 1, docs.length);
    const ext = extensionFor(doc.kind, doc.fileName);
    files.file(`${doc.id}.${ext}`, doc.blob ?? new Blob());
    const entry: BackupDoc = {
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      kind: doc.kind,
      mime: doc.mime,
      size: doc.size,
      addedAt: doc.addedAt,
      ...(typeof doc.updatedAt === "number" ? { updatedAt: doc.updatedAt } : {}),
      ...(typeof doc.fileModifiedAt === "number" ? { fileModifiedAt: doc.fileModifiedAt } : {}),
      text: doc.text,
      ocrStatus: doc.ocrStatus,
      ...(doc.extraction ? { extraction: doc.extraction } : {}),
      pageCount: doc.pageCount,
      tags: doc.tags,
      notes: doc.notes,
      dates: doc.dates,
      category: doc.category,
      amount: doc.amount,
      ...(doc.documentDate ? { documentDate: doc.documentDate } : {}),
      suggested: doc.suggested,
      ...(doc.sha256 ? { sha256: doc.sha256 } : {}),
      ...(doc.annotations?.length ? { annotations: doc.annotations } : {}),
      ...(doc.mergedFrom?.length ? { mergedFrom: doc.mergedFrom } : {}),
      origin: doc.origin,
      file: `files/${doc.id}.${ext}`,
    };
    if (doc.thumbnail) {
      thumbs.file(`${doc.id}.jpg`, doc.thumbnail);
      entry.thumbnail = `thumbnails/${doc.id}.jpg`;
    }
    manifest.documents.push(entry);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  let blob: Blob = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  if (opts?.password?.trim()) {
    const { encryptBlob } = await import("./crypto-backup");
    blob = await encryptBlob(blob, opts.password.trim());
    downloadBlob(blob, `privytrail-backup-${stamp}.zip.enc`);
  } else {
    downloadBlob(blob, `privytrail-backup-${stamp}.zip`);
  }
  const exportedAt = new Date().toISOString();
  await setMeta("lastBackup", exportedAt);
  return docs.length;
}

export type RestoreMode = "merge" | "replace";

export interface RestoreIssue {
  title: string;
  reason: string;
}

export interface RestorePlan {
  mode: RestoreMode;
  documents: DocumentRecord[];
  added: number;
  skipped: number;
  bytes: number;
  dates: number;
  partial: boolean;
  /** Restoring from the sample workspace writes into the real library. */
  intoMain: boolean;
  damaged: RestoreIssue[];
  meta?: BackupMeta | undefined;
}

function asDates(value: unknown): DocDate[] {
  if (!Array.isArray(value)) return [];
  const dates: DocDate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as DocDate;
    if (typeof raw.label !== "string" || typeof raw.date !== "string") continue;
    const date: DocDate = { label: raw.label, date: raw.date };
    if (typeof raw.note === "string") date.note = raw.note;
    if (raw.remindDays === null || typeof raw.remindDays === "number") date.remindDays = raw.remindDays;
    if (raw.status === "open" || raw.status === "done" || raw.status === "dismissed") date.status = raw.status;
    if (raw.source === "user" || raw.source === "found") date.source = raw.source;
    if (typeof raw.kind === "string" && isDateKind(raw.kind)) date.kind = raw.kind;
    if (typeof raw.snippet === "string") date.snippet = raw.snippet;
    if (raw.recurrence === "yearly" || raw.recurrence === "none") date.recurrence = raw.recurrence;
    if (typeof raw.snoozeUntil === "number") date.snoozeUntil = raw.snoozeUntil;
    dates.push(date);
  }
  return dates;
}

function asExtraction(value: unknown): DocumentRecord["extraction"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as DocumentRecord["extraction"];
  if (!raw || typeof raw.source !== "string" || typeof raw.characters !== "number") return undefined;
  if (!["pdf-text", "ocr", "plain", "none"].includes(raw.source)) return undefined;
  const out: NonNullable<DocumentRecord["extraction"]> = {
    source: raw.source,
    characters: raw.characters,
  };
  if (typeof raw.pagesWithText === "number") out.pagesWithText = raw.pagesWithText;
  if (typeof raw.confidence === "number") out.confidence = raw.confidence;
  return out;
}

export async function inspectBackup(zipFile: File | Blob, mode: RestoreMode): Promise<RestorePlan> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipFile);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("This ZIP does not look like a Privytrail backup (manifest.json is missing).");
  }
  const manifest = JSON.parse(await manifestFile.async("string")) as Manifest;
  if ((manifest.app !== "privytrail" && manifest.app !== "papertrail") || !Array.isArray(manifest.documents)) {
    throw new Error("This ZIP was not exported by Privytrail.");
  }
  if (manifest.documents.length > MAX_BACKUP_DOCUMENTS) {
    throw new Error("This backup has too many documents to restore in one go.");
  }

  const prepared: DocumentRecord[] = [];
  const damaged: RestoreIssue[] = [];
  let total = 0;
  for (const entry of manifest.documents) {
    try {
    if (!entry || typeof entry !== "object") throw new Error("Invalid document entry.");
    if (typeof entry.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(entry.id)) {
      throw new Error("Backup manifest has an invalid document id.");
    }
    if (!KINDS.has(entry.kind)) throw new Error(`Backup document ${entry.id} has an unknown file type.`);
    if (!isSafeBackupPath(entry.file, "files")) {
      throw new Error("Backup contains an unsafe file path.");
    }
    const fileEntry = zip.file(entry.file);
    if (!fileEntry) throw new Error(`Backup is missing ${entry.file}.`);
    const declared = uncompressedSize(fileEntry as { _data?: { uncompressedSize?: number } });
    if (declared > MAX_DOCUMENT_BYTES) {
      throw new Error("A file in this backup is larger than 32 MB.");
    }
    total += declared;
    if (total > MAX_BACKUP_BYTES) throw new Error("This backup is too large to restore.");
    const blob = await fileEntry.async("blob");
    if (blob.size > MAX_DOCUMENT_BYTES) {
      throw new Error("A file in this backup is larger than 32 MB.");
    }
    total += declared === 0 ? blob.size : 0;
    if (total > MAX_BACKUP_BYTES) throw new Error("This backup is too large to restore.");

    let thumbnail: Blob | null = null;
    if (entry.thumbnail) {
      if (!isSafeBackupPath(entry.thumbnail, "thumbnails")) {
        throw new Error("Backup contains an unsafe thumbnail path.");
      }
      const thumbEntry = zip.file(entry.thumbnail);
      if (thumbEntry) {
        const thumbSize = uncompressedSize(thumbEntry as { _data?: { uncompressedSize?: number } });
        if (thumbSize > 2 * 1024 * 1024) throw new Error("A thumbnail in this backup is unexpectedly large.");
        thumbnail = await thumbEntry.async("blob");
      }
    }

    const dates = asDates(entry.dates);

    const restored: DocumentRecord = {
      id: entry.id,
      title: asString(entry.title, "Untitled"),
      fileName: asString(entry.fileName, "file"),
      kind: entry.kind,
      mime: asString(entry.mime, "application/octet-stream"),
      size: typeof entry.size === "number" ? entry.size : blob.size,
      addedAt: typeof entry.addedAt === "number" ? entry.addedAt : Date.now(),
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : typeof entry.addedAt === "number" ? entry.addedAt : Date.now(),
      text: asString(entry.text),
      ocrStatus: OCR.has(entry.ocrStatus) ? entry.ocrStatus : "none",
      pageCount: typeof entry.pageCount === "number" ? entry.pageCount : undefined,
      tags: asStringArray(entry.tags),
      notes: asString(entry.notes),
      dates,
      category: asString(entry.category),
      amount: asString(entry.amount),
      suggested: entry.suggested ?? null,
      origin: entry.origin === "sample" ? "sample" : "user",
      blob,
      thumbnail,
    };
    if (typeof entry.fileModifiedAt === "number") restored.fileModifiedAt = entry.fileModifiedAt;
    const extraction = asExtraction(entry.extraction);
    if (extraction) restored.extraction = extraction;
    if (typeof entry.documentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.documentDate)) {
      restored.documentDate = entry.documentDate;
    }
    if (typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/i.test(entry.sha256)) {
      restored.sha256 = entry.sha256.toLowerCase();
    }
    if (Array.isArray(entry.annotations)) {
      restored.annotations = entry.annotations.filter(
        (a) => a && typeof a.id === "string" && typeof a.quote === "string" && typeof a.page === "number",
      );
    }
    if (Array.isArray(entry.mergedFrom)) {
      restored.mergedFrom = entry.mergedFrom.filter((id): id is string => typeof id === "string");
    }
    prepared.push(restored);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not read this file.";
      if (reason === "This backup is too large to restore.") throw err;
      damaged.push({
        title: entry && typeof entry.title === "string" ? entry.title : "A document",
        reason,
      });
    }
  }

  const intoMain = getWorkspace() === "sample";
  const existing = await documentIdsFor(intoMain ? "main" : getWorkspace());
  const skipped = mode === "merge" ? prepared.filter((doc) => existing.has(doc.id)).length : 0;
  const plan: RestorePlan = {
    mode,
    documents: prepared,
    added: prepared.length - skipped,
    skipped,
    bytes: prepared.reduce((sum, doc) => sum + (doc.blob?.size ?? doc.size), 0),
    dates: prepared.reduce((sum, doc) => sum + doc.dates.length, 0),
    partial: manifest.partial === true,
    intoMain,
    damaged,
  };
  if (manifest.meta) plan.meta = manifest.meta;
  return plan;
}

export async function commitRestore(
  plan: RestorePlan,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (getWorkspace() === "sample") setWorkspace("main");
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota) {
    const usage = estimate.usage ?? 0;
    const freeing =
      plan.mode === "replace"
        ? (await listDocuments()).reduce((sum, doc) => sum + doc.size, 0)
        : 0;
    if (usage - freeing + plan.bytes > estimate.quota) {
      throw new Error("There isn't enough browser storage left to restore this backup.");
    }
  }
  const existing = new Set((await listDocuments()).map((doc) => doc.id));
  if (plan.mode === "replace") await clearDocuments();
  const writing = plan.documents.filter((doc) => plan.mode !== "merge" || !existing.has(doc.id));
  let written = 0;
  for (const doc of writing) {
    await putDocument(doc);
    written++;
    onProgress?.(written, writing.length);
  }
  if (plan.meta) {
    if (typeof plan.meta.autoOcr === "boolean") await setMeta("autoOcr", plan.meta.autoOcr);
    if (plan.meta.rules && typeof plan.meta.rules === "object") await setMeta("rules", plan.meta.rules);
    if (Array.isArray(plan.meta.rememberDates)) await setMeta("rememberDates", plan.meta.rememberDates);
    if (Array.isArray(plan.meta.expenses)) await setMeta("expenses", plan.meta.expenses);
    if (typeof plan.meta.expenseCurrency === "string" && plan.meta.expenseCurrency.trim()) {
      await setMeta("expenseCurrency", plan.meta.expenseCurrency.trim().toUpperCase());
    }
  }
  return written;
}

/* ---------- Calendar (.ics) export ---------- */

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export interface IcsEvent {
  title: string;
  label: string;
  date: string;
  remindDays?: number | null | undefined;
  recurrence?: "none" | "yearly";
}

/** Stable across exports so calendar apps update the same event instead of duplicating it. */
export function icsUid(ev: IcsEvent): string {
  const raw = `${ev.date}|${ev.label}|${ev.title}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash, 33) ^ raw.charCodeAt(i);
  return `${(hash >>> 0).toString(16)}-${icsDate(ev.date)}@privytrail`;
}

export function buildIcs(events: IcsEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Privytrail//Reminders//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsUid(ev)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(ev.date))}`,
      `SUMMARY:${icsEscape(`${ev.label} — ${ev.title}`)}`,
      "DESCRIPTION:Exported from Privytrail",
      ...(ev.recurrence === "yearly" ? ["RRULE:FREQ=YEARLY"] : []),
      ...alarmLines(ev.remindDays),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function alarmLines(remindDays: number | null | undefined): string[] {
  if (remindDays === null) return [];
  const days = remindDays ?? 0;
  const trigger = days <= 0 ? "PT0S" : `-P${Math.round(days)}D`;
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Privytrail reminder",
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function downloadIcs(events: IcsEvent[]): void {
  if (!events.length) return;
  const first = events[0];
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  downloadBlob(blob, events.length === 1 && first ? `reminder-${first.date}.ics` : "privytrail-reminders.ics");
}

export function describeDoc(doc: DocumentRecord): string {
  return `${doc.title} (${formatSize(doc.size)})`;
}
