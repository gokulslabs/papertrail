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

/** A user-added date that should show up in Coming up. */
export function isOpenReminder(date: DocDate, now = new Date()): boolean {
  if (date.source === "found") return false;
  if (date.status === "done" || date.status === "dismissed") return false;
  if (date.remindDays === null) return false;
  const days = daysUntil(date.date, now);
  if (days < REMINDER_MIN_DAYS) return false;
  const lead = date.remindDays ?? 0;
  return days <= Math.max(REMINDER_MAX_DAYS, lead);
}
