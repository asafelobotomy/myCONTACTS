import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";
// @ts-expect-error Vite build plugin is implemented in JavaScript.
import { stableContentScriptPlugin } from "./scripts/vite-stable-content-script.mjs";

export default defineConfig({
  plugins: [react(), crx({ manifest }), stableContentScriptPlugin()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: "src/sidepanel/index.html",
      },
    },
  },
});
