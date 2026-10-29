import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { SiteHeader, appFrameClass } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/lib/use-library";
import { downloadIcs } from "@/lib/backup";
import { patchDocument } from "@/lib/db";
import { daysUntil, isOpenReminder } from "@/lib/reminders";
import { suggestDates } from "@/lib/suggest";
import { DATE_KINDS, dateLabel } from "@/lib/date-kinds";
import { DateFields, type DateDraft } from "@/components/date-fields";
import type { DocDate, DocumentRecord } from "@/lib/types";

export const Route = createFileRoute("/dates")({
  head: () => ({
    meta: [
      { title: "Important dates · Privytrail" },
      {
        name: "description",
        content: "Warranty expiries, renewals, due dates and other deadlines attached to your documents.",
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

function DatesPage() {
  const { docs } = useLibrary();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [tab, setTab] = useState<"upcoming" | "timeline">("upcoming");
  const [showFound, setShowFound] = useState(false);

  const events = useMemo(() => {
    return (docs ?? [])
      .flatMap((doc) =>
        doc.dates
          .filter((date) => date.source !== "found")
          .map((date) => ({ ...date, doc, days: daysUntil(date.date) })),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }, [docs]);

  const upcoming = events.filter((event) => isOpenReminder(event));
  const found = useMemo(() => {
    if (!showFound) return [];
    return (docs ?? []).flatMap((doc) => {
      const existing = new Set(doc.dates.map((date) => date.date));
      return suggestDates(doc.text)
        .filter((date) => !existing.has(date.date))
        .map((date) => ({ ...date, doc }));
    });
  }, [docs, showFound]);

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
      const key = `privytrail-notified-${event.doc.id}-${event.date}-${event.label}`;
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
      new Notification(`${event.label} — ${event.doc.title}`, {
        body: "Due today. Privytrail can only notify while this tab is open.",
      });
    }
  }, [upcoming, permission]);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPermission(next);
  };

  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 pb-24">
        <h1 className="text-ink-serif mt-2 text-3xl font-semibold">Important dates</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Warranty expiries, renewals, due dates and other deadlines attached to your documents.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">
            {permission === "granted" ? "Browser notifications are on" : "Browser notifications are off"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            When a reminder is due, Privytrail can show a notification — but only while it is open
            in a browser tab. Websites can't reliably run in the background, so for reminders you
            can count on, add the date to your calendar.
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
                downloadIcs(events.map((event) => ({ title: event.doc.title, label: event.label, date: event.date, remindDays: event.remindDays })))
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

        {tab === "upcoming" ? (
          <section className="mt-4">
            <h2 className="text-sm font-semibold">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No important dates yet. Open a document and add a warranty expiry, renewal or due date.
                Privytrail never turns a printed date into a deadline on its own.
              </p>
            ) : (
              <DateList events={upcoming} />
            )}
          </section>
        ) : (
          <Timeline events={events} />
        )}

        {showFound && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">Dates found in your documents</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              These are printed in the file. They stay off your reminders until you add one.
            </p>
            {found.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No extra dates found in the text.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
                {found.map((event) => (
                  <li key={`${event.doc.id}-${event.label}-${event.date}`} className="flex items-center gap-3 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{dateLabel(event)}</span>
                      <span className="text-muted-foreground"> — {event.doc.title}</span>
                    </span>
                    <span className="text-muted-foreground">{formatDate(event.date)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void patchDocument(event.doc.id, {
                          dates: [...event.doc.dates, { label: dateLabel(event), date: event.date, ...(event.kind ? { kind: event.kind } : {}), source: "user", status: "open", remindDays: event.kind ? DATE_KINDS[event.kind].remindDays : 0 }],
                        })
                      }
                    >
                      Add
                    </Button>
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

type Dated = DocDate & { days: number; doc: DocumentRecord };

function DateList({ events }: { events: Dated[] }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
      {events.map((event) => (
        <DateRow key={`${event.doc.id}-${event.label}-${event.date}-${event.status ?? "open"}`} event={event} />
      ))}
    </ul>
  );
}

function DateRow({ event }: { event: Dated }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DateDraft>({
    kind: event.kind && event.kind in DATE_KINDS ? event.kind : "other",
    date: event.date,
    note: event.note ?? "",
    remindDays: event.remindDays === undefined ? 0 : event.remindDays,
  });
  const replace = (patch: Partial<DocDate>) =>
    void patchDocument(event.doc.id, {
      dates: event.doc.dates.map((date) =>
        date.label === event.label && date.date === event.date ? { ...date, ...patch } : date,
      ),
    });
  return (
    <li className="py-3 text-sm">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const note = draft.note.trim();
            const next: DocDate = {
              label: dateLabel({ kind: draft.kind, label: event.label, note }),
              date: draft.date,
              kind: draft.kind,
              remindDays: draft.remindDays,
            };
            if (event.status) next.status = event.status;
            if (event.source) next.source = event.source;
            if (note) next.note = note;
            void patchDocument(event.doc.id, {
              dates: event.doc.dates.map((date) =>
                date.label === event.label && date.date === event.date ? next : date,
              ),
            });
            setEditing(false);
          }}
        >
          <DateFields value={draft} onChange={setDraft} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" size="sm">Save date</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/library/$id" params={{ id: event.doc.id }} className="min-w-0 flex-1 truncate hover:underline">
            <span className="font-medium">{dateLabel(event)}</span>
            <span className="text-muted-foreground"> — {event.doc.title}</span>
            {event.note && event.kind !== "other" ? <span className="block truncate text-xs text-muted-foreground">{event.note}</span> : null}
          </Link>
          <span className="shrink-0 text-muted-foreground">
            {formatDate(event.date)}
            {event.status === "done" ? " · Done" : event.status === "dismissed" ? " · Dismissed" : event.days < 0 ? ` · ${-event.days}d overdue` : event.days === 0 ? " · today" : ` · in ${event.days}d`}
          </span>
          {event.status !== "done" && event.status !== "dismissed" && (
            <button className="text-xs underline" onClick={() => replace({ status: "done" })}>Mark as done</button>
          )}
          <button className="text-xs underline" onClick={() => setEditing(true)}>Edit…</button>
          {event.status === "dismissed" || event.status === "done" ? (
            <button className="text-xs underline" onClick={() => replace({ status: "open" })}>Reactivate</button>
          ) : (
            <button className="text-xs underline" onClick={() => replace({ status: "dismissed" })}>Dismiss</button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Add to calendar (.ics)"
            onClick={() => downloadIcs([{ title: event.doc.title, label: dateLabel(event), date: event.date, remindDays: event.remindDays }])}
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
    const key = event.date.slice(0, 7);
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
            {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h2>
          <DateList events={items} />
        </section>
      ))}
    </div>
  );
}
