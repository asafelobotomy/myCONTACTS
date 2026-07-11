import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const STABLE_CONTENT_SCRIPT = "assets/content-script.js";

export function stableContentScriptPlugin() {
  return {
    name: "stable-content-script",
    closeBundle() {
      const distDir = join(repoRoot, "dist");
      const assetsDir = join(distDir, "assets");
      let files;

      try {
        files = readdirSync(assetsDir);
      } catch {
        return;
      }

      const main = files.find(
        (file) => /^content-script\.ts-.+\.js$/.test(file) && !file.includes("loader"),
      );

      if (!main) {
        return;
      }

      copyFileSync(join(assetsDir, main), join(assetsDir, "content-script.js"));
      writeFileSync(
        join(assetsDir, "content-script-loader.js"),
        `(function () {
  'use strict';

  const injectTime = performance.now();
  (async () => {
    const { onExecute } = await import(
      /* @vite-ignore */
      chrome.runtime.getURL("${STABLE_CONTENT_SCRIPT}")
    );
    onExecute?.({ perf: { injectTime, loadTime: performance.now() - injectTime } });
  })().catch(console.error);
})();
`,
      );

      const manifestPath = join(distDir, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const resourceGroups = manifest.web_accessible_resources ?? [];
      const defaultGroup = resourceGroups.find((group) =>
        group.matches?.includes("https://*/*"),
      );

      if (defaultGroup) {
        const resources = new Set(defaultGroup.resources ?? []);
        resources.add(STABLE_CONTENT_SCRIPT);
        defaultGroup.resources = Array.from(resources);
      } else {
        resourceGroups.push({
          matches: ["http://*/*", "https://*/*"],
          resources: [STABLE_CONTENT_SCRIPT],
          use_dynamic_url: false,
        });
        manifest.web_accessible_resources = resourceGroups;
      }

      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}
