import type { DocDate } from "./types";
import { DATE_KINDS } from "./date-kinds";
import { processFile } from "./process";

interface SampleDef {
  file: string;
  title: string;
  tags: string[];
  /** Dates printed inside the sample files, so everything stays consistent. */
  dates: Array<{ label: string; date: string }>;
  notes?: string;
}

const SAMPLES: SampleDef[] = [
  {
    file: "receipt-nordvik-audio.pdf",
    title: "Receipt #A-10294 — Nordvik Audio",
    tags: ["receipt", "electronics"],
    dates: [
      { label: "Purchase date", date: "2026-09-14" },
      { label: "Warranty expiry", date: "2028-09-14" },
    ],
  },
  {
    file: "bill-nordskel-october.pdf",
    title: "Electricity bill — October 2026",
    tags: ["bill", "electricity"],
    dates: [{ label: "Due date", date: "2026-11-02" }],
  },
  {
    file: "warranty-kettler-bike.pdf",
    title: "Warranty certificate — Kettler Velo C6",
    tags: ["warranty", "bike"],
    dates: [
      { label: "Purchase date", date: "2026-08-21" },
      { label: "Wear-parts warranty expires", date: "2027-08-21" },
      { label: "Electrical warranty expires", date: "2028-08-21" },
    ],
  },
  {
    file: "policy-trygg-home.pdf",
    title: "Home insurance policy HF-2026-110-882",
    tags: ["insurance", "home"],
    dates: [{ label: "Renewal date", date: "2027-09-01" }],
  },
  {
    file: "scan-clinic-note.png",
    title: "Clinic progress note — September 2026",
    tags: ["medical", "scan"],
    notes: "A photo of a paper clinic note. Try “Read text with OCR” on it.",
    dates: [{ label: "Follow-up appointment", date: "2026-11-19" }],
  },
  {
    file: "notes-appliance-manual.md",
    title: "Dishwasher manual & notes",
    tags: ["manual", "appliance"],
    dates: [{ label: "Warranty expiry", date: "2027-11-08" }],
  },
  {
    file: "statement-january.csv",
    title: "Bank statement — January 2026",
    tags: ["bank", "statement"],
    dates: [],
  },
];

/** Load the built-in sample workspace documents, one by one. */
export async function loadSampleDocuments(
  onEach?: (title: string, index: number, total: number) => void,
): Promise<number> {
  let loaded = 0;
  let i = 0;
  for (const def of SAMPLES) {
    i++;
    onEach?.(def.title, i, SAMPLES.length);
    const res = await fetch(`/samples/${def.file}`);
    if (!res.ok) continue;
    loaded++;
    const blob = await res.blob();
    const file = new File([blob], def.file, { type: blob.type || guessType(def.file) });
    await processFile(file, {
      title: def.title,
      tags: def.tags,
      dates: def.dates.map(sampleDate),
      notes: def.notes ?? "",
      origin: "sample",
    });
  }
  return loaded;
}

export function sampleCount(): number {
  return SAMPLES.length;
}

function sampleDate(input: { label: string; date: string }): DocDate {
  const label = input.label.toLowerCase();
  if (label.includes("wear")) return { ...input, kind: "warranty", note: "Wear parts", remindDays: DATE_KINDS.warranty.remindDays };
  if (label.includes("electrical")) return { ...input, kind: "warranty", note: "Electrical", remindDays: DATE_KINDS.warranty.remindDays };
  if (label.includes("warrant")) return { ...input, kind: "warranty", remindDays: DATE_KINDS.warranty.remindDays };
  if (label.includes("renew")) return { ...input, kind: "insurance-renewal", remindDays: DATE_KINDS["insurance-renewal"].remindDays };
  if (label.includes("due")) return { ...input, kind: "bill-due", remindDays: DATE_KINDS["bill-due"].remindDays };
  if (label.includes("follow")) return { ...input, kind: "other", note: input.label, remindDays: DATE_KINDS.other.remindDays };
  if (label.includes("purchase")) return { ...input, kind: "other", note: input.label, remindDays: null };
  return { ...input, kind: "other" };
}

function guessType(name: string): string {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".md")) return "text/markdown";
  if (name.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}
