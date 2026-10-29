import type { DocumentRecord } from "./types";
import { getMeta, setMeta, listDocuments, patchDocument } from "./db";

/**
 * The eight built-in categories shown in Settings. They cannot be renamed or
 * removed; custom categories are stored per workspace alongside them.
 */
export const BUILT_IN_CATEGORIES = [
  "Receipts & purchases",
  "Bills & utilities",
  "Warranties & manuals",
  "Insurance",
  "Financial",
  "Rental & property",
  "Identity & travel",
  "Other",
] as const;

export interface AutoRule {
  id: string;
  /** Which text the rule matches: the file name or the document text. */
  field: "name" | "text" | "either";
  contains: string;
  /** Empty when the rule only adds a tag. */
  category: string;
  /** Added to matching documents. A category you chose yourself is left alone. */
  tag?: string;
}

interface RulesMeta {
  rules: AutoRule[];
  customCategories: string[];
}

const EMPTY: RulesMeta = { rules: [], customCategories: [] };

async function getRulesMeta(): Promise<RulesMeta> {
  const value = await getMeta<Partial<RulesMeta>>("rules", EMPTY);
  if (!value || !Array.isArray(value.rules) || !Array.isArray(value.customCategories)) return EMPTY;
  return { rules: value.rules, customCategories: value.customCategories };
}

export async function getRules(): Promise<AutoRule[]> {
  return (await getRulesMeta()).rules;
}

export async function getCustomCategories(): Promise<string[]> {
  return (await getRulesMeta()).customCategories;
}

export async function addCustomCategory(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const meta = await getRulesMeta();
  const exists = [...BUILT_IN_CATEGORIES, ...meta.customCategories].some(
    (c) => c.toLowerCase() === clean.toLowerCase(),
  );
  if (exists) return;
  await setMeta("rules", { ...meta, customCategories: [...meta.customCategories, clean] });
}

export async function removeCustomCategory(name: string): Promise<void> {
  const meta = await getRulesMeta();
  await setMeta("rules", {
    ...meta,
    customCategories: meta.customCategories.filter((c) => c !== name),
  });
}

export async function addRule(
  field: AutoRule["field"],
  contains: string,
  category: string,
  tag = "",
): Promise<void> {
  const clean = contains.trim();
  const cleanTag = tag.trim();
  if (!clean || (!category.trim() && !cleanTag)) return;
  const meta = await getRulesMeta();
  const rule: AutoRule = {
    id: crypto.randomUUID(),
    field,
    contains: clean,
    category: category.trim(),
  };
  if (cleanTag) rule.tag = cleanTag;
  await setMeta("rules", {
    ...meta,
    rules: [...meta.rules, rule],
  });
}

export function ruleMatches(rule: AutoRule, fileName: string, text: string): boolean {
  const needle = rule.contains.toLowerCase();
  if (!needle) return false;
  const name = fileName.toLowerCase();
  const body = text.toLowerCase();
  if (rule.field === "name") return name.includes(needle);
  if (rule.field === "text") return body.includes(needle);
  return name.includes(needle) || body.includes(needle);
}

/** Documents a rule would still change: empty category, or missing its tag. */
export function documentsForRule(rule: AutoRule, docs: DocumentRecord[]): DocumentRecord[] {
  return docs.filter((doc) => {
    if (!ruleMatches(rule, doc.fileName, doc.text)) return false;
    const needsCategory = Boolean(rule.category.trim()) && !doc.category.trim();
    const needsTag = Boolean(rule.tag) && !doc.tags.includes(rule.tag ?? "");
    return needsCategory || needsTag;
  });
}

export async function removeRule(id: string): Promise<void> {
  const meta = await getRulesMeta();
  await setMeta("rules", { ...meta, rules: meta.rules.filter((r) => r.id !== id) });
}

/**
 * Pure matcher used by the ingestion pipeline: the first rule whose phrase
 * occurs in the chosen field wins. Matching is case-insensitive.
 */
export function matchRule(
  rules: AutoRule[],
  fileName: string,
  text: string,
): string | undefined {
  for (const rule of rules) {
    if (!ruleMatches(rule, fileName, text) || !rule.category.trim()) continue;
    return rule.category;
  }
  return undefined;
}

/**
 * Categorise a newly added document with automatic rules. Only used when the
 * user hasn't picked a category themselves — rules never override a choice.
 */
export async function categorizeWithRules(
  fileName: string,
  text: string,
): Promise<string> {
  const rules = await getRules();
  return matchRule(rules, fileName, text) ?? "";
}

export async function tagsFromRules(fileName: string, text: string): Promise<string[]> {
  const rules = await getRules();
  const tags = rules.filter((rule) => rule.tag && ruleMatches(rule, fileName, text)).map((rule) => rule.tag as string);
  return [...new Set(tags)];
}

/** Fill an empty category when a rule matches. A category the user chose stays. */
export async function applyRulesToUncategorized(): Promise<number> {
  const rules = await getRules();
  const docs = await listDocuments();
  let updated = 0;
  for (const doc of docs) {
    if (doc.category.trim()) continue;
    const category = matchRule(rules, doc.fileName, doc.text);
    if (!category) continue;
    await patchDocument(doc.id, { category });
    updated++;
  }
  return updated;
}

const TAGS_KEY = "libraryTags";

export async function getLibraryTags(): Promise<string[]> {
  const value = await getMeta<unknown>(TAGS_KEY, []);
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

export async function addLibraryTag(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const tags = await getLibraryTags();
  if (tags.some((tag) => tag.toLowerCase() === clean.toLowerCase())) return;
  await setMeta(TAGS_KEY, [...tags, clean]);
}

export async function removeLibraryTag(name: string): Promise<void> {
  const tags = await getLibraryTags();
  await setMeta(
    TAGS_KEY,
    tags.filter((tag) => tag !== name),
  );
  const docs = await listDocuments();
  for (const doc of docs) {
    if (!doc.tags.includes(name)) continue;
    await patchDocument(doc.id, { tags: doc.tags.filter((tag) => tag !== name) });
  }
}

/** Rename a tag on every document and in the library tags list. */
export async function renameLibraryTag(from: string, to: string): Promise<void> {
  const next = to.trim();
  if (!from || !next || from === next) return;
  const tags = await getLibraryTags();
  const without = tags.filter((tag) => tag !== from && tag.toLowerCase() !== next.toLowerCase());
  await setMeta(TAGS_KEY, [...without, next]);
  const docs = await listDocuments();
  for (const doc of docs) {
    if (!doc.tags.includes(from)) continue;
    const updated = [...new Set(doc.tags.map((tag) => (tag === from ? next : tag)))];
    await patchDocument(doc.id, { tags: updated });
  }
}

/** Category → document count, built-ins first in their fixed order. */
export function countByCategory(docs: DocumentRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of BUILT_IN_CATEGORIES) counts.set(c, 0);
  for (const doc of docs) {
    const c = doc.category.trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}
