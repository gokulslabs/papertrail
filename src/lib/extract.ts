import type { DocKind } from "./types";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Browser-only file processing. Every heavy library (pdf.js, tesseract.js)
 * is imported dynamically inside a function body, so this module never runs
 * them during SSR and they never enter the server bundle graph.
 */

export function classifyFile(file: File): DocKind {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown"))
    return "markdown";
  if (type === "text/csv" || name.endsWith(".csv")) return "csv";
  if (type.startsWith("text/") || name.endsWith(".txt")) return "text";
  return "other";
}

export function titleFromFileName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  return (
    withoutExt
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || name
  );
}

const ACCEPTED_EXT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.csv";

export function acceptAttribute(): string {
  return ACCEPTED_EXT;
}

export interface PdfExtract {
  text: string;
  pageCount: number;
  title: string | null;
  thumbnail: Blob | null;
}

interface PdfjsModule {
  getDocument: (src: { data: ArrayBuffer; password?: string | undefined }) => {
    promise: Promise<PDFDocumentProxy>;
  };
  GlobalWorkerOptions: { workerSrc: string };
}

async function destroyPdfDoc(doc: PDFDocumentProxy): Promise<void> {
  const d = (doc as unknown as { destroy?: () => Promise<void> | void }).destroy;
  if (d) await d.call(doc);
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const [pdfjsMod, workerUrlMod] = await Promise.all([
    // The legacy build avoids brand-new JS APIs some browsers still lack.
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url" as any),
  ]);
  const pdfjs = ((pdfjsMod as { default?: PdfjsModule }).default ??
    (pdfjsMod as unknown as PdfjsModule)) as PdfjsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = (workerUrlMod as { default: string }).default;
  return pdfjs;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.78): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function renderPdfThumbnail(
  pdfjs: PdfjsModule,
  doc: PDFDocumentProxy,
): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const targetWidth = 420;
    const scale = Math.min(targetWidth / base.width, 1.6);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await canvasToJpeg(canvas);
    page.cleanup();
    return blob;
  } catch {
    return null;
  }
}

export async function extractPdf(file: Blob, password?: string): Promise<PdfExtract> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data, password }).promise;

  let thumbnail: Blob | null = null;
  const chunks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    if (i === 1) thumbnail = await renderPdfThumbnail(pdfjs, doc);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if ("str" in item) {
        line += item.str;
        if (item.hasEOL) line += "\n";
        else line += " ";
      }
    }
    chunks.push(line.trim());
    page.cleanup();
  }
  let metaTitle: string | null = null;
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: string } | undefined;
    if (info && typeof info.Title === "string" && info.Title.trim()) {
      metaTitle = info.Title.trim();
    }
  } catch {
    /* metadata is optional */
  }
  await destroyPdfDoc(doc);
  return { text: chunks.join("\n\n"), pageCount: doc.numPages, title: metaTitle, thumbnail };
}

/** Render every PDF page to a canvas, streaming one page at a time. */
export async function renderPdfPages(
  file: Blob,
  maxWidth: number,
  onPage: (canvas: HTMLCanvasElement) => void,
  password?: string,
): Promise<number> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data, password }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, Math.max(0.4, maxWidth / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.className = "mx-auto block h-auto w-full max-w-full rounded-md shadow-sm";
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      onPage(canvas);
    }
    page.cleanup();
  }
  const numPages = doc.numPages;
  await destroyPdfDoc(doc);
  return numPages;
}

export async function imageThumbnail(file: File, maxSide = 520): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await canvasToJpeg(canvas);
  } catch {
    return null;
  }
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}

/** OCR an image in-browser. The engine and English model are served by this site. */
export async function ocrImage(
  file: File | Blob,
  onProgress?: (status: string, progress: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract",
    langPath: "/tesseract",
    logger: (m: { status?: string; progress?: number }) => {
      if (m?.status) onProgress?.(m.status, m.progress ?? 0);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return (data.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

/** Human readable file size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const KIND_LABEL: Record<DocKind, string> = {
  pdf: "PDF",
  image: "Image",
  text: "Text",
  markdown: "Markdown",
  csv: "CSV",
  other: "File",
};

export function extensionFor(kind: DocKind, fileName: string): string {
  const m = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = m?.[1];
  if (ext) return ext.toLowerCase();
  const map: Record<DocKind, string> = {
    pdf: "pdf",
    image: "jpg",
    text: "txt",
    markdown: "md",
    csv: "csv",
    other: "bin",
  };
  return map[kind];
}
