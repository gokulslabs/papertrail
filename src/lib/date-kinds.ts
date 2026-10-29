import type { DocDate } from "./types";

export const DATE_KINDS = {
  birthday: { label: "Birthday", past: "Birthday", remindDays: 7 },
  warranty: { label: "Warranty expires", past: "Warranty expired", remindDays: 30 },
  "insurance-renewal": { label: "Insurance renewal", past: "Renewal date passed", remindDays: 30 },
  "agreement-end": { label: "Agreement ends", past: "Agreement ended", remindDays: 60 },
  "bill-due": { label: "Bill due", past: "Due date passed", remindDays: 7 },
  "subscription-renewal": { label: "Subscription renews", past: "Renewed", remindDays: 7 },
  "document-expiry": { label: "Document expires", past: "Expired", remindDays: 90 },
  other: { label: "Important date", past: "Date passed", remindDays: 7 },
} as const;

export type DateKind = keyof typeof DATE_KINDS;

export const DATE_KIND_ORDER: DateKind[] = [
  "birthday",
  "warranty",
  "insurance-renewal",
  "agreement-end",
  "bill-due",
  "subscription-renewal",
  "document-expiry",
  "other",
];

export const REMIND_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "No reminder" },
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
  { value: 14, label: "2 weeks before" },
  { value: 30, label: "1 month before" },
  { value: 60, label: "2 months before" },
  { value: 90, label: "3 months before" },
];

export function isDateKind(value: string): value is DateKind {
  return value in DATE_KINDS;
}

export function inferKind(date: Pick<DocDate, "kind" | "label">): DateKind {
  if (date.kind && isDateKind(date.kind)) return date.kind;
  const label = date.label.toLowerCase();
  if (label.includes("warrant")) return "warranty";
  if (label.includes("subscription")) return "subscription-renewal";
  if (label.includes("renew") || label.includes("insur")) return "insurance-renewal";
  if (label.includes("agreement") || label.includes("lease")) return "agreement-end";
  if (label.includes("due")) return "bill-due";
  if (label.includes("expir")) return "document-expiry";
  return "other";
}

/** Label shown in the library. A custom note replaces the generic "other" kind. */
export function dateLabel(date: Pick<DocDate, "kind" | "label" | "note">): string {
  if (date.kind && isDateKind(date.kind)) {
    if (date.kind === "other" && date.note?.trim()) return date.note.trim();
    return DATE_KINDS[date.kind].label;
  }
  return date.label;
}

export function kindFromContext(context: string): DateKind | null {
  const text = context.toLowerCase().replace(/\s+/g, " ");
  const tail = text.slice(-48);
  if (/warrant|garanti|guarantee|applecare|protection plan/.test(tail)) return "warranty";
  if (/renew/.test(tail)) return /polic|insur|premium|cover/.test(text) ? "insurance-renewal" : "subscription-renewal";
  if (/\bdue\b|pay by|payable by|payment date|due date|forfall/.test(tail)) return "bill-due";
  if (/expir|valid until|valid thru|valid through/.test(tail)) return "document-expiry";
  if (/end date|ends on|lease end|terminat/.test(tail)) return "agreement-end";
  return null;
}
