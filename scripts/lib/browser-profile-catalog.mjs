/**
 * Browser profile path reference (Linux).
 *
 * Sources:
 * - Chromium user-data-dir: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md
 * - XDG Base Directory / ArchWiki browser entries
 * - Flatpak: ~/.var/app/<app-id>/config/<relative> or ~/.var/app/<app-id>/<relative>
 * - Snap: ~/snap/<name>/common/<relative> (persistent) or current/.config/<relative>
 * - Firefox 147+ XDG: ~/.config/mozilla/firefox (legacy ~/.mozilla/firefox if present)
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * @typedef {"config" | "home"} FlatpakRoot
 * @typedef {"common" | "current"} SnapRoot
 *
 * @typedef {object} BrowserProfileSpec
 * @property {string} id
 * @property {"chromium" | "firefox"} family
 * @property {string[]} [nativeUserDataDirs] relative to XDG config home
 * @property {string[]} [legacyUserDataDirs] relative to $HOME (e.g. .mozilla/firefox)
 * @property {{ flatpakId: string, suffix: string, root?: FlatpakRoot }[]} [flatpakDirs]
 * @property {{ snapName: string, suffix: string, root?: SnapRoot }[]} [snapDirs]
 * @property {string[]} [siblingScanParents] relative dirs under config home to scan (e.g. BraveSoftware)
 * @property {string[]} [firefoxProfileRoots] roots containing profiles.ini (firefox family)
 */

export const BROWSER_PROFILE_SPECS = [
  {
    id: "google-chrome",
    family: "chromium",
    nativeUserDataDirs: [
      "google-chrome",
      "google-chrome-beta",
      "google-chrome-unstable",
      "google-chrome-dev",
      "google-chrome-canary",
      "google-chrome-for-testing",
    ],
    flatpakDirs: [{ flatpakId: "com.google.Chrome", suffix: "google-chrome" }],
    snapDirs: [{ snapName: "chrome", suffix: ".config/google-chrome", root: "current" }],
  },
  {
    id: "chromium",
    family: "chromium",
    nativeUserDataDirs: ["chromium"],
    flatpakDirs: [{ flatpakId: "org.chromium.Chromium", suffix: "chromium" }],
    snapDirs: [
      { snapName: "chromium", suffix: "chromium", root: "common" },
      { snapName: "chromium", suffix: ".config/chromium", root: "current" },
    ],
  },
  {
    id: "brave",
    family: "chromium",
    nativeUserDataDirs: ["BraveSoftware/Brave-Browser"],
    siblingScanParents: ["BraveSoftware"],
    flatpakDirs: [{ flatpakId: "com.brave.Browser", suffix: "BraveSoftware/Brave-Browser" }],
    snapDirs: [
      { snapName: "brave", suffix: ".config/BraveSoftware/Brave-Browser", root: "current" },
      { snapName: "brave", suffix: "BraveSoftware/Brave-Browser", root: "common" },
    ],
  },
  {
    id: "brave-origin",
    family: "chromium",
    nativeUserDataDirs: ["BraveSoftware/Brave-Origin"],
    siblingScanParents: ["BraveSoftware"],
  },
  {
    id: "microsoft-edge",
    family: "chromium",
    nativeUserDataDirs: [
      "microsoft-edge",
      "microsoft-edge-beta",
      "microsoft-edge-dev",
      "microsoft-edge-canary",
    ],
    flatpakDirs: [{ flatpakId: "com.microsoft.Edge", suffix: "microsoft-edge" }],
  },
  {
    id: "vivaldi",
    family: "chromium",
    nativeUserDataDirs: ["vivaldi", "vivaldi-snapshot"],
    flatpakDirs: [{ flatpakId: "com.vivaldi.Vivaldi", suffix: "vivaldi" }],
    snapDirs: [{ snapName: "vivaldi", suffix: ".config/vivaldi", root: "current" }],
  },
  {
    id: "opera",
    family: "chromium",
    nativeUserDataDirs: ["opera"],
    legacyUserDataDirs: [".opera"],
    flatpakDirs: [{ flatpakId: "com.opera.Opera", suffix: "opera" }],
    snapDirs: [{ snapName: "opera", suffix: ".config/opera", root: "current" }],
  },
  {
    id: "firefox",
    family: "firefox",
    firefoxProfileRoots: ["mozilla/firefox"],
    legacyUserDataDirs: [".mozilla/firefox"],
    flatpakDirs: [
      { flatpakId: "org.mozilla.firefox", suffix: ".mozilla/firefox", root: "home" },
      { flatpakId: "org.mozilla.firefox", suffix: "mozilla/firefox" },
    ],
    snapDirs: [{ snapName: "firefox", suffix: ".mozilla/firefox", root: "common" }],
  },
  {
    id: "firefox-esr",
    family: "firefox",
    firefoxProfileRoots: ["mozilla/firefox"],
    legacyUserDataDirs: [".mozilla/firefox"],
    flatpakDirs: [{ flatpakId: "org.mozilla.firefox", suffix: ".mozilla/firefox", root: "home" }],
  },
  {
    id: "librewolf",
    family: "firefox",
    firefoxProfileRoots: ["librewolf"],
    legacyUserDataDirs: [".librewolf"],
    flatpakDirs: [
      { flatpakId: "io.gitlab.librewolf-community", suffix: ".librewolf", root: "home" },
      { flatpakId: "io.gitlab.librewolf-community", suffix: "librewolf" },
    ],
  },
  {
    id: "floorp",
    family: "firefox",
    firefoxProfileRoots: ["floorp"],
    legacyUserDataDirs: [".floorp"],
  },
];

export function getConfigHome() {
  return process.env.CHROME_CONFIG_HOME || process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function getProfileSpec(browserId) {
  return BROWSER_PROFILE_SPECS.find((spec) => spec.id === browserId) ?? null;
}

export function expandHomePath(pathValue) {
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

export function buildFlatpakUserDataDir(flatpakId, suffix, root = "config") {
  const base = join(homedir(), ".var", "app", flatpakId);
  if (root === "home") {
    return join(base, suffix);
  }
  return join(base, "config", suffix);
}

export function buildSnapUserDataDir(snapName, suffix, root = "common") {
  return join(homedir(), "snap", snapName, root, suffix);
}

/**
 * @param {import("./browsers.mjs").DetectedBrowser | { id: string, launchKind?: string, launchTarget?: string }} browser
 * @returns {string[]}
 */
export function buildProfileCandidates(browser) {
  const spec = getProfileSpec(browser.id);
  if (!spec) {
    return [];
  }

  const configHome = getConfigHome();
  /** @type {string[]} */
  const candidates = [];

  if (process.env.CHROME_USER_DATA_DIR) {
    candidates.push(process.env.CHROME_USER_DATA_DIR);
  }

  for (const relative of spec.nativeUserDataDirs ?? []) {
    candidates.push(join(configHome, relative));
  }

  for (const legacy of spec.legacyUserDataDirs ?? []) {
    candidates.push(expandHomePath(`~/${legacy}`));
  }

  for (const entry of spec.flatpakDirs ?? []) {
    candidates.push(buildFlatpakUserDataDir(entry.flatpakId, entry.suffix, entry.root ?? "config"));
  }

  for (const entry of spec.snapDirs ?? []) {
    candidates.push(buildSnapUserDataDir(entry.snapName, entry.suffix, entry.root ?? "common"));
  }

  if (browser.launchKind === "flatpak" && browser.launchTarget) {
    for (const relative of spec.nativeUserDataDirs ?? []) {
      candidates.unshift(buildFlatpakUserDataDir(browser.launchTarget, relative));
    }
  }

  if (browser.launchKind === "snap" && browser.launchTarget) {
    for (const relative of spec.nativeUserDataDirs ?? []) {
      candidates.unshift(buildSnapUserDataDir(browser.launchTarget, `.config/${relative}`, "current"));
      candidates.unshift(buildSnapUserDataDir(browser.launchTarget, relative, "common"));
    }
  }

  for (const parent of spec.siblingScanParents ?? []) {
    candidates.push(join(configHome, parent));
  }

  return uniquePaths(candidates);
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const path of paths) {
    const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
