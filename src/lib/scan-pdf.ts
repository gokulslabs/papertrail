import { PDFDocument } from "pdf-lib";

/** Combine image files into a single multi-page PDF Blob. */
export async function imagesToPdf(files: File[], title = "Scan"): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = (file.type || "").toLowerCase();
    let image;
    if (type.includes("png") || file.name.toLowerCase().endsWith(".png")) {
      image = await pdf.embedPng(bytes);
    } else {
      image = await pdf.embedJpg(bytes);
    }
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const out = await pdf.save();
  const name = `${title.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "scan"}.pdf`;
  return new File([out.buffer as ArrayBuffer], name, { type: "application/pdf" });
}

export function isImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return type.startsWith("image/") || /\.(jpe?g|png|webp)$/.test(name);
}
