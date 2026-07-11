import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "myCONTACTS",
  version: "0.2.0",
  description:
    "Extract, store, and export contact information from websites — local-first, no cloud.",
  permissions: ["storage", "sidePanel", "tabs", "activeTab", "scripting"],
  host_permissions: ["<all_urls>"],
  action: {
    default_title: "myCONTACTS",
    default_icon: {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
});
