import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DocumentRecord, Workspace } from "./types";
import { getWorkspace, listDocuments, onChanged, setWorkspace } from "./db";
import { processFile } from "./process";
import { sampleCount, startSampleImport } from "./samples";
import { KIND_LABEL } from "./extract";
import { MAX_DOCUMENT_BYTES } from "./limits";
import { runImport } from "./import-queue";

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

/** Add user files to the current library via the import progress panel. */
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
  if (tooBig && !opts?.silent) {
    toast.error(`${tooBig} ${tooBig === 1 ? "file was" : "files were"} over 32 MB and skipped`);
  }

  if (opts?.silent) {
    let saved = 0;
    for (const file of accepted) {
      try {
        await processFile(file);
        saved++;
      } catch (err) {
        console.error("Failed to read file", file.name, err);
      }
    }
    return saved;
  }

  return runImport(accepted);
}

/** Load the sample workspace contents through the import progress panel. */
export async function addSampleDocuments(): Promise<void> {
  try {
    const loaded = await startSampleImport();
    if (loaded === 0) toast.error("Could not prepare the sample workspace");
    else if (loaded < sampleCount()) {
      toast.error(`Loaded ${loaded} of ${sampleCount()} samples. Some files are missing.`);
    }
  } catch (err) {
    console.error(err);
    toast.error("Could not prepare the sample workspace");
  }
}

export { KIND_LABEL, setWorkspace };
