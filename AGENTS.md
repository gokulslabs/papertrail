## Architecture

- Privytrail is fully client-side: document metadata lives in IndexedDB via `idb` (`src/lib/db.ts`), and original files live in a separate `files` store so the library list does not load every blob. No server holds document data.
- Two workspaces (main/sample) are separate IndexedDB databases (`privytrail`, `privytrail-sample`); the active one is stored in localStorage and switched with `setWorkspace`, which closes the previous connection.
- pdf.js and tesseract.js must only be dynamically imported inside function bodies in `src/lib/extract.ts` (never statically) — they are browser-only and must stay out of the SSR graph. Use pdf.js legacy build (v6 default build uses APIs some browsers lack). OCR assets are served from `public/tesseract/`.
- Fonts are self-hosted (`@fontsource-variable/inter` and `newsreader`). Do not add third-party font or script hosts; the page CSP only allows this origin.
- Sample documents are static files in `public/samples/` loaded by `src/lib/samples.ts`; their metadata dates match the dates printed inside the files.
