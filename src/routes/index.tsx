import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import {
  Upload,
  Lock,
  FileSearch,
  CalendarClock,
  HardDriveDownload,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

import { LandingHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { addFiles, addSampleDocuments } from "@/lib/use-library";
import { listDocuments, setWorkspace } from "@/lib/db";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Privytrail — your private document memory" },
      {
        name: "description",
        content:
          "Keep receipts, bills, warranties and important files searchable on your device. No account, no uploads.",
      },
      { property: "og:title", content: "Privytrail — your private document memory" },
      {
        property: "og:description",
        content:
          "Keep receipts, bills, warranties and important files searchable on your device. Nothing is uploaded and there's no account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const startWith = (picked: File[]) => {
    if (!picked.length) return;
    setWorkspace("main");
    setBusy(true);
    void addFiles(picked).finally(() => setBusy(false));
    void navigate({ to: "/library" });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const picked = Array.from(e.dataTransfer?.files ?? []);
    startWith(picked);
  };

  const exploreSamples = async () => {
    setBusy(true);
    const toastId = toast.loading("Opening sample workspace…");
    try {
      setWorkspace("sample");
      const existing = await listDocuments();
      if (existing.length === 0) await addSampleDocuments();
      toast.dismiss(toastId);
      await navigate({ to: "/library" });
    } catch (err) {
      console.error(err);
      toast.error("Could not open the sample workspace", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="mx-auto max-w-2xl pt-14 pb-10 text-center sm:pt-20">
          <h1 className="text-ink-serif text-5xl leading-[1.08] font-semibold sm:text-6xl">
            Your documents.
            <br />
            <em className="font-normal italic">Finally, in one place.</em>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Keep receipts, bills, warranties and important files searchable on your device.
          </p>
        </section>

        <section className="mx-auto max-w-2xl pb-16">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-3xl border border-dashed border-input bg-card px-6 py-10 text-center shadow-sm transition-all ${
              dragging ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background" : ""
            } ${busy ? "opacity-70" : ""}`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage">
              <Upload className="h-6 w-6 text-sage-foreground" strokeWidth={1.75} />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-foreground">
              Drop files here to start your library
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              PDF, JPEG, PNG, WebP, TXT, Markdown and CSV · multiple files or whole folders
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button size="lg" onClick={() => filesInput.current?.click()} disabled={busy}>
                Choose files
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => folderInput.current?.click()}
                disabled={busy}
              >
                or choose a folder
              </button>
            </div>
            <input
              ref={filesInput}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                startWith(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={folderInput}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => {
                startWith(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          <p className="mx-auto mt-5 flex max-w-md items-start justify-center gap-2 text-center text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              Files are read and stored in this browser on this device. Nothing is uploaded and
              there's no account.{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                Details
              </Link>
            </span>
          </p>

          <div className="mt-10 text-center">
            <button
              onClick={() => void exploreSamples()}
              disabled={busy}
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Explore with sample documents
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-2 text-sm text-muted-foreground">
              Opens a separate sample workspace you can discard any time.
            </p>
          </div>
        </section>

        <hr className="border-border" />

        <section className="grid gap-10 py-14 sm:grid-cols-3">
          <Feature
            icon={<FileSearch className="h-4.5 w-4.5 text-sage-foreground" strokeWidth={1.75} />}
            title="Find anything"
            body="Search the words inside your PDFs and scans, plus names, tags and notes — results show the matching passage."
          />
          <Feature
            icon={<CalendarClock className="h-4.5 w-4.5 text-sage-foreground" strokeWidth={1.75} />}
            title="Remember dates"
            body="Mark warranty expiries, renewals and due dates, see what's coming up, or add them to your calendar."
          />
          <Feature
            icon={
              <HardDriveDownload className="h-4.5 w-4.5 text-sage-foreground" strokeWidth={1.75} />
            }
            title="Keep a backup"
            body="Export everything — originals and details — as one ZIP file you can restore in any browser."
          />
        </section>

        <footer className="flex flex-col items-center gap-1 pb-10 text-center text-sm text-muted-foreground">
          <p>Runs entirely in your browser. No account, no uploads.</p>
        </footer>
      </main>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage">{icon}</span>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
