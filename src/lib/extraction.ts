import type { DocKind, DocumentRecord, TextExtraction, TextSource } from "./types";

export function textSourceLabel(source: TextSource): string {
  switch (source) {
    case "pdf-text":
      return "Text layer of the PDF";
    case "ocr":
      return "On-device text recognition (OCR)";
    case "plain":
      return "Plain text file";
    default:
      return "No text yet";
  }
}

export function extractionStatusLabel(doc: DocumentRecord): string {
  const ex = doc.extraction;
  if (doc.ocrStatus === "failed") return "Text recognition failed";
  if (doc.ocrStatus === "unsupported") return "Text not supported";
  if (!doc.text.trim()) {
    if (doc.kind === "image" && doc.ocrStatus === "none") return "Not read yet";
    if (doc.kind === "pdf") return "No text layer found";
    return "No text";
  }
  if (ex?.source === "ocr" || doc.ocrStatus === "done") return "Text ready";
  return "Text ready";
}

/** Infer extraction metadata for records that predate the field. */
export function deriveExtraction(doc: Pick<DocumentRecord, "kind" | "text" | "ocrStatus" | "pageCount" | "extraction">): TextExtraction {
  if (doc.extraction) return doc.extraction;
  const characters = doc.text.length;
  let source: TextSource = "none";
  if (characters > 0) {
    if (doc.ocrStatus === "done") source = "ocr";
    else if (doc.kind === "pdf") source = "pdf-text";
    else if (doc.kind === "text" || doc.kind === "markdown" || doc.kind === "csv") source = "plain";
    else if (doc.kind === "image") source = "ocr";
    else source = "plain";
  }
  return { source, characters };
}

export function buildExtraction(opts: {
  kind: DocKind;
  text: string;
  source: TextSource;
  pagesWithText?: number;
  confidence?: number;
}): TextExtraction {
  const extraction: TextExtraction = {
    source: opts.source,
    characters: opts.text.length,
  };
  if (typeof opts.pagesWithText === "number") extraction.pagesWithText = opts.pagesWithText;
  if (typeof opts.confidence === "number") extraction.confidence = Math.round(opts.confidence);
  return extraction;
}
