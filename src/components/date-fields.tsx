import { DATE_KIND_ORDER, DATE_KINDS, REMIND_OPTIONS, type DateKind } from "@/lib/date-kinds";

export interface DateDraft {
  kind: DateKind;
  date: string;
  note: string;
  remindDays: number | null;
}

export function DateFields({
  value,
  onChange,
}: {
  value: DateDraft;
  onChange: (next: DateDraft) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs font-medium text-muted-foreground sm:col-span-2">
        What is this date?
        <select
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={value.kind}
          onChange={(e) => {
            const kind = e.target.value as DateKind;
            const previous = DATE_KINDS[value.kind].remindDays;
            onChange({
              ...value,
              kind,
              remindDays: value.remindDays === previous ? DATE_KINDS[kind].remindDays : value.remindDays,
            });
          }}
        >
          {DATE_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {DATE_KINDS[kind].label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        Date
        <input
          type="date"
          required
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        Reminder
        <select
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={value.remindDays ?? ""}
          onChange={(e) => onChange({ ...value, remindDays: e.target.value === "" ? null : Number(e.target.value) })}
        >
          {REMIND_OPTIONS.map((option) => (
            <option key={option.label} value={option.value ?? ""}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-muted-foreground sm:col-span-2">
        Note <span className="font-normal">(optional)</span>
        <input
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          maxLength={120}
          value={value.note}
          placeholder={value.kind === "other" ? "e.g. Car service due" : "e.g. AppleCare+"}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </label>
    </div>
  );
}
