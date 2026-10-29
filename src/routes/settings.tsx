import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  HardDriveDownload,
  FolderUp,
  DatabaseBackup,
  Trash2,
  FlaskConical,
  ScanText,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentRecord } from "@/lib/types";

import { SiteHeader, appFrameClass, MAIN_CONTENT_ID } from "@/components/site-header";
import { InstallAppCard } from "@/components/install-app";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { exportBackup, inspectBackup, commitRestore, type RestoreMode, type RestorePlan } from "@/lib/backup";
import { decryptBlob, looksEncrypted } from "@/lib/crypto-backup";
import { findDuplicateGroups } from "@/lib/duplicates";
import { useLibrary, addSampleDocuments } from "@/lib/use-library";
import { clearWorkspace, deleteWorkspaceData, setWorkspace, getMeta, setMeta, listDocuments, patchDocument } from "@/lib/db";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BUILT_IN_CATEGORIES,
  addCustomCategory,
  addLibraryTag,
  addRule,
  applyRulesToUncategorized,
  countByCategory,
  documentsForRule,
  getCustomCategories,
  getLibraryTags,
  renameLibraryTag,
  getRules,
  removeCustomCategory,
  removeLibraryTag,
  removeRule,
  type AutoRule,
} from "@/lib/categories";
import { formatSize } from "@/lib/extract";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Privytrail" },
      {
        name: "description",
        content: "Backup and restore your library, manage preferences, or delete everything.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { workspace, docs } = useLibrary();
  const [autoOcr, setAutoOcr] = useState(true);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [restoring, setRestoring] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupEncrypt, setBackupEncrypt] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupRemindDays, setBackupRemindDays] = useState(30);
  const [health, setHealth] = useState<{
    duplicateGroups: number;
    uncategorized: number;
    autoOcr: boolean;
    persisted: boolean | null;
  } | null>(null);

  const refreshStorage = () => {
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    }
    if (navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setPersisted);
    }
  };

  useEffect(() => {
    void getMeta<boolean>("autoOcr", true).then(setAutoOcr);
    void getMeta<string | null>("lastBackup", null).then(setLastBackup);
    void getMeta<number>("backupRemindDays", 30).then((n) => setBackupRemindDays(typeof n === "number" && n > 0 ? n : 30));
    refreshStorage();
  }, [workspace]);

  useEffect(() => {
    const uncategorized = (docs ?? []).filter((d) => !d.category.trim()).length;
    const duplicateGroups = findDuplicateGroups(docs ?? []).length;
    void (async () => {
      const auto = await getMeta<boolean>("autoOcr", true);
      const persistedVal = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      setHealth({ duplicateGroups, uncategorized, autoOcr: auto, persisted: persistedVal });
    })();
  }, [docs]);

  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} className="mx-auto w-full max-w-2xl px-6 pb-24">
        <h1 className="text-ink-serif mt-4 text-3xl font-semibold">Settings</h1>

        <div className="mt-8">
          <InstallAppCard />
        </div>

        <section id="backup" className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <DatabaseBackup className="h-4.5 w-4.5 text-primary" /> Backup &amp; restore
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your library lives only in this browser. A backup is a ZIP of every original plus
            titles, tags, notes and dates. Every file is checked before a restore changes this
            library. You can optionally password-encrypt the export on this device.
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={backupEncrypt} onCheckedChange={(v) => setBackupEncrypt(v === true)} />
              Encrypt backup with a password
            </label>
            {backupEncrypt && (
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Backup password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                className="max-w-xs"
              />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={async () => {
                if (backupEncrypt && !backupPassword.trim()) {
                  toast.error("Enter a password for encrypted export");
                  return;
                }
                const toastId = toast.loading("Exporting backup…");
                try {
                  const n = await exportBackup({
                    onProgress: (done, total) => toast.loading(`Exporting ${done} of ${total}…`, { id: toastId }),
                    password: backupEncrypt ? backupPassword : undefined,
                  });
                  const stamp = new Date().toISOString();
                  setLastBackup(stamp);
                  void setMeta("lastBackup", stamp);
                  toast.success(`Backup downloaded (${n} ${n === 1 ? "document" : "documents"})`, { id: toastId });
                } catch (err) {
                  console.error(err);
                  toast.error("Export failed", { id: toastId });
                }
              }}
            >
              <HardDriveDownload className="h-4 w-4" /> Export backup (ZIP)
            </Button>
            <p className="text-sm text-muted-foreground">
              {(docs?.length ?? 0)} {(docs?.length ?? 0) === 1 ? "document" : "documents"}
              {" · about "}
              {formatSize((docs ?? []).reduce((sum, doc) => sum + doc.size, 0))}
              {lastBackup ? ` · last backup ${new Date(lastBackup).toLocaleString()}` : " · never backed up"}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="backup-remind" className="text-sm font-medium">
                Remind me to back up every (days)
              </Label>
              <Input
                id="backup-remind"
                type="number"
                min={1}
                max={365}
                className="mt-1 w-24"
                value={backupRemindDays}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setBackupRemindDays(n);
                  void setMeta("backupRemindDays", n > 0 ? n : 30);
                }}
              />
            </div>
          </div>

          {health && (
            <ul className="mt-4 space-y-1.5 rounded-lg border border-border p-3 text-sm">
              <li>
                Last backup:{" "}
                {lastBackup
                  ? `${Math.floor((Date.now() - Date.parse(lastBackup)) / 86400000)} days ago`
                  : "never"}
                {lastBackup && Math.floor((Date.now() - Date.parse(lastBackup)) / 86400000) > backupRemindDays
                  ? " · overdue"
                  : ""}
              </li>
              <li>Auto-read text from images: {health.autoOcr ? "on" : "off"}</li>
              <li>
                Persistent storage:{" "}
                {health.persisted === null ? "unknown" : health.persisted ? "granted" : "not granted"}
              </li>
              <li>
                Duplicate groups: {health.duplicateGroups}
                {health.duplicateGroups > 0 ? " · review in Library" : ""}
              </li>
              <li>Uncategorized documents: {health.uncategorized}</li>
            </ul>
          )}

          <RestoreZip
            mode={restoreMode}
            setMode={setRestoreMode}
            busy={restoring}
            setBusy={setRestoring}
            sample={workspace === "sample"}
            onRestored={() => {
              if (workspace === "sample") void navigate({ to: "/library" });
            }}
          />
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <ScanText className="h-4.5 w-4.5 text-primary" /> Preferences
          </h2>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="auto-ocr" className="font-medium">
                Read text from new images automatically
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                The recognition engine and English model (about 10&nbsp;MB) are part of this
                website and download from here on first use. You can always read text later from a
                document's page.
              </p>
            </div>
            <Switch
              id="auto-ocr"
              checked={autoOcr}
              onCheckedChange={(v) => {
                setAutoOcr(v);
                void setMeta("autoOcr", v);
              }}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <FlaskConical className="h-4.5 w-4.5 text-primary" /> Workspace
          </h2>
          {workspace === "sample" ? (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">
                You're currently in the sample workspace.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={async () => {
                  setWorkspace("main");
                  await deleteWorkspaceData("sample");
                  toast.success("Sample workspace discarded");
                  void navigate({ to: "/library" });
                }}
              >
                Discard samples and go back to my library
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">
                Want to look around before adding your own files? A separate sample workspace is
                created in its own storage — discard it any time.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={async () => {
                  setWorkspace("sample");
                  const existing = await listDocuments();
                  if (existing.length === 0) await addSampleDocuments();
                  else toast.success("Sample workspace opened");
                  void navigate({ to: "/library" });
                }}
              >
                Explore with sample documents
              </Button>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Info className="h-4.5 w-4.5 text-primary" /> Storage on this device
          </h2>
          {storage && storage.quota > 0 ? (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Using {formatSize(storage.usage)} of {formatSize(storage.quota)} the browser has set
                aside for this site.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Originals: {formatSize(docs?.reduce((sum, doc) => sum + (doc.size || 0), 0) ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Browser figures are estimates and include extracted text, thumbnails and app files.
              </p>
              {persisted === false && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Browsers can evict site data when disk space runs low. Asking to keep it reduces
                    that risk. A backup removes it.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={async () => {
                      const granted = await navigator.storage?.persist?.();
                      setPersisted(Boolean(granted));
                      toast[granted ? "success" : "error"](
                        granted ? "Browser will try to keep this data" : "The browser declined persistent storage",
                      );
                    }}
                  >
                    Ask browser to keep data
                  </Button>
                </div>
              )}
              {persisted === true && (
                <p className="mt-3 text-sm text-muted-foreground">Persistent storage is on for this site.</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Your library lives in this browser's local storage on this device.
            </p>
          )}
        </section>

        <CategoriesSection docs={docs ?? []} />

        <section className="mt-6 rounded-2xl border border-destructive/30 bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <Trash2 className="h-4.5 w-4.5" /> Danger zone
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Delete every document and preference in this workspace — files, text, thumbnails, notes,
            dates and automatic rules. Backups you downloaded are separate files and aren't affected.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4">
                Delete everything in this workspace
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                <AlertDialogDescription>
                  All documents in this workspace are removed from this browser and cannot be
                  recovered. Consider exporting a backup first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await clearWorkspace();
                    toast.success("Workspace cleared");
                    void navigate({ to: "/library" });
                  }}
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </main>
    </div>
  );
}

function RestoreZip({
  mode,
  setMode,
  busy,
  setBusy,
  sample,
  onRestored,
}: {
  mode: RestoreMode;
  setMode: (m: RestoreMode) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  sample: boolean;
  onRestored: () => void;
}) {
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  return (
    <div className="mt-6 rounded-xl border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FolderUp className="h-4 w-4 text-primary" /> Restore from a backup
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {sample
          ? "Restores into your own library, which opens when the restore finishes. Every file is checked before anything is saved."
          : "Merge skips documents you already have. Replace clears this workspace first. Nothing is saved until you confirm."}
      </p>
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as RestoreMode)} className="mt-3 gap-2">
        <div className="flex items-start gap-2">
          <RadioGroupItem value="merge" id="mode-merge" className="mt-0.5" />
          <Label htmlFor="mode-merge" className="font-normal">
            Merge — add the backup's documents alongside the ones already here
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="replace" id="mode-replace" className="mt-0.5" />
          <Label htmlFor="mode-replace" className="font-normal">
            Replace — clear this workspace first, then restore
          </Label>
        </div>
      </RadioGroup>
      <input
        id="restore-zip"
        type="file"
        accept=".zip"
        className="hidden"
        onChange={async (e) => {
          let file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const toastId = toast.loading("Checking backup…");
          try {
            if (await looksEncrypted(file)) {
              const password = window.prompt("This backup is encrypted. Enter its password:");
              if (!password) {
                toast.dismiss(toastId);
                setBusy(false);
                return;
              }
              const decrypted = await decryptBlob(file, password);
              file = new File([decrypted], "backup.zip", { type: "application/zip" });
            }
            const next = await inspectBackup(file, mode);
            setPlan(next);
            toast.dismiss(toastId);
          } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : "That ZIP could not be read as a backup.", { id: toastId });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="outline"
        className="mt-4"
        disabled={busy}
        onClick={() => (document.getElementById("restore-zip") as HTMLInputElement | null)?.click()}
      >
        {busy ? "Checking…" : "Choose a backup ZIP…"}
      </Button>
      {plan && (
        <div className="mt-4 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">Restore this backup?</p>
          <p className="mt-1 text-muted-foreground">
            {plan.partial ? "Partial export. " : ""}
            {plan.added} {plan.added === 1 ? "document" : "documents"} to add
            {plan.skipped ? `, ${plan.skipped} already here and skipped` : ""}
            {plan.dates ? `, ${plan.dates} ${plan.dates === 1 ? "date" : "dates"}` : ""}
            {" · "}
            {formatSize(plan.bytes)}
            {plan.intoMain ? ". This writes into your own library." : plan.mode === "replace" ? ". This replaces the documents in this workspace." : "."}
          </p>
          {plan.damaged.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {plan.damaged.map((issue, index) => (
                <li key={`${issue.title}-${index}`}>
                  {issue.title}: {issue.reason}
                </li>
              ))}
            </ul>
          )}
          {progress != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-label="Restore progress">
              <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={busy || plan.added === 0}
              onClick={async () => {
                setBusy(true);
                setProgress(0);
                const toastId = toast.loading("Restoring…");
                try {
                  const n = await commitRestore(plan, (done, total) => setProgress(total ? done / total : 1));
                  setPlan(null);
                  toast.success(`Restored ${n} ${n === 1 ? "document" : "documents"}`, { id: toastId });
                  onRestored();
                } catch (err) {
                  console.error(err);
                  toast.error(err instanceof Error ? err.message : "Restore failed.", { id: toastId });
                } finally {
                  setBusy(false);
                  setProgress(null);
                }
              }}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesSection({ docs }: { docs: DocumentRecord[] }) {
  const counts = countByCategory(docs);
  const [custom, setCustom] = useState<string[]>([]);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [field, setField] = useState<"name" | "text" | "either">("name");
  const [contains, setContains] = useState("");
  const [ruleCategory, setRuleCategory] = useState<string>(BUILT_IN_CATEGORIES[0]);
  const [ruleTag, setRuleTag] = useState("");
  const [pendingRule, setPendingRule] = useState<AutoRule | null>(null);
  const [libraryTags, setLibraryTags] = useState<string[]>([]);
  const [tagName, setTagName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);

  const reload = async () => {
    setCustom(await getCustomCategories());
    setRules(await getRules());
    setLibraryTags(await getLibraryTags());
    const pinned = await getMeta<string[]>("pinnedTags", []);
    setPinnedTags(Array.isArray(pinned) ? pinned : []);
  };

  useEffect(() => {
    void reload();
  }, [docs]);

  const tags = Array.from(new Set(docs.flatMap((d) => d.tags))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = [...BUILT_IN_CATEGORIES, ...custom];

  const orderedTagList = useMemo(() => {
    const all = [...new Set([...libraryTags, ...tags])];
    const pinSet = new Set(pinnedTags);
    const pinned = pinnedTags.filter((t) => all.includes(t));
    const rest = all.filter((t) => !pinSet.has(t)).sort((a, b) => a.localeCompare(b));
    return [...pinned, ...rest];
  }, [libraryTags, tags, pinnedTags]);

  const togglePin = (tag: string) => {
    const next = pinnedTags.includes(tag) ? pinnedTags.filter((t) => t !== tag) : [...pinnedTags, tag];
    setPinnedTags(next);
    void setMeta("pinnedTags", next);
  };

  const moveLibraryTag = (tag: string, dir: -1 | 1) => {
    const list = [...libraryTags];
    const i = list.indexOf(tag);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    void setMeta("libraryTags", list).then(reload);
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">Categories, tags &amp; rules</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Categories group documents. Tags are free-form labels you add on a document. Rules sort new
        documents when a phrase appears in the file name or the text. A rule never replaces a
        category you already chose.
      </p>

      <h3 className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Categories</h3>
      <ul className="mt-2 divide-y divide-border">
        {[...BUILT_IN_CATEGORIES, ...custom].map((name) => (
          <li key={name} className="flex items-center justify-between py-2 text-sm">
            <span>{name}</span>
            <span className="flex items-center gap-3 text-muted-foreground">
              {counts.get(name) ?? 0}
              {custom.includes(name) && (
                <button
                  className="text-xs underline underline-offset-2 hover:text-foreground"
                  onClick={() => void removeCustomCategory(name).then(reload)}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">The 8 built-in categories can't be renamed.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addCustomCategory(categoryName).then(() => {
            setCategoryName("");
            return reload();
          });
        }}
      >
        <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Custom category" />
        <Button type="submit" variant="outline" disabled={!categoryName.trim()}>
          Add
        </Button>
      </form>

      <h3 className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        Removing a tag takes it off every document. The documents stay.
      </p>
      {orderedTagList.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {orderedTagList.map((tag) => (
            <li key={tag} className="flex items-center justify-between gap-3 py-2 text-sm">
              {renaming === tag ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void renameLibraryTag(tag, renameValue).then(() => {
                      setRenaming(null);
                      setRenameValue("");
                      return reload();
                    });
                  }}
                >
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="h-8"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={!renameValue.trim()}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 truncate">
                    {pinnedTags.includes(tag) ? "★ " : ""}
                    {tag}
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => togglePin(tag)}
                    >
                      {pinnedTags.includes(tag) ? "Unpin" : "Pin"}
                    </button>
                    {libraryTags.includes(tag) && (
                      <>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => moveLibraryTag(tag, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => moveLibraryTag(tag, 1)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => {
                        setRenaming(tag);
                        setRenameValue(tag);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => void removeLibraryTag(tag).then(reload)}
                    >
                      Remove
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addLibraryTag(tagName).then(() => {
            setTagName("");
            return reload();
          });
        }}
      >
        <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Tag name" />
        <Button type="submit" variant="outline" disabled={!tagName.trim()}>
          Add
        </Button>
      </form>

      <h3 className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Automatic rules</h3>
      <ul className="mt-2 space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {rule.field === "name" ? "File name" : rule.field === "text" ? "Text" : "File name or text"} contains “{rule.contains}” →{" "}
              {[rule.category, rule.tag ? `tag “${rule.tag}”` : ""].filter(Boolean).join(", ")}
            </span>
            <span className="flex shrink-0 gap-3">
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setPendingRule(rule)}
              >
                Apply
              </button>
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => void removeRule(rule.id).then(reload)}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addRule(field, contains, ruleCategory, ruleTag).then(() => {
            setContains("");
            setRuleTag("");
            return reload();
          });
        }}
      >
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={field}
          onChange={(e) => setField(e.target.value as "name" | "text" | "either")}
        >
          <option value="name">File name contains</option>
          <option value="text">Text contains</option>
          <option value="either">File name or text contains</option>
        </select>
        <Input value={contains} onChange={(e) => setContains(e.target.value)} placeholder="e.g. warranty" />
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={ruleCategory}
          onChange={(e) => setRuleCategory(e.target.value)}
        >
          <option value="">No category</option>
          {categoryOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Input value={ruleTag} onChange={(e) => setRuleTag(e.target.value)} placeholder="Tag (optional)" />
        <Button type="submit" variant="outline" disabled={!contains.trim() || (!ruleCategory.trim() && !ruleTag.trim())}>
          Add rule
        </Button>
      </form>
      {pendingRule && (
        <div className="mt-3 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">
            Apply this rule to {documentsForRule(pendingRule, docs).length}{" "}
            {documentsForRule(pendingRule, docs).length === 1 ? "document" : "documents"}?
          </p>
          <p className="mt-1 text-muted-foreground">
            {documentsForRule(pendingRule, docs).length} in your library match. Documents whose category you chose yourself keep it.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={documentsForRule(pendingRule, docs).length === 0}
              onClick={() => {
                const matches = documentsForRule(pendingRule, docs);
                void (async () => {
                  for (const doc of matches) {
                    const patch: Partial<DocumentRecord> = {};
                    if (pendingRule.category.trim() && !doc.category.trim()) patch.category = pendingRule.category;
                    if (pendingRule.tag && !doc.tags.includes(pendingRule.tag)) patch.tags = [...doc.tags, pendingRule.tag];
                    if (patch.category || patch.tags) await patchDocument(doc.id, patch);
                  }
                  toast.success(
                    matches.length
                      ? `Rule applied to ${matches.length} ${matches.length === 1 ? "document" : "documents"}`
                      : "No documents needed this rule",
                  );
                  setPendingRule(null);
                })();
              }}
            >
              Apply to {documentsForRule(pendingRule, docs).length}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingRule(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <Button
        variant="outline"
        className="mt-3"
        onClick={() =>
          void applyRulesToUncategorized().then((n) => {
            toast.success(
              n
                ? `Categorized ${n} ${n === 1 ? "document" : "documents"}`
                : "No uncategorized documents matched a rule",
            );
          })
        }
      >
        Apply rules to uncategorized documents
      </Button>
    </section>
  );
}
