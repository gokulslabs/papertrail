import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { SiteHeader, appFrameClass, MAIN_CONTENT_ID } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLibrary } from "@/lib/use-library";
import { downloadIcs } from "@/lib/backup";
import { onChanged, patchDocument } from "@/lib/db";
import { daysUntil, effectiveDate, isOpenReminder, snoozeDate } from "@/lib/reminders";
import { DATE_KINDS, dateLabel } from "@/lib/date-kinds";
import { DateFields, type DateDraft } from "@/components/date-fields";
import {
  addRememberDate,
  listRememberDates,
  removeRememberDate,
  updateRememberDate,
  type RememberDate,
} from "@/lib/remember-dates";
import type { DocDate, DocumentRecord } from "@/lib/types";

export const Route = createFileRoute("/dates")({
  head: () => ({
    meta: [
      { title: "Dates to Remember · Privytrail" },
      {
        name: "description",
        content:
          "Birthdays, warranties, renewals and other dates you want to remember — with or without a document.",
      },
    ],
  }),
  component: DatesPage,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Dated = DocDate & {
  days: number;
  eff: string;
  doc?: DocumentRecord;
  remember?: RememberDate;
  displayTitle: string;
};

function DatesPage() {
  const { docs } = useLibrary();
  const [personal, setPersonal] = useState<RememberDate[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [tab, setTab] = useState<"upcoming" | "timeline">("upcoming");
  const [showFound, setShowFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState("");
  const [draft, setDraft] = useState<DateDraft>({
    kind: "birthday",
    date: "",
    note: "",
    remindDays: 7,
    recurrence: "yearly",
  });

  const reloadPersonal = async () => setPersonal(await listRememberDates());

  useEffect(() => {
    void reloadPersonal();
    return onChanged(() => {
      void reloadPersonal();
    });
  }, []);

  useEffect(() => {
    if (draft.kind === "birthday" && draft.recurrence !== "yearly") {
      setDraft((d) => ({ ...d, recurrence: "yearly" }));
    }
  }, [draft.kind]);

  const events = useMemo(() => {
    const fromDocs: Dated[] = (docs ?? []).flatMap((doc) =>
      doc.dates
        .filter((date) => date.source !== "found")
        .map((date) => {
          const eff = effectiveDate(date);
          return {
            ...date,
            doc,
            eff,
            days: daysUntil(eff),
            displayTitle: doc.title,
          };
        }),
    );
    const fromPersonal: Dated[] = personal.map((r) => {
      const eff = effectiveDate(r);
      return {
        ...r,
        remember: r,
        eff,
        days: daysUntil(eff),
        displayTitle: r.title,
      };
    });
    return [...fromDocs, ...fromPersonal].sort(
      (a, b) => a.eff.localeCompare(b.eff) || a.label.localeCompare(b.label),
    );
  }, [docs, personal]);

  const upcoming = events.filter((event) => isOpenReminder(event));
  const dueTodayNotSnoozed = upcoming.filter(
    (event) => event.days === 0 && !(typeof event.snoozeUntil === "number" && event.snoozeUntil > Date.now()),
  );
  const needsAttentionEvents = upcoming.filter((event) => event.days <= 0);
  const restUpcoming = upcoming.filter((event) => event.days > 0);
  const documentDates = useMemo(() => {
    if (!showFound) return [];
    return (docs ?? [])
      .filter((doc) => !!doc.documentDate)
      .map((doc) => ({
        label: "Document date",
        date: doc.documentDate!,
        doc,
        days: daysUntil(doc.documentDate!),
        source: "user" as const,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [docs, showFound]);
  const pastOpen = events.filter(
    (event) => event.days < 0 && event.status !== "done" && event.status !== "dismissed",
  );

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    for (const event of upcoming) {
      if (event.days !== 0) continue;
      const key = `privytrail-notified-${event.remember?.id ?? event.doc?.id}-${event.date}-${event.label}`;
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
      new Notification(`${dateLabel(event)} — ${event.displayTitle}`, {
        body: "Due today. Privytrail can only notify while this tab is open.",
      });
    }
  }, [upcoming, permission]);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPermission(next);
  };

  const submitPersonal = async () => {
    if (!draft.date || !who.trim()) return;
    const note = draft.note.trim() || who.trim();
    await addRememberDate({
      title: who.trim(),
      label: dateLabel({ kind: draft.kind, label: "", note }),
      date: draft.date,
      kind: draft.kind,
      note,
      remindDays: draft.remindDays,
      recurrence: draft.kind === "birthday" || draft.recurrence === "yearly" ? "yearly" : undefined,
      status: "open",
      source: "user",
    });
    setWho("");
    setDraft({
      kind: "birthday",
      date: "",
      note: "",
      remindDays: DATE_KINDS.birthday.remindDays,
      recurrence: "yearly",
    });
    setAdding(false);
  };

  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} className="mx-auto w-full max-w-2xl px-6 pb-24">
        <h1 className="text-ink-serif mt-2 text-3xl font-semibold">Dates to Remember</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Birthdays, warranties, renewals — anything you want a nudge for. Add them here, or attach
          dates to a document in your library.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Add a date</h2>
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                Add date to remember
              </Button>
            )}
          </div>
          {adding ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPersonal();
              }}
            >
              <label className="block text-xs font-medium text-muted-foreground">
                Who or what?
                <Input
                  className="mt-1"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder="e.g. Mom, girlfriend, AppleCare, passport"
                  autoFocus
                  required
                />
              </label>
              <DateFields
                value={draft}
                onChange={(next) => {
                  if (next.kind === "birthday") {
                    setDraft({ ...next, recurrence: "yearly", note: next.note || who });
                  } else {
                    setDraft(next);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Tip: for birthdays, set Repeat to every year. For an Apple warranty, pick Warranty
                expires.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!draft.date || !who.trim()}>
                  Save date
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Examples: Mom&apos;s birthday, girlfriend&apos;s birthday, Apple warranty expiry, passport
              renewal.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">
            {permission === "granted" ? "Browser notifications are on" : "Browser notifications are off"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            When a reminder is due, Privytrail can show a notification — but only while it is open
            in a browser tab. For reminders you can count on, add the date to your calendar.
          </p>
          {permission !== "granted" && permission !== "unsupported" && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void enable()}>
              Turn on
            </Button>
          )}
        </section>

        {events.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadIcs(
                  events.map((event) => ({
                    title: event.displayTitle,
                    label: dateLabel(event),
                    date: event.eff,
                    remindDays: event.remindDays,
                    recurrence: event.recurrence === "yearly" ? "yearly" : undefined,
                  })),
                )
              }
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Add all to calendar
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            className={`rounded-full px-3 py-1 text-sm ${tab === "upcoming" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("upcoming")}
          >
            Upcoming
          </button>
          <button
            className={`rounded-full px-3 py-1 text-sm ${tab === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setTab("timeline")}
          >
            Timeline
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showFound} onChange={(e) => setShowFound(e.target.checked)} />
            Show document dates
          </label>
        </div>

        {tab === "upcoming" && dueTodayNotSnoozed.length > 0 && (
          <div className="mt-4 rounded-xl bg-sage px-4 py-3 text-sm text-sage-foreground">
            <strong className="font-semibold">
              {dueTodayNotSnoozed.length} {dueTodayNotSnoozed.length === 1 ? "reminder is" : "reminders are"} due
              today.
            </strong>{" "}
            Snooze or mark done below, or add them to your calendar.
          </div>
        )}

        {tab === "upcoming" ? (
          <section className="mt-4 space-y-6">
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No upcoming reminders. Add a birthday, warranty, or other date above — or attach
                dates to a document in your library.
              </p>
            ) : (
              <>
                {needsAttentionEvents.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold">Needs attention</h2>
                    <DateList events={needsAttentionEvents} />
                  </div>
                )}
                <UpcomingByMonth events={restUpcoming} />
              </>
            )}
          </section>
        ) : (
          <>
            <Timeline events={showFound ? [...events, ...documentDatesAsDated(documentDates)] : events} />
            <p className="mt-4 text-xs text-muted-foreground">
              {events.length} {events.length === 1 ? "date" : "dates"} · {pastOpen.length} past{" "}
              {pastOpen.length === 1 ? "item" : "items"} still open.
            </p>
          </>
        )}

        {showFound && tab === "upcoming" && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">Document dates</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Confirmed issued dates from each document (separate from reminders).
            </p>
            {documentDates.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No document dates set yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
                {documentDates.map((event) => (
                  <li key={`${event.doc.id}-docdate`} className="flex items-center gap-3 py-3 text-sm">
                    <Link
                      to="/library/$id"
                      params={{ id: event.doc.id }}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      <span className="font-medium">Document date</span>
                      <span className="text-muted-foreground"> — {event.doc.title}</span>
                    </Link>
                    <span className="text-muted-foreground">{formatDate(event.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function documentDatesAsDated(
  items: Array<{ label: string; date: string; doc: DocumentRecord; days: number }>,
): Dated[] {
  return items.map((item) => ({
    label: item.label,
    date: item.date,
    eff: item.date,
    days: item.days,
    doc: item.doc,
    source: "user",
    remindDays: null,
    displayTitle: item.doc.title,
  }));
}

function UpcomingByMonth({ events }: { events: Dated[] }) {
  if (events.length === 0) return null;
  const groups = new Map<string, Dated[]>();
  for (const event of events) {
    const key = event.eff.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="text-sm font-semibold">
            {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <DateList events={items} />
        </section>
      ))}
    </div>
  );
}

function DateList({ events }: { events: Dated[] }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
      {events.map((event) => (
        <DateRow
          key={`${event.remember?.id ?? event.doc?.id}-${event.label}-${event.date}-${event.status ?? "open"}`}
          event={event}
        />
      ))}
    </ul>
  );
}

function DateRow({ event }: { event: Dated }) {
  const [editing, setEditing] = useState(false);
  const [who, setWho] = useState(event.remember?.title ?? event.displayTitle);
  const [draft, setDraft] = useState<DateDraft>({
    kind: event.kind && event.kind in DATE_KINDS ? event.kind : "other",
    date: event.date,
    note: event.note ?? "",
    remindDays: event.remindDays === undefined ? 0 : event.remindDays,
    recurrence: event.recurrence === "yearly" ? "yearly" : "none",
  });

  const apply = async (patch: Partial<DocDate> & { title?: string }) => {
    if (event.remember) {
      const { title, ...rest } = patch;
      await updateRememberDate(event.remember.id, {
        ...rest,
        ...(title ? { title } : {}),
      });
      return;
    }
    if (!event.doc) return;
    const matchDate = (date: DocDate) => date.label === event.label && date.date === event.date;
    await patchDocument(event.doc.id, {
      dates: event.doc.dates.map((date) => (matchDate(date) ? { ...date, ...patch } : date)),
    });
  };

  const snooze = (days: number) => void apply(snoozeDate(event, days));

  const remove = async () => {
    if (event.remember) {
      await removeRememberDate(event.remember.id);
      return;
    }
    if (!event.doc) return;
    await patchDocument(event.doc.id, {
      dates: event.doc.dates.filter((date) => !(date.label === event.label && date.date === event.date)),
    });
  };

  return (
    <li className="py-3 text-sm">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const note = draft.note.trim() || who.trim();
            const next: Partial<DocDate> & { title?: string } = {
              label: dateLabel({ kind: draft.kind, label: event.label, note }),
              date: draft.date,
              kind: draft.kind,
              remindDays: draft.remindDays,
              recurrence: draft.kind === "birthday" || draft.recurrence === "yearly" ? "yearly" : "none",
              note,
              title: who.trim() || event.displayTitle,
            };
            void apply(next).then(() => setEditing(false));
          }}
        >
          {event.remember && (
            <label className="mb-3 block text-xs font-medium text-muted-foreground">
              Who or what?
              <Input className="mt-1" value={who} onChange={(e) => setWho(e.target.value)} required />
            </label>
          )}
          <DateFields value={draft} onChange={setDraft} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save date
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {event.doc ? (
            <Link
              to="/library/$id"
              params={{ id: event.doc.id }}
              className="min-w-0 flex-1 truncate hover:underline"
            >
              <span className="font-medium">{dateLabel(event)}</span>
              <span className="text-muted-foreground"> — {event.displayTitle}</span>
            </Link>
          ) : (
            <div className="min-w-0 flex-1 truncate">
              <span className="font-medium">{dateLabel(event)}</span>
              <span className="text-muted-foreground"> — {event.displayTitle}</span>
            </div>
          )}
          <span className="shrink-0 text-muted-foreground">
            {formatDate(event.eff)}
            {event.recurrence === "yearly" ? " · yearly" : ""}
            {event.status === "done"
              ? " · Done"
              : event.status === "dismissed"
                ? " · Dismissed"
                : event.days < 0
                  ? ` · ${-event.days}d overdue`
                  : event.days === 0
                    ? " · today"
                    : ` · in ${event.days}d`}
          </span>
          {event.status !== "done" && event.status !== "dismissed" && (
            <>
              <button className="text-xs underline" onClick={() => void apply({ status: "done" })}>
                Mark as done
              </button>
              <button type="button" className="text-xs underline" onClick={() => snooze(1)}>
                Snooze 1d
              </button>
              <button type="button" className="text-xs underline" onClick={() => snooze(7)}>
                Snooze 1w
              </button>
              <button type="button" className="text-xs underline" onClick={() => snooze(30)}>
                Snooze 1mo
              </button>
            </>
          )}
          <button className="text-xs underline" onClick={() => setEditing(true)}>
            Edit…
          </button>
          {event.status === "dismissed" || event.status === "done" ? (
            <button className="text-xs underline" onClick={() => void apply({ status: "open" })}>
              Reactivate
            </button>
          ) : (
            <button className="text-xs underline" onClick={() => void apply({ status: "dismissed" })}>
              Dismiss
            </button>
          )}
          <button className="text-xs underline" onClick={() => void remove()}>
            Remove
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Add to calendar (.ics)"
            onClick={() =>
              downloadIcs([
                {
                  title: event.displayTitle,
                  label: dateLabel(event),
                  date: event.eff,
                  remindDays: event.remindDays,
                  recurrence: event.recurrence === "yearly" ? "yearly" : undefined,
                },
              ])
            }
          >
            <CalendarPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}

function Timeline({ events }: { events: Dated[] }) {
  const groups = new Map<string, Dated[]>();
  for (const event of events) {
    const key = event.eff.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  if (events.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No dates on the timeline yet.</p>;
  }
  return (
    <div className="mt-4 space-y-6">
      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="text-sm font-semibold">
            {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <DateList events={items} />
        </section>
      ))}
    </div>
  );
}
