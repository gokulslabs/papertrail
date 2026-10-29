import { DATE_KINDS, kindFromContext } from "./date-kinds";
import type { DocDate, SuggestedAmount, Suggestions } from "./types";

/**
 * Simple, local pattern matching. Everything produced here is a *suggestion*
 * and is never applied to a document until the user accepts it.
 */

const CATEGORY_RULES: Array<[string, RegExp, string[]]> = [
  ["Receipts & purchases", /\breceipt\b|\bkvitto\b|thank you for (shopping|your purchase)|cashier/i, ["receipt", "kvitto", "purchase", "cashier"]],
  ["Bills & utilities", /\bbill\b|\bfaktura\b|invoice|amount due|total to pay|due date|autogiro/i, ["bill", "faktura", "invoice", "due date"]],
  ["Warranties & manuals", /warranty|garanti|guarantee|manual|bruksanvisning|maintenance|installasjon/i, ["warranty", "garanti", "manual"]],
  ["Insurance", /insurance|policy no|f[oö]rs[aä]kring|premium/i, ["insurance", "policy", "försäkring"]],
  ["Financial", /statement|balance SEK|saldo/i, ["statement", "balance", "saldo"]],
  ["Identity & travel", /\bpassport\b|\bvisa\b|\btravel\b|\bid card\b|\bboarding pass\b/i, ["passport", "visa", "travel", "boarding pass"]],
];

function matchedWords(haystack: string, candidates: string[]): string[] {
  const lower = haystack.toLowerCase();
  return candidates.filter((word) => lower.includes(word.toLowerCase()));
}

export function suggestCategory(text: string, fileName: string): { category?: string; reasons?: string[] } {
  const haystack = `${fileName} ${text.slice(0, 4000)}`;
  for (const [category, re, words] of CATEGORY_RULES) {
    if (re.test(haystack)) {
      const reasons = matchedWords(haystack, words);
      return { category, reasons: reasons.length ? reasons : undefined };
    }
  }
  return {};
}

const CURRENCY =
  /(?:SEK|NOK|DKK|USD|EUR|kr\.?|\$|€|£)\s?\d[\d ,.\u00a0']*\d|\d[\d ,.\u00a0']*\s?(?:SEK|NOK|DKK|USD|EUR|kr)/gi;

const AMOUNT_LABEL =
  /\b(total|subtotal|amount due|grand total|balance|sum|to pay|moms|vat|tax)\b/i;

export function suggestAmounts(text: string): string[] {
  return suggestAmountDetails(text).map((a) => a.value);
}

export function suggestAmountDetails(text: string): SuggestedAmount[] {
  const details: SuggestedAmount[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CURRENCY)) {
    const value = m[0].replace(/\s+/g, " ").trim();
    if (!/\d/.test(value) || seen.has(value)) continue;
    seen.add(value);
    const start = Math.max(0, (m.index ?? 0) - 40);
    const before = text.slice(start, m.index ?? 0);
    const labelMatch = before.match(AMOUNT_LABEL);
    const label = labelMatch?.[1]
      ? labelMatch[1].replace(/\b\w/g, (c) => c.toUpperCase())
      : undefined;
    details.push(label ? { value, label } : { value });
    if (details.length >= 6) break;
  }
  return details;
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
    const end = Math.min(text.length, (m.index ?? 0) + date.length + 70);
    const context = text.slice(start, end);
    const snippet = context.replace(/\s+/g, " ").trim();
    const kind = kindFromContext(context);
    const label = kind ? DATE_KINDS[kind].label : (labelFromContext(context) ?? "Date");
    if (found.length < 8 && !found.some((f) => f.date === date && f.label === label)) {
      found.push(
        kind
          ? { date, label, kind, source: "found", snippet }
          : { date, label, source: "found", snippet },
      );
    }
  }
  return found;
}

/** Best candidate for the issued/purchase date of the document itself. */
export function suggestDocumentDate(text: string, dates = suggestDates(text)): string | undefined {
  const preferred = dates.find((d) =>
    /purchase|bill|invoice|issued|statement|receipt|policy date/i.test(d.label),
  );
  return preferred?.date ?? dates[0]?.date;
}

export function suggestFor(text: string, fileName: string): Suggestions {
  const trimmed = text.slice(0, 20000);
  const { category, reasons } = suggestCategory(trimmed, fileName);
  const amountDetails = suggestAmountDetails(trimmed);
  const dates = suggestDates(trimmed);
  const documentDate = suggestDocumentDate(trimmed, dates);
  return {
    category,
    categoryReasons: reasons,
    amounts: amountDetails.map((a) => a.value),
    amountDetails,
    dates,
    documentDate,
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
