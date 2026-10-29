export type DocKind = "pdf" | "image" | "text" | "markdown" | "csv" | "other";

export interface DocDate {
  label: string;
  /** ISO date, yyyy-mm-dd */
  date: string;
  /** Warranty, renewal, due date, and the other built-in kinds. */
  kind?:
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
}

export interface Suggestions {
  category?: string | undefined;
  amounts: string[];
  dates: DocDate[];
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
  /** Extracted text (PDF text layer, OCR result or plain file text). */
  text: string;
  /** Whether OCR has been run for this document. */
  ocrStatus: "none" | "done" | "failed" | "unsupported";
  thumbnail: Blob | null;
  pageCount?: number | undefined;
  tags: string[];
  notes: string;
  dates: DocDate[];
  category: string;
  amount: string;
  /** Pattern-matched suggestions, never applied until accepted. */
  suggested: Suggestions | null;
  origin: "user" | "sample";
  /** The original file, stored in the browser. */
  blob: Blob | null;
}

export type Workspace = "main" | "sample";
