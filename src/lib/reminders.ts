import type { DocDate } from "./types";

/** How far ahead the library "Coming up" list looks. */
export const REMINDER_MAX_DAYS = 45;

/** Overdue dates older than this stay off "Coming up" so they don't hide soon dates. */
export const REMINDER_MIN_DAYS = -7;

export function isComingUp(daysFromToday: number): boolean {
  return daysFromToday >= REMINDER_MIN_DAYS && daysFromToday <= REMINDER_MAX_DAYS;
}

export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(`${iso}T00:00:00`);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

/** Next occurrence for yearly recurrence (keeps month/day, advances year if past). */
export function effectiveDate(date: DocDate, now = new Date()): string {
  if (date.recurrence !== "yearly") return date.date;
  const base = new Date(`${date.date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return date.date;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let year = today.getFullYear();
  let next = new Date(year, base.getMonth(), base.getDate());
  if (next < today) {
    year += 1;
    next = new Date(year, base.getMonth(), base.getDate());
  }
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** A user-added date that should show up in Coming up. */
export function isOpenReminder(date: DocDate, now = new Date()): boolean {
  if (date.source === "found") return false;
  if (date.status === "done" || date.status === "dismissed") return false;
  if (date.remindDays === null) return false;
  if (typeof date.snoozeUntil === "number" && date.snoozeUntil > now.getTime()) return false;
  const days = daysUntil(effectiveDate(date, now), now);
  if (days < REMINDER_MIN_DAYS) return false;
  const lead = date.remindDays ?? 0;
  return days <= Math.max(REMINDER_MAX_DAYS, lead);
}

export function snoozeDate(date: DocDate, days: number, now = Date.now()): DocDate {
  return { ...date, snoozeUntil: now + days * 86400000 };
}
