import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DocumentRecord, Workspace } from "./types";
import { getWorkspace, listDocuments, onChanged, setWorkspace } from "./db";
import { processFile } from "./process";
import { loadSampleDocuments, sampleCount } from "./samples";
import { KIND_LABEL } from "./extract";
import { MAX_DOCUMENT_BYTES } from "./limits";

/** Subscribe to the current workspace's documents. */
export function useLibrary() {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [workspace, setWsState] = useState<Workspace>("main");

  const refresh = useCallback(async () => {
    setDocs(await listDocuments());
  }, []);

  useEffect(() => {
    const sync = () => {
      setWsState(getWorkspace());
      void refresh();
    };
    sync();
    return onChanged(sync);
  }, [refresh]);

  return { docs, workspace, refresh };
}

/** Add user files to the current library, with progress toasts. */
export async function addFiles(
  files: File[],
  opts?: { silent?: boolean },
): Promise<number> {
  const supported = files.filter((f) => {
    const kind = f.name.toLowerCase().match(
      /\.(pdf|jpe?g|png|webp|txt|md|markdown|csv)$/,
    );
    return !!kind || f.type.startsWith("text/") || f.type.startsWith("image/");
  });
  const accepted = supported.filter((f) => f.size <= MAX_DOCUMENT_BYTES);
  const tooBig = supported.length - accepted.length;
  if (!accepted.length) {
    if (!opts?.silent) {
      toast.error(tooBig ? "Files must be 32 MB or smaller" : "No supported files", {
        description: tooBig
          ? undefined
          : "PDF, JPEG, PNG, WebP, TXT, Markdown and CSV are supported.",
      });
    }
    return 0;
  }
  if (tooBig && !opts?.silent) toast.error(`${tooBig} ${tooBig === 1 ? "file was" : "files were"} over 32 MB and skipped`);
  const toastId = opts?.silent ? undefined : toast.loading(`Reading 1 of ${accepted.length}…`);
  let saved = 0;
  let index = 0;
  for (const file of accepted) {
    index++;
    if (toastId) toast.loading(`Reading ${index} of ${accepted.length}… ${file.name}`, { id: toastId });
    try {
      await processFile(file);
      saved++;
    } catch (err) {
      console.error("Failed to read file", file.name, err);
      toast.error(`Could not read ${file.name}`);
    }
  }
  if (toastId) {
    if (saved === 0) toast.error("Nothing was added", { id: toastId });
    else toast.success(`Added ${saved} ${saved === 1 ? "document" : "documents"}`, { id: toastId });
  }
  return saved;
}

/** Load the sample workspace contents. */
export async function addSampleDocuments(): Promise<void> {
  const toastId = toast.loading("Preparing sample workspace…");
  try {
    const loaded = await loadSampleDocuments((title, i, total) => {
      toast.loading(`Preparing sample ${i} of ${total}… ${title}`, { id: toastId });
    });
    const total = sampleCount();
    if (loaded === 0) toast.error("Could not prepare the sample workspace", { id: toastId });
    else if (loaded < total) {
      toast.error(`Loaded ${loaded} of ${total} samples. Some files are missing.`, { id: toastId });
    } else toast.success("Sample workspace ready", { id: toastId });
  } catch (err) {
    console.error(err);
    toast.error("Could not prepare the sample workspace", { id: toastId });
  }
}

export { KIND_LABEL, setWorkspace };
