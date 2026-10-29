// The TanStack Start config already includes devtools, the router plugin, React,
// Tailwind, path aliases, and the Nitro server build. Do not add those plugins again.
// Pass extra config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
