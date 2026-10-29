import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  clearImportSession,
  cancelImportRow,
  dismissImportRow,
  getImportSession,
  setImportCollapsed,
  skipImportRow,
  subscribeImport,
  type ImportSession,
} from "@/lib/import-queue";
import { cn } from "@/lib/utils";

export function ImportProgressPanel() {
  const [session, setSession] = useState<ImportSession | null>(getImportSession());

  useEffect(() => subscribeImport(() => setSession(getImportSession())), []);

  if (!session || !session.rows.length) return null;

  const doneCount = session.rows.filter((r) => r.status === "done").length;
  const progress = session.total ? doneCount / session.total : 0;

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[min(100%-2rem,22rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{session.label}</p>
          {!session.done && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={session.collapsed ? "Expand" : "Collapse"}
          onClick={() => setImportCollapsed(!session.collapsed)}
        >
          {session.collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => clearImportSession()}
        >
          Clear
        </button>
      </div>
      {!session.collapsed && (
        <ul className="max-h-64 overflow-auto py-1 text-sm">
          {session.rows.map((row) => (
            <li key={row.id} className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{row.fileName}</p>
                <p
                  className={cn(
                    "text-xs",
                    row.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {row.detail}
                  {row.error ? ` · ${row.error}` : ""}
                </p>
              </div>
              {(row.status === "waiting" || row.status === "queued") && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => skipImportRow(row.id)}
                >
                  Skip
                </button>
              )}
              {row.status !== "done" &&
                row.status !== "failed" &&
                row.status !== "skipped" &&
                row.status !== "waiting" &&
                row.status !== "queued" && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => cancelImportRow(row.id)}
                  >
                    Cancel
                  </button>
                )}
              {(row.status === "done" || row.status === "failed" || row.status === "skipped") && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Dismiss"
                  onClick={() => dismissImportRow(row.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
