import type { DocDate, DocKind, DocumentRecord } from "./types";
import { snipText } from "./suggest";

export type DatePreset = "any" | "7d" | "30d" | "12m" | "custom";

export interface LibraryFilter {
  categories: string[];
  tags: string[];
  kinds: DocKind[];
  dateField: "added" | "document";
  datePreset: DatePreset;
  from: string;
  to: string;
  attention: boolean;
  withDates: boolean;
}

export const EMPTY_FILTER: LibraryFilter = {
  categories: [],
  tags: [],
  kinds: [],
  dateField: "added",
  datePreset: "any",
  from: "",
  to: "",
  attention: false,
  withDates: false,
};

export type LibrarySort = "recent" | "oldest" | "title" | "relevance";

export function needsAttention(doc: DocumentRecord): boolean {
  if (!doc.category.trim()) return true;
  if ((doc.kind === "image" || doc.kind === "pdf") && !doc.text.trim()) return true;
  return doc.ocrStatus === "failed";
}

export function changedAt(doc: DocumentRecord): number {
  return doc.updatedAt ?? doc.addedAt;
}

function occurrences(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  const h = haystack.toLowerCase();
  const q = needle.toLowerCase();
  let count = 0;
  let index = 0;
  while ((index = h.indexOf(q, index)) !== -1) {
    count++;
    index += q.length;
  }
  return count;
}

export interface SearchHit {
  doc: DocumentRecord;
  score: number;
  /** How many times the query appears across the document. */
  hits: number;
  snippet: string | null;
  page: number | null;
}

function pageOf(text: string, query: string, pageCount?: number): number | null {
  if (!pageCount || pageCount < 2) return null;
  const pages = text.split(/\n\n/);
  const q = query.toLowerCase();
  const index = pages.findIndex((page) => page.toLowerCase().includes(q));
  return index === -1 ? null : index + 1;
}

export function searchHit(doc: DocumentRecord, query: string): SearchHit | null {
  const q = query.trim();
  if (!q) return { doc, score: 0, hits: 0, snippet: null, page: null };
  const inTitle = occurrences(doc.title, q);
  const inName = occurrences(doc.fileName, q);
  const inTags = occurrences(doc.tags.join(" "), q);
  const inNotes = occurrences(doc.notes, q);
  const inCategory = occurrences(doc.category, q);
  const inText = occurrences(doc.text, q);
  const score = inTitle * 8 + inName * 4 + inTags * 4 + inNotes * 2 + inCategory * 2 + inText;
  if (score === 0) return null;
  return {
    doc,
    score,
    hits: inTitle + inName + inTags + inNotes + inCategory + inText,
    snippet: snipText(doc.text || doc.notes, q),
    page: pageOf(doc.text, q, doc.pageCount),
  };
}

function startOfRange(preset: DatePreset, from: string, now: number): number | null {
  if (preset === "any") return null;
  if (preset === "custom") return from ? new Date(`${from}T00:00:00`).getTime() : null;
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 365;
  return now - days * 86400000;
}

function matchesDate(doc: DocumentRecord, filter: LibraryFilter, now: number): boolean {
  if (filter.datePreset === "any") return true;
  const start = startOfRange(filter.datePreset, filter.from, now);
  const end = filter.datePreset === "custom" && filter.to ? new Date(`${filter.to}T23:59:59`).getTime() : now;
  if (filter.dateField === "added") {
    if (start != null && doc.addedAt < start) return false;
    if (filter.datePreset === "custom" && filter.to && doc.addedAt > end) return false;
    return true;
  }
  return doc.dates.some((date) => {
    const ts = new Date(`${date.date}T00:00:00`).getTime();
    if (Number.isNaN(ts)) return false;
    if (start != null && ts < start) return false;
    if (filter.datePreset === "custom" && filter.to && ts > end) return false;
    return true;
  });
}

export function matchesFilter(doc: DocumentRecord, filter: LibraryFilter, now = Date.now()): boolean {
  if (filter.categories.length && !filter.categories.includes(doc.category.trim() || "__none__")) return false;
  if (filter.tags.length && !filter.tags.some((tag) => doc.tags.includes(tag))) return false;
  if (filter.kinds.length && !filter.kinds.includes(doc.kind)) return false;
  if (filter.attention && !needsAttention(doc)) return false;
  if (filter.withDates && doc.dates.filter((date) => date.source !== "found").length === 0) return false;
  return matchesDate(doc, filter, now);
}

export function filterActive(filter: LibraryFilter): boolean {
  return (
    filter.categories.length > 0 ||
    filter.tags.length > 0 ||
    filter.kinds.length > 0 ||
    filter.datePreset !== "any" ||
    filter.attention ||
    filter.withDates
  );
}

export function orderDocuments(hits: SearchHit[], sort: LibrarySort, searching: boolean): SearchHit[] {
  const list = hits.slice();
  const mode = searching && sort === "recent" ? "relevance" : sort;
  list.sort((a, b) => {
    if (mode === "relevance") return b.score - a.score || b.doc.addedAt - a.doc.addedAt;
    if (mode === "oldest") return a.doc.addedAt - b.doc.addedAt;
    if (mode === "title") return a.doc.title.localeCompare(b.doc.title);
    return b.doc.addedAt - a.doc.addedAt;
  });
  return list;
}

export function userDates(dates: DocDate[]): DocDate[] {
  return dates.filter((date) => date.source !== "found");
}
