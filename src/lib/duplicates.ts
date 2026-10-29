import type { DocumentRecord } from "./types";
import { deleteDocument, getDocument, patchDocument, putDocument } from "./db";

export interface DuplicateGroup {
  sha256: string;
  docs: DocumentRecord[];
}

/** Groups documents that share the same SHA-256 (exact file duplicates). */
export function findDuplicateGroups(docs: DocumentRecord[]): DuplicateGroup[] {
  const byHash = new Map<string, DocumentRecord[]>();
  for (const doc of docs) {
    if (!doc.sha256) continue;
    const list = byHash.get(doc.sha256) ?? [];
    list.push(doc);
    byHash.set(doc.sha256, list);
  }
  return [...byHash.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([sha256, group]) => ({
      sha256,
      docs: group.sort((a, b) => b.addedAt - a.addedAt),
    }))
    .sort((a, b) => b.docs.length - a.docs.length);
}

/**
 * Merge `sourceIds` into `keepId`: union tags/dates/notes/annotations/category/amount,
 * keep the keeper's file, delete the others.
 */
export async function mergeDocuments(keepId: string, sourceIds: string[]): Promise<DocumentRecord | undefined> {
  const keep = await getDocument(keepId);
  if (!keep) return undefined;
  const others = (
    await Promise.all(sourceIds.filter((id) => id !== keepId).map((id) => getDocument(id)))
  ).filter((d): d is DocumentRecord => !!d);

  const tags = [...new Set([...keep.tags, ...others.flatMap((d) => d.tags)])];
  const notes = [keep.notes, ...others.map((d) => d.notes).filter(Boolean)]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const dateKey = (d: { label: string; date: string }) => `${d.label}|${d.date}`;
  const datesMap = new Map(keep.dates.map((d) => [dateKey(d), d]));
  for (const d of others.flatMap((o) => o.dates)) {
    if (!datesMap.has(dateKey(d))) datesMap.set(dateKey(d), d);
  }
  const annotations = [
    ...(keep.annotations ?? []),
    ...others.flatMap((o) => o.annotations ?? []),
  ];
  const mergedFrom = [
    ...(keep.mergedFrom ?? []),
    ...others.map((o) => o.id),
    ...others.flatMap((o) => o.mergedFrom ?? []),
  ];

  const next: DocumentRecord = {
    ...keep,
    tags,
    notes,
    dates: [...datesMap.values()],
    category: keep.category.trim() || others.find((o) => o.category.trim())?.category || "",
    amount: keep.amount.trim() || others.find((o) => o.amount.trim())?.amount || "",
    documentDate: keep.documentDate || others.find((o) => o.documentDate)?.documentDate,
    annotations: annotations.length ? annotations : undefined,
    mergedFrom: [...new Set(mergedFrom)],
    updatedAt: Date.now(),
  };

  await putDocument(next);
  for (const other of others) {
    await deleteDocument(other.id);
  }
  return getDocument(keepId);
}

/** Keep newest, delete older exact duplicates in a group. */
export async function keepNewestDeleteRest(group: DuplicateGroup): Promise<number> {
  const [newest, ...rest] = group.docs;
  if (!newest) return 0;
  for (const doc of rest) await deleteDocument(doc.id);
  if (rest.length) {
    await patchDocument(newest.id, {
      mergedFrom: [...new Set([...(newest.mergedFrom ?? []), ...rest.map((d) => d.id)])],
    });
  }
  return rest.length;
}
