import { describe, expect, it } from "vitest";
import { buildIcs, icsUid, isSafeBackupPath, type IcsEvent } from "@/lib/backup";
import { isComingUp, isOpenReminder } from "@/lib/reminders";
import { matchRule } from "@/lib/categories";
import { needsAttention } from "@/lib/library-view";
import { suggestFor } from "@/lib/suggest";
import type { DocumentRecord } from "@/lib/types";

describe("backup paths", () => {
  it("accepts a file stored under files/ and rejects traversal", () => {
    expect(isSafeBackupPath("files/abc.pdf", "files")).toBe(true);
    expect(isSafeBackupPath("files/../manifest.json", "files")).toBe(false);
    expect(isSafeBackupPath("/etc/passwd", "files")).toBe(false);
    expect(isSafeBackupPath("thumbnails/abc.jpg", "files")).toBe(false);
    expect(isSafeBackupPath("thumbnails/abc.jpg", "thumbnails")).toBe(true);
  });
});

describe("calendar export", () => {
  const event: IcsEvent = { title: "Receipt", label: "Due date", date: "2026-11-02" };

  it("keeps the same uid for the same reminder", () => {
    expect(icsUid(event)).toBe(icsUid({ ...event }));
    expect(icsUid(event)).not.toBe(icsUid({ ...event, date: "2026-11-03" }));
    const ics = buildIcs([event]);
    expect(ics).toContain(`UID:${icsUid(event)}`);
    expect(ics.match(/UID:/g)).toHaveLength(1);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:PT0S");
  });

  it("sets the alarm lead and omits it when the date is not a reminder", () => {
    const early = buildIcs([{ ...event, remindDays: 7 }]);
    expect(early).toContain("TRIGGER:-P7D");
    const quiet = buildIcs([{ ...event, remindDays: null }]);
    expect(quiet).not.toContain("BEGIN:VALARM");
  });
});

describe("coming up window", () => {
  it("keeps a week of overdue dates and the next 45 days", () => {
    expect(isComingUp(-7)).toBe(true);
    expect(isComingUp(-8)).toBe(false);
    expect(isComingUp(0)).toBe(true);
    expect(isComingUp(45)).toBe(true);
    expect(isComingUp(46)).toBe(false);
  });

  it("hides found, dismissed, and not-a-reminder dates", () => {
    const today = new Date("2026-10-26T12:00:00");
    expect(isOpenReminder({ label: "Due", date: "2026-11-02" }, today)).toBe(true);
    expect(isOpenReminder({ label: "Due", date: "2026-11-02", source: "found" }, today)).toBe(false);
    expect(isOpenReminder({ label: "Due", date: "2026-11-02", status: "dismissed" }, today)).toBe(false);
    expect(isOpenReminder({ label: "Due", date: "2026-11-02", remindDays: null }, today)).toBe(false);
    expect(isOpenReminder({ label: "Due", date: "2027-01-20", remindDays: 90 }, today)).toBe(true);
  });
});

describe("automatic categories", () => {
  it("uses the first matching rule and ignores a blank phrase", () => {
    const rules = [
      { id: "1", field: "name" as const, contains: "invoice", category: "Bills & utilities" },
      { id: "2", field: "text" as const, contains: "", category: "Other" },
    ];
    expect(matchRule(rules, "October-invoice.pdf", "hello")).toBe("Bills & utilities");
    expect(matchRule(rules, "notes.txt", "nothing here")).toBeUndefined();
    expect(
      matchRule(
        [{ id: "3", field: "either", contains: "warranty", category: "Warranties & manuals" }],
        "scan.pdf",
        "This warranty covers the frame",
      ),
    ).toBe("Warranties & manuals");
  });
});

describe("needs attention", () => {
  const doc = {
    category: "Bills & utilities",
    kind: "pdf",
    text: "hello",
    ocrStatus: "none",
  } as DocumentRecord;

  it("flags an empty category, an unread scan, or a failed read", () => {
    expect(needsAttention(doc)).toBe(false);
    expect(needsAttention({ ...doc, category: "  " })).toBe(true);
    expect(needsAttention({ ...doc, text: "" })).toBe(true);
    expect(needsAttention({ ...doc, ocrStatus: "failed" })).toBe(true);
  });
});

describe("suggestions", () => {
  it("finds a due date and an amount without applying them", () => {
    const suggested = suggestFor("Amount due 1 480.00 SEK\nDue date 2026-11-02", "bill.pdf");
    expect(suggested.dates.some((d) => d.date === "2026-11-02" && d.kind === "bill-due")).toBe(true);
    expect(suggested.amounts.length).toBeGreaterThan(0);
    expect(suggested.category).toBe("Bills & utilities");
  });
});
