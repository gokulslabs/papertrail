import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DocumentRecord, Workspace } from "./types";

const DB_PREFIX = "privytrail";
const DB_VERSION = 2;
const WORKSPACE_KEY = "privytrail.workspace";

interface PTDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { "by-added": number };
  };
  /** Originals live here so library listings don't pull every file into memory. */
  files: { key: string; value: Blob };
  meta: { key: string; value: unknown };
}

export function dbNameFor(ws: Workspace): string {
  return ws === "sample" ? `${DB_PREFIX}-sample` : DB_PREFIX;
}

let dbPromise: Promise<IDBPDatabase<PTDB>> | null = null;
let dbFor: Workspace | null = null;
let closing: Promise<void> = Promise.resolve();

export function getWorkspace(): Workspace {
  if (typeof window === "undefined") return "main";
  return localStorage.getItem(WORKSPACE_KEY) === "sample" ? "sample" : "main";
}

function dropConnection(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  dbFor = null;
  if (!pending) return Promise.resolve();
  return pending.then((db) => db.close()).catch(() => undefined);
}

export function setWorkspace(ws: Workspace): void {
  if (typeof window === "undefined") return;
  const previous = getWorkspace();
  localStorage.setItem(WORKSPACE_KEY, ws);
  if (previous === ws) return;
  if (dbPromise) closing = dropConnection();
  emitChanged();
}

export async function getDb(): Promise<IDBPDatabase<PTDB>> {
  await closing;
  const ws = getWorkspace();
  if (!dbPromise || dbFor !== ws) {
    dbFor = ws;
    const promise = openDB<PTDB>(dbNameFor(ws), DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, _tx, event) {
        if (!db.objectStoreNames.contains("documents")) {
          const store = db.createObjectStore("documents", { keyPath: "id" });
          store.createIndex("by-added", "addedAt");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files");
        }
        if (oldVersion >= 1 && oldVersion < 2) {
          const raw = (event.target as IDBOpenDBRequest).transaction;
          if (raw) moveBlobsToFileStore(raw);
        }
      },
      blocking() {
        void promise.then((db) => {
          db.close();
          if (dbPromise === promise) {
            dbPromise = null;
            dbFor = null;
          }
        });
      },
    });
    dbPromise = promise;
  }
  return dbPromise;
}

/** Keep the version-change transaction alive by chaining native requests. */
function moveBlobsToFileStore(raw: IDBTransaction): void {
  const docs = raw.objectStore("documents");
  const files = raw.objectStore("files");
  const request = docs.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const value = cursor.value as DocumentRecord;
    if (value?.blob instanceof Blob) {
      files.put(value.blob, cursor.primaryKey);
      cursor.update({ ...value, blob: null });
    }
    cursor.continue();
  };
}

export async function documentIdsFor(ws: Workspace): Promise<Set<string>> {
  if (ws === getWorkspace()) return new Set((await listDocuments()).map((doc) => doc.id));
  const db = await openDB<PTDB>(dbNameFor(ws), DB_VERSION);
  try {
    const docs = await db.getAll("documents");
    return new Set(docs.map((doc) => doc.id));
  } finally {
    db.close();
  }
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("documents", "by-added");
  return all.reverse().map((doc) => ({ ...doc, blob: null }));
}

export async function listDocumentsWithBlobs(): Promise<DocumentRecord[]> {
  const db = await getDb();
  const docs = await listDocuments();
  const tx = db.transaction("files");
  const blobs = new Map<string, Blob>();
  let cursor = await tx.store.openCursor();
  while (cursor) {
    blobs.set(String(cursor.primaryKey), cursor.value);
    cursor = await cursor.continue();
  }
  return docs.map((doc) => ({ ...doc, blob: blobs.get(doc.id) ?? null }));
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  const doc = await db.get("documents", id);
  if (!doc) return undefined;
  const blob = (await db.get("files", id)) ?? null;
  return { ...doc, blob };
}

export async function putDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDb();
  const { blob, ...rest } = doc;
  const tx = db.transaction(["documents", "files"], "readwrite");
  const record: DocumentRecord = { ...rest, blob: null, updatedAt: doc.updatedAt ?? Date.now() };
  const jobs: Promise<unknown>[] = [tx.objectStore("documents").put(record)];
  if (blob) jobs.push(tx.objectStore("files").put(blob, doc.id));
  jobs.push(tx.done);
  await Promise.all(jobs);
  emitChanged();
}

export async function patchDocument(
  id: string,
  patch: Partial<DocumentRecord>,
): Promise<DocumentRecord | undefined> {
  const existing = await getDocument(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch, updatedAt: patch.updatedAt ?? Date.now() };
  await putDocument(next);
  return next;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["documents", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("documents").delete(id),
    tx.objectStore("files").delete(id),
    tx.done,
  ]);
  emitChanged();
}

export async function clearDocuments(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["documents", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("documents").clear(),
    tx.objectStore("files").clear(),
    tx.done,
  ]);
  emitChanged();
}

/** Documents, originals, and workspace preferences. */
export async function clearWorkspace(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["documents", "files", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("documents").clear(),
    tx.objectStore("files").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
  emitChanged();
}

export async function deleteWorkspaceData(ws: Workspace): Promise<void> {
  await closing;
  if (dbFor === ws) {
    closing = dropConnection();
    await closing;
  }
  await deleteDB(dbNameFor(ws));
  emitChanged();
}

/** Settings stored in the meta store. */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const value = await db.get("meta", key);
  return (value as T | undefined) ?? fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("meta", value, key);
}

/* --- Tiny change pub/sub so pages stay in sync while files process. --- */

const listeners = new Set<() => void>();

export function emitChanged(): void {
  for (const fn of listeners) fn();
}

export function onChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
