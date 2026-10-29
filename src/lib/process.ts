import type { DocumentRecord, TextExtraction } from "./types";
import { putDocument } from "./db";
import {
  classifyFile,
  extractPdf,
  imageThumbnail,
  ocrImage,
  readTextFile,
  titleFromFileName,
} from "./extract";
import { buildExtraction } from "./extraction";
import { suggestFor } from "./suggest";
import { categorizeWithRules, tagsFromRules } from "./categories";
import { getMeta } from "./db";
import { sha256Hex } from "./hash";
import { MAX_DOCUMENT_BYTES } from "./limits";

export type ProcessStage =
  | "queued"
  | "opening"
  | "reading"
  | "ocr"
  | "hashing"
  | "saving"
  | "done"
  | "failed"
  | "skipped";

export interface ProcessProgress {
  stage: ProcessStage;
  detail?: string;
}

/**
 * Turn one File into a stored document record.
 * PDFs get their text layer read automatically; images are only OCR'd when
 * the "auto OCR" preference is on (or later, on demand).
 */
export async function processFile(
  file: File,
  overrides?: Partial<DocumentRecord>,
  onProgress?: (progress: ProcessProgress) => void,
): Promise<DocumentRecord> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${file.name} is larger than 32 MB`);
  }
  const kind = classifyFile(file);
  let text = "";
  let thumbnail: Blob | null = null;
  let pageCount: number | undefined;
  let ocrStatus: DocumentRecord["ocrStatus"] = "none";
  let extraction: TextExtraction | undefined;
  const report = (stage: ProcessStage, detail?: string) => onProgress?.({ stage, detail });

  report("opening");
  if (kind === "pdf") {
    try {
      report("reading", "Opening PDF…");
      const extracted = await extractPdf(file);
      text = extracted.text;
      thumbnail = extracted.thumbnail;
      pageCount = extracted.pageCount;
      extraction = buildExtraction({
        kind,
        text,
        source: "pdf-text",
        pagesWithText: extracted.pagesWithText,
      });
      report("reading", "Reading text…");
    } catch (err) {
      if ((err as { name?: string })?.name === "PasswordException") {
        text = "";
        ocrStatus = "none";
        extraction = buildExtraction({ kind, text: "", source: "none" });
      } else {
        throw err;
      }
    }
  } else if (kind === "image") {
    report("reading", "Preparing image…");
    thumbnail = await imageThumbnail(file);
    const autoOcr = await getMeta<boolean>("autoOcr", true);
    if (autoOcr) {
      try {
        report("ocr", "Reading text…");
        const result = await ocrImage(file);
        text = result.text;
        ocrStatus = text ? "done" : "failed";
        extraction = buildExtraction({
          kind,
          text,
          source: "ocr",
          confidence: result.confidence,
        });
      } catch {
        ocrStatus = "failed";
        extraction = buildExtraction({ kind, text: "", source: "none" });
      }
    } else {
      extraction = buildExtraction({ kind, text: "", source: "none" });
    }
  } else if (kind === "text" || kind === "markdown" || kind === "csv") {
    report("reading", "Reading text…");
    text = await readTextFile(file);
    extraction = buildExtraction({ kind, text, source: "plain" });
  } else {
    ocrStatus = "unsupported";
    extraction = buildExtraction({ kind, text: "", source: "none" });
  }

  report("hashing");
  const sha256 = await sha256Hex(file);

  const metaTitle = overrides?.title;
  const suggested = text ? suggestFor(text, file.name) : null;
  const ruledCategory = overrides?.category ?? (await categorizeWithRules(file.name, text));
  const ruledTags = await tagsFromRules(file.name, text);
  const tags = [...new Set([...(overrides?.tags ?? []), ...ruledTags])];

  report("saving");
  const doc: DocumentRecord = {
    title: metaTitle ?? titleFromFileName(file.name),
    fileName: file.name,
    kind,
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileModifiedAt: typeof file.lastModified === "number" ? file.lastModified : undefined,
    text,
    ocrStatus,
    extraction,
    pageCount,
    thumbnail,
    notes: "",
    dates: [],
    category: ruledCategory ?? "",
    amount: "",
    suggested,
    sha256,
    origin: "user",
    ...overrides,
    tags,
    id: crypto.randomUUID(),
    addedAt: Date.now(),
    blob: file,
  };

  // Keep extraction from this run unless overrides explicitly set one.
  if (!overrides?.extraction) doc.extraction = extraction;
  if (!overrides?.sha256) doc.sha256 = sha256;

  await putDocument(doc);
  report("done", text ? "Text ready" : "Added");
  return doc;
}

/** Re-run text extraction for an existing document (PDF text layer or OCR). */
export async function reextractDocument(
  doc: DocumentRecord,
  onProgress?: (status: string, progress: number) => void,
): Promise<Partial<DocumentRecord>> {
  if (!doc.blob) throw new Error("Original file is missing");
  if (doc.kind === "pdf") {
    const extracted = await extractPdf(doc.blob);
    const text = extracted.text;
    const suggested = text ? suggestFor(text, doc.fileName) : null;
    return {
      text,
      pageCount: extracted.pageCount,
      thumbnail: doc.thumbnail ?? extracted.thumbnail,
      ocrStatus: "none",
      extraction: buildExtraction({
        kind: "pdf",
        text,
        source: "pdf-text",
        pagesWithText: extracted.pagesWithText,
      }),
      suggested: mergeSuggestions(doc, suggested),
    };
  }
  if (doc.kind === "image") {
    const result = await ocrImage(doc.blob, onProgress);
    const text = result.text;
    const suggested = text ? suggestFor(text, doc.fileName) : null;
    return {
      text,
      ocrStatus: text ? "done" : "failed",
      extraction: buildExtraction({
        kind: "image",
        text,
        source: "ocr",
        confidence: result.confidence,
      }),
      suggested: mergeSuggestions(doc, suggested),
    };
  }
  if (doc.kind === "text" || doc.kind === "markdown" || doc.kind === "csv") {
    const text = await doc.blob.text();
    const suggested = text ? suggestFor(text, doc.fileName) : null;
    return {
      text,
      extraction: buildExtraction({ kind: doc.kind, text, source: "plain" }),
      suggested: mergeSuggestions(doc, suggested),
    };
  }
  throw new Error("This file type cannot be re-read");
}

function mergeSuggestions(
  doc: DocumentRecord,
  next: DocumentRecord["suggested"],
): DocumentRecord["suggested"] {
  if (!next) return doc.suggested;
  // Preserve a manually cleared suggestion state only when there was none and still empty category.
  return next;
}

export { titleFromFileName };
