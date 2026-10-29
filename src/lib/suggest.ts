import { DATE_KINDS, kindFromContext } from "./date-kinds";
import type { DocDate, Suggestions } from "./types";

/**
 * Simple, local pattern matching. Everything produced here is a *suggestion*
 * and is never applied to a document until the user accepts it.
 */

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["Receipts & purchases", /\breceipt\b|\bkvitto\b|thank you for (shopping|your purchase)|cashier/i],
  ["Bills & utilities", /\bbill\b|\bfaktura\b|invoice|amount due|total to pay|due date|autogiro/i],
  ["Warranties & manuals", /warranty|garanti|guarantee|manual|bruksanvisning|maintenance|installasjon/i],
  ["Insurance", /insurance|policy no|f[oö]rs[aä]kring|premium/i],
  ["Financial", /statement|balance SEK|saldo/i],
];

export function suggestCategory(text: string, fileName: string): string | undefined {
  const haystack = `${fileName} ${text.slice(0, 4000)}`;
  for (const [category, re] of CATEGORY_RULES) {
    if (re.test(haystack)) return category;
  }
  return undefined;
}

const CURRENCY =
  /(?:SEK|NOK|DKK|USD|EUR|kr\.?|\$|€|£)\s?\d[\d ,.\u00a0']*\d|\d[\d ,.\u00a0']*\s?(?:SEK|NOK|DKK|USD|EUR|kr)/gi;

export function suggestAmounts(text: string): string[] {
  const matches = text.match(CURRENCY) ?? [];
  const cleaned = matches
    .map((m) => m.replace(/\s+/g, " ").trim())
    .filter((m) => /\d/.test(m));
  return Array.from(new Set(cleaned)).slice(0, 6);
}

const ISO_DATE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;

function labelFromContext(context: string): string | null {
  const c = context.toLowerCase();
  if (/warrant|garanti|guarantee|expire/.test(c)) return "Warranty expiry";
  if (/due date|to pay|f?orfall/.test(c)) return "Due date";
  if (/renewal|f[oö]rnyelse/.test(c)) return "Renewal";
  if (/appointment|follow-up|visit/.test(c)) return "Appointment";
  if (/purchase|kj[oø]pt|purchased|bought/.test(c)) return "Purchase date";
  if (/policy|period|insured/.test(c)) return "Policy date";
  return null;
}

export function suggestDates(text: string): DocDate[] {
  const found: DocDate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ISO_DATE)) {
    const date = m[0];
    if (seen.has(date)) continue;
    seen.add(date);
    const start = Math.max(0, (m.index ?? 0) - 70);
    const context = text.slice(start, (m.index ?? 0) + date.length + 70);
    const kind = kindFromContext(context);
    const label = kind ? DATE_KINDS[kind].label : (labelFromContext(context) ?? "Date");
    if (found.length < 4 && !found.some((f) => f.date === date && f.label === label)) {
      found.push(kind ? { date, label, kind, source: "found" } : { date, label, source: "found" });
    }
  }
  return found;
}

export function suggestFor(text: string, fileName: string): Suggestions {
  const trimmed = text.slice(0, 20000);
  return {
    category: suggestCategory(trimmed, fileName),
    amounts: suggestAmounts(trimmed),
    dates: suggestDates(trimmed),
  };
}

/** Find a short passage around the first match of a query. */
export function snipText(
  text: string,
  query: string,
  radius = 110,
): string | null {
  if (!query || !text) return null;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}
