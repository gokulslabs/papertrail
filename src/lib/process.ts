import type { DocumentRecord } from "./types";
import { putDocument } from "./db";
import {
  classifyFile,
  extractPdf,
  imageThumbnail,
  ocrImage,
  readTextFile,
  titleFromFileName,
} from "./extract";
import { suggestFor } from "./suggest";
import { categorizeWithRules, tagsFromRules } from "./categories";
import { getMeta } from "./db";
import { MAX_DOCUMENT_BYTES } from "./limits";

/**
 * Turn one File into a stored document record.
 * PDFs get their text layer read automatically; images are only OCR'd when
 * the "auto OCR" preference is on (or later, on demand).
 */
export async function processFile(
  file: File,
  overrides?: Partial<DocumentRecord>,
): Promise<DocumentRecord> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${file.name} is larger than 32 MB`);
  }
  const kind = classifyFile(file);
  let text = "";
  let thumbnail: Blob | null = null;
  let pageCount: number | undefined;
  let ocrStatus: DocumentRecord["ocrStatus"] = "none";

  if (kind === "pdf") {
    try {
      const extracted = await extractPdf(file);
      text = extracted.text;
      thumbnail = extracted.thumbnail;
      pageCount = extracted.pageCount;
    } catch (err) {
      if ((err as { name?: string })?.name === "PasswordException") {
        // Stored without text; the viewer asks for the password later.
        text = "";
        ocrStatus = "none";
      } else {
        throw err;
      }
    }
  } else if (kind === "image") {
    thumbnail = await imageThumbnail(file);
    const autoOcr = await getMeta<boolean>("autoOcr", false);
    if (autoOcr) {
      try {
        text = await ocrImage(file);
        ocrStatus = text ? "done" : "failed";
      } catch {
        ocrStatus = "failed";
      }
    }
  } else if (kind === "text" || kind === "markdown" || kind === "csv") {
    text = await readTextFile(file);
  } else {
    ocrStatus = "unsupported";
  }

  const metaTitle = overrides?.title; // only set by sample loads
  const suggested = suggestFor(text, file.name);
  // Automatic rules only fill an empty category — a category supplied by the
  // caller (or picked by the user) always wins.
  const ruledCategory = overrides?.category ?? (await categorizeWithRules(file.name, text));
  const ruledTags = await tagsFromRules(file.name, text);
  const tags = [...new Set([...(overrides?.tags ?? []), ...ruledTags])];

  const doc: DocumentRecord = {
    title: metaTitle ?? titleFromFileName(file.name),
    fileName: file.name,
    kind,
    mime: file.type || "application/octet-stream",
    size: file.size,
    text,
    ocrStatus,
    thumbnail,
    pageCount,
    notes: "",
    dates: [],
    category: ruledCategory ?? "",
    amount: "",
    suggested: suggested,
    origin: "user",
    ...overrides,
    tags,
    id: crypto.randomUUID(),
    addedAt: Date.now(),
    blob: file,
  };

  await putDocument(doc);
  return doc;
}

export { titleFromFileName };
