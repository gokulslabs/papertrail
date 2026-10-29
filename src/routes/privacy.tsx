import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { SiteHeader, appFrameClass, MAIN_CONTENT_ID } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "How your data is handled — Privytrail" },
      {
        name: "description",
        content:
          "Privytrail runs entirely in your browser. Your documents never leave your device — no accounts, no uploads.",
      },
      { property: "og:title", content: "How your data is handled — Privytrail" },
      {
        property: "og:description",
        content: "Privytrail runs entirely in your browser. Your documents never leave your device.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} className="mx-auto w-full max-w-2xl px-6 pb-24">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Privacy</p>
        <h1 className="text-ink-serif mt-2 text-4xl font-semibold">How your data is handled</h1>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <p>
            PRIVYTRAIL is a website that runs entirely in your browser. It has no accounts.
            Your documents never leave your browser.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Your files stay in this browser</h2>
            <p>
              When you add a document, your browser reads it and stores the original file, its
              extracted text (including how it was obtained, character counts and OCR confidence
              when applicable), a content checksum, a small thumbnail and the details you add
              (title, tags, notes, document date, important dates) in this site's local database
              (IndexedDB) on this device. None of it is uploaded anywhere.
            </p>
            <p>
              Optional backup exports can be password-encrypted on your device before download, and
              per-document highlights or annotations stay in this browser only.
            </p>
            <p>
              The page's Content Security Policy only allows network connections to this website's
              own address, so the app itself can't send document data to other servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">What is downloaded, and from where</h2>
            <p>
              The app's code, fonts and the PDF reader come from this website. If you use text
              recognition (OCR), the recognition engine and the English language model (about
              10&nbsp;MB) are downloaded from this website the first time they're needed. Your
              documents are processed inside your browser and are never sent with these requests.
            </p>
            <p>
              Like any website, the server hosting PRIVYTRAIL can see ordinary request
              information (such as your IP address and which app files were loaded). It never
              receives your documents or their contents.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">What PRIVYTRAIL does — and doesn't — understand</h2>
            <p>
              Search finds the words that are actually in your documents. Category suggestions,
              amounts and dates come from simple, local pattern matching, are labeled as
              suggestions, and are never treated as confirmed until you accept them. There is no
              AI service involved.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Password-protected PDFs</h2>
            <p>
              If a PDF is password-protected, you can type its password to view it or to read its
              text. The password is used in this tab only and is never saved. Text read from such
              a PDF is stored like any other document's text — unencrypted — so that search can
              find it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">This is not an encrypted vault</h2>
            <p>
              Browser storage isn't encrypted by PRIVYTRAIL. Anyone who can use this browser
              profile on this device — or software with access to it — can open your library. Use
              your device's lock screen and account protection, and avoid shared or public
              computers for sensitive documents.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Browser storage can disappear</h2>
            <p>
              Your library is deleted if you clear this site's data or your browsing history,
              reset or uninstall the browser, or lose the device. In private/incognito windows it
              disappears when the window closes. Browsers may also remove site data when disk
              space runs low, and Safari can remove it for sites you haven't visited for several
              weeks.
            </p>
            <p>
              <strong>Export a backup regularly</strong> from{" "}
              <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
                Settings → Backup &amp; restore
              </Link>
              . The backup is a normal ZIP file with your original files and a manifest (you can
              encrypt it with a password in Settings). Store it somewhere you trust. Your library doesn't sync between
              devices — to move it, export a backup and restore it in the other browser.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Reminders</h2>
            <p>
              Reminders appear inside the app. If you turn on browser notifications, they're shown
              only while Privytrail is open in a tab — websites can't reliably run in the
              background. For reminders you can depend on, use “Add to calendar” to export dates
              as an .ics file for your calendar app.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Deleting your data</h2>
            <p>
              Deleting a document removes its file, text, thumbnail, notes and dates from this
              browser. You can delete everything at once from{" "}
              <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
                Settings
              </Link>
              . Backup files you downloaded are separate files on your device and are not
              affected.
            </p>
          </section>
        </div>

        <Button variant="ghost" className="mt-10" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Back to Privytrail
          </Link>
        </Button>
      </main>
    </div>
  );
}
