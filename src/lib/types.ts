export type DocKind = "pdf" | "image" | "text" | "markdown" | "csv" | "other";

export type TextSource = "pdf-text" | "ocr" | "plain" | "none";

export interface TextExtraction {
  /** How the stored text was obtained. */
  source: TextSource;
  /** Character count of extracted text at extraction time. */
  characters: number;
  /** PDF pages that had a non-empty text layer (PDFs only). */
  pagesWithText?: number;
  /** OCR confidence 0–100 when source is OCR. */
  confidence?: number;
}

export type DateRecurrence = "none" | "yearly";

export interface DocDate {
  label: string;
  /** ISO date, yyyy-mm-dd */
  date: string;
  /** Warranty, renewal, due date, and the other built-in kinds. */
  kind?:
    | "birthday"
    | "warranty"
    | "insurance-renewal"
    | "agreement-end"
    | "bill-due"
    | "subscription-renewal"
    | "document-expiry"
    | "other";
  note?: string;
  /** Days before the date to remind. Null means the date is not a reminder. */
  remindDays?: number | null;
  status?: "open" | "done" | "dismissed";
  /** Printed in the file, not a deadline until the user adds it. */
  source?: "user" | "found";
  /** Short snippet of surrounding text when found by pattern matching. */
  snippet?: string;
  /** Yearly renewals — next occurrence rolls forward after the date passes. */
  recurrence?: DateRecurrence;
  /** Hide from upcoming until this unix ms timestamp. */
  snoozeUntil?: number;
}

export interface SuggestedAmount {
  value: string;
  /** Nearby label when one is detected, e.g. "Total". */
  label?: string;
}

export interface Suggestions {
  category?: string | undefined;
  /** Matched words that triggered the category suggestion. */
  categoryReasons?: string[];
  amounts: string[];
  /** Amounts with nearby labels when detected. */
  amountDetails?: SuggestedAmount[];
  dates: DocDate[];
  /** Suggested issued/purchase date (ISO), not applied until confirmed. */
  documentDate?: string;
}

/** Local PDF/text highlight stored only in IndexedDB. */
export interface DocAnnotation {
  id: string;
  /** 1-based page for PDFs; 1 for images/text. */
  page: number;
  /** Selected / noted text. */
  quote: string;
  note?: string;
  color?: "yellow" | "green" | "pink";
  createdAt: number;
}

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  kind: DocKind;
  mime: string;
  size: number;
  addedAt: number;
  /** Last edit. Missing on documents saved before this field existed. */
  updatedAt?: number;
  /** File's lastModified from the OS at import time. */
  fileModifiedAt?: number;
  /** Extracted text (PDF text layer, OCR result or plain file text). */
  text: string;
  /** Whether OCR has been run for this document. */
  ocrStatus: "none" | "done" | "failed" | "unsupported";
  /** Provenance and stats for extracted text. */
  extraction?: TextExtraction;
  thumbnail: Blob | null;
  pageCount?: number | undefined;
  tags: string[];
  notes: string;
  dates: DocDate[];
  category: string;
  amount: string;
  /**
   * When the document was issued (purchase/bill date). Separate from important dates.
   * Only set when the user confirms a suggestion or picks a date.
   */
  documentDate?: string;
  /** Pattern-matched suggestions, never applied until accepted. */
  suggested: Suggestions | null;
  /** SHA-256 of the original file bytes (hex). */
  sha256?: string;
  /** Local highlights / notes on the document. */
  annotations?: DocAnnotation[];
  /**
   * Other document ids that were merged into this one (same receipt, different scans).
   * Originals are deleted after merge; metadata is kept here for history.
   */
  mergedFrom?: string[];
  origin: "user" | "sample";
  /** The original file, stored in the browser. */
  blob: Blob | null;
}

export type Workspace = "main" | "sample";

/** Named library filter preset stored in meta. */
export interface SmartView {
  id: string;
  name: string;
  /** Built-in presets are not deletable. */
  builtin?: boolean;
  filter: {
    categories?: string[];
    tags?: string[];
    kinds?: DocKind[];
    dateField?: "added" | "document";
    datePreset?: "any" | "7d" | "30d" | "12m" | "custom";
    from?: string;
    to?: string;
    attention?: boolean;
    withDates?: boolean;
    notesOnly?: boolean;
    /** Relative window for next important date, e.g. ending within N days. */
    endingWithinDays?: number;
    dateKinds?: Array<NonNullable<DocDate["kind"]>>;
  };
}
