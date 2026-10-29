import type { DocumentRecord, SmartView } from "./types";
import { getMeta, setMeta } from "./db";
import { daysUntil, effectiveDate, isOpenReminder } from "./reminders";
import { EMPTY_FILTER, matchesFilter, type LibraryFilter } from "./library-view";
import { userDates } from "./library-view";

const KEY = "smartViews";

export const BUILTIN_SMART_VIEWS: SmartView[] = [
  {
    id: "uncategorized-month",
    name: "Uncategorized this month",
    builtin: true,
    filter: {
      categories: ["__none__"],
      dateField: "added",
      datePreset: "30d",
    },
  },
  {
    id: "needs-attention",
    name: "Needs attention",
    builtin: true,
    filter: { attention: true },
  },
  {
    id: "warranties-90d",
    name: "Warranties ending in 90 days",
    builtin: true,
    filter: {
      withDates: true,
      endingWithinDays: 90,
      dateKinds: ["warranty", "document-expiry"],
    },
  },
  {
    id: "has-dates",
    name: "Has important dates",
    builtin: true,
    filter: { withDates: true },
  },
];

export async function listSmartViews(): Promise<SmartView[]> {
  const custom = await getMeta<SmartView[]>(KEY, []);
  const safe = Array.isArray(custom) ? custom.filter((v) => v && typeof v.id === "string" && typeof v.name === "string") : [];
  const customIds = new Set(safe.map((v) => v.id));
  return [...BUILTIN_SMART_VIEWS.filter((v) => !customIds.has(v.id)), ...safe];
}

export async function saveSmartView(view: SmartView): Promise<void> {
  const all = await getMeta<SmartView[]>(KEY, []);
  const list = Array.isArray(all) ? all.filter((v) => !v.builtin) : [];
  const next = list.filter((v) => v.id !== view.id);
  next.push({ ...view, builtin: false });
  await setMeta(KEY, next);
}

export async function deleteSmartView(id: string): Promise<void> {
  if (BUILTIN_SMART_VIEWS.some((v) => v.id === id)) return;
  const all = await getMeta<SmartView[]>(KEY, []);
  await setMeta(
    KEY,
    (Array.isArray(all) ? all : []).filter((v) => v.id !== id),
  );
}

export function smartViewToFilter(view: SmartView): LibraryFilter {
  const f = view.filter;
  return {
    ...EMPTY_FILTER,
    categories: f.categories ?? [],
    tags: f.tags ?? [],
    kinds: f.kinds ?? [],
    dateField: f.dateField ?? "added",
    datePreset: f.datePreset ?? "any",
    from: f.from ?? "",
    to: f.to ?? "",
    attention: !!f.attention,
    withDates: !!f.withDates,
    notesOnly: !!f.notesOnly,
  };
}

/** Extra smart-view constraints not expressible as LibraryFilter alone. */
export function matchesSmartExtras(doc: DocumentRecord, view: SmartView, now = Date.now()): boolean {
  const f = view.filter;
  if (typeof f.endingWithinDays === "number") {
    const dates = userDates(doc.dates).filter((d) => {
      if (f.dateKinds?.length && (!d.kind || !f.dateKinds.includes(d.kind))) return false;
      if (!isOpenReminder(d, new Date(now))) return false;
      const days = daysUntil(effectiveDate(d, new Date(now)), new Date(now));
      return days >= 0 && days <= f.endingWithinDays!;
    });
    if (!dates.length) return false;
  }
  return true;
}

export function applySmartView(docs: DocumentRecord[], view: SmartView, now = Date.now()): DocumentRecord[] {
  const filter = smartViewToFilter(view);
  return docs.filter((doc) => matchesFilter(doc, filter, now) && matchesSmartExtras(doc, view, now));
}
