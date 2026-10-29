import type { DocDate } from "./types";
import { emitChanged, getMeta, setMeta } from "./db";

const KEY = "rememberDates";

/** Personal dates that aren't attached to a document (birthdays, warranties, etc.). */
export interface RememberDate extends DocDate {
  id: string;
  /** Who or what this is about, e.g. "Mom", "AppleCare". */
  title: string;
}

function asList(value: unknown): RememberDate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is RememberDate =>
      !!item &&
      typeof item === "object" &&
      typeof (item as RememberDate).id === "string" &&
      typeof (item as RememberDate).title === "string" &&
      typeof (item as RememberDate).date === "string" &&
      typeof (item as RememberDate).label === "string",
  );
}

export async function listRememberDates(): Promise<RememberDate[]> {
  return asList(await getMeta(KEY, []));
}

export async function saveRememberDates(dates: RememberDate[]): Promise<void> {
  await setMeta(KEY, dates);
  emitChanged();
}

export async function addRememberDate(input: Omit<RememberDate, "id">): Promise<RememberDate> {
  const entry: RememberDate = { ...input, id: crypto.randomUUID() };
  const all = await listRememberDates();
  await saveRememberDates([...all, entry]);
  return entry;
}

export async function updateRememberDate(id: string, patch: Partial<RememberDate>): Promise<void> {
  const all = await listRememberDates();
  await saveRememberDates(all.map((d) => (d.id === id ? { ...d, ...patch, id } : d)));
}

export async function removeRememberDate(id: string): Promise<void> {
  const all = await listRememberDates();
  await saveRememberDates(all.filter((d) => d.id !== id));
}
