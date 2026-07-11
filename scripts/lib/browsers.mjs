import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  formatProfileSummary,
  inspectBrowserProfile,
  resolveProfileDirForBrowser,
} from "./profile-paths.mjs";

/** @typedef {"chromium" | "firefox"} BrowserFamily */
/** @typedef {"binary" | "flatpak" | "snap"} BrowserLaunchKind */

/**
 * @typedef {object} BrowserDefinition
 * @property {string} id
 * @property {string} name
 * @property {BrowserFamily} family
 * @property {boolean} supportsAutomation
 * @property {string[]} binaries
 * @property {string[]} snaps
 * @property {string[]} flatpaks
 * @property {string[]} desktopIds
 * @property {string} personalProfileDir
 * @property {string} devProfileDir
 */

/** @typedef {BrowserDefinition & { launchKind: BrowserLaunchKind, launchTarget: string, binaryPath: string | null }} DetectedBrowser */

export const BROWSER_CATALOG = [
  {
    id: "google-chrome",
    name: "Google Chrome",
    family: "chromium",
    supportsAutomation: true,
    commandNames: ["google-chrome-stable", "google-chrome", "chrome"],
    binaries: ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/google-chrome"],
    snaps: [],
    flatpaks: ["com.google.Chrome"],
    desktopIds: ["google-chrome.desktop", "com.google.Chrome.desktop"],
    personalProfileDir: "~/.config/google-chrome",
    devProfileDir: "~/.mycontacts-chrome-dev",
  },
  {
    id: "chromium",
    name: "Chromium",
    family: "chromium",
    supportsAutomation: true,
    commandNames: ["chromium", "chromium-browser"],
    binaries: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
    snaps: ["chromium"],
    flatpaks: ["org.chromium.Chromium"],
    desktopIds: ["chromium-browser.desktop", "chromium.desktop", "org.chromium.Chromium.desktop"],
    personalProfileDir: "~/.config/chromium",
    devProfileDir: "~/.mycontacts-chromium-dev",
  },
  {
    id: "brave",
    name: "Brave",
    family: "chromium",
    supportsAutomation: true,
    commandNames: ["brave-browser", "brave"],
    binaries: ["/usr/bin/brave-browser", "/usr/bin/brave", "/snap/bin/brave"],
    snaps: ["brave"],
    flatpaks: ["com.brave.Browser"],
    desktopIds: ["brave-browser.desktop", "com.brave.Browser.desktop"],
    personalProfileDir: "~/.config/BraveSoftware/Brave-Browser",
    devProfileDir: "~/.mycontacts-brave-dev",
  },
  {
    id: "brave-origin",
    name: "Brave Origin",
    family: "chromium",
    supportsAutomation: true,
    commandNames: ["brave-origin"],
    binaries: ["/usr/bin/brave-origin"],
    snaps: [],
    flatpaks: [],
    desktopIds: ["brave-origin.desktop"],
    personalProfileDir: "~/.config/BraveSoftware/Brave-Origin",
    devProfileDir: "~/.mycontacts-brave-origin-dev",
  },
  {
    id: "microsoft-edge",
    name: "Microsoft Edge",
    family: "chromium",
    supportsAutomation: true,
    binaries: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
    snaps: [],
    flatpaks: ["com.microsoft.Edge"],
    desktopIds: ["microsoft-edge.desktop", "com.microsoft.Edge.desktop"],
    personalProfileDir: "~/.config/microsoft-edge",
    devProfileDir: "~/.mycontacts-edge-dev",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    family: "chromium",
    supportsAutomation: true,
    binaries: ["/usr/bin/vivaldi", "/usr/bin/vivaldi-stable"],
    snaps: [],
    flatpaks: ["com.vivaldi.Vivaldi"],
    desktopIds: ["vivaldi-stable.desktop", "com.vivaldi.Vivaldi.desktop"],
    personalProfileDir: "~/.config/vivaldi",
    devProfileDir: "~/.mycontacts-vivaldi-dev",
  },
  {
    id: "opera",
    name: "Opera",
    family: "chromium",
    supportsAutomation: true,
    binaries: ["/usr/bin/opera", "/usr/bin/opera-stable"],
    snaps: [],
    flatpaks: ["com.opera.Opera"],
    desktopIds: ["opera.desktop", "com.opera.Opera.desktop"],
    personalProfileDir: "~/.config/opera",
    devProfileDir: "~/.mycontacts-opera-dev",
  },
  {
    id: "firefox",
    name: "Firefox",
    family: "firefox",
    supportsAutomation: false,
    binaries: ["/usr/bin/firefox", "/snap/bin/firefox"],
    snaps: ["firefox"],
    flatpaks: ["org.mozilla.firefox"],
    desktopIds: ["firefox.desktop", "org.mozilla.firefox.desktop"],
    personalProfileDir: "~/.mozilla/firefox",
    devProfileDir: "~/.mycontacts-firefox-dev",
  },
  {
    id: "firefox-esr",
    name: "Firefox ESR",
    family: "firefox",
    supportsAutomation: false,
    binaries: ["/usr/bin/firefox-esr"],
    snaps: [],
    flatpaks: ["org.mozilla.firefox.BaseApp"],
    desktopIds: ["firefox-esr.desktop"],
    personalProfileDir: "~/.mozilla/firefox",
    devProfileDir: "~/.mycontacts-firefox-dev",
  },
  {
    id: "librewolf",
    name: "LibreWolf",
    family: "firefox",
    supportsAutomation: false,
    binaries: ["/usr/bin/librewolf"],
    snaps: [],
    flatpaks: ["io.gitlab.librewolf-community"],
    desktopIds: ["librewolf.desktop", "io.gitlab.librewolf-community.desktop"],
    personalProfileDir: "~/.librewolf",
    devProfileDir: "~/.mycontacts-librewolf-dev",
  },
  {
    id: "floorp",
    name: "Floorp",
    family: "firefox",
    supportsAutomation: false,
    binaries: ["/usr/bin/floorp"],
    snaps: [],
    flatpaks: [],
    desktopIds: ["floorp.desktop"],
    personalProfileDir: "~/.floorp",
    devProfileDir: "~/.mycontacts-floorp-dev",
  },
];

function expandHome(pathValue) {
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

function commandExists(command) {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function flatpakInstalled(appId) {
  if (!commandExists("flatpak")) {
    return false;
  }
  const result = spawnSync("flatpak", ["info", appId], { stdio: "ignore" });
  return result.status === 0;
}

function snapInstalled(snapName) {
  if (!commandExists("snap")) {
    return false;
  }
  const result = spawnSync("snap", ["list", snapName], { stdio: "ignore" });
  return result.status === 0;
}

function detectDefaultDesktopId() {
  if (commandExists("xdg-settings")) {
    const result = spawnSync("xdg-settings", ["get", "default-web-browser"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  if (commandExists("xdg-mime")) {
    const result = spawnSync("xdg-mime", ["query", "default", "x-scheme-handler/http"], {
      encoding: "utf8",
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  if (commandExists("gio")) {
    const result = spawnSync("gio", ["mime", "x-scheme-handler/http"], { encoding: "utf8" });
    const match = result.stdout.match(/Default application for .*?:\s*(\S+\.desktop)/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function resolveDesktopExec(desktopId) {
  const searchPaths = [
    join(homedir(), ".local/share/applications", desktopId),
    `/usr/share/applications/${desktopId}`,
    `/var/lib/flatpak/exports/share/applications/${desktopId}`,
    join(homedir(), ".local/share/flatpak/exports/share/applications", desktopId),
    `/snap/core/current/usr/share/applications/${desktopId}`,
  ];

  for (const desktopPath of searchPaths) {
    if (!existsSync(desktopPath)) {
      continue;
    }
    const content = readFileSync(desktopPath, "utf8");
    const execLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("Exec="));
    if (!execLine) {
      continue;
    }
    const exec = execLine
      .slice("Exec=".length)
      .replace(/%[fFuUdDnNickvm]/g, "")
      .trim()
      .split(/\s+/)[0];
    return exec ?? null;
  }

  return null;
}

function matchBrowserByDesktop(defaultDesktopId) {
  if (!defaultDesktopId) {
    return null;
  }
  return BROWSER_CATALOG.find((browser) => browser.desktopIds.includes(defaultDesktopId)) ?? null;
}

function matchBrowserByBinary(binaryPath) {
  if (!binaryPath) {
    return null;
  }
  const normalized = basename(binaryPath).toLowerCase();
  return (
    BROWSER_CATALOG.find((browser) => {
      const commandMatch = (browser.commandNames ?? []).some(
        (name) => name.toLowerCase() === normalized,
      );
      const binaryMatch = (browser.binaries ?? []).some(
        (candidate) => basename(candidate).toLowerCase() === normalized,
      );
      return commandMatch || binaryMatch;
    }) ?? null
  );
}

function resolveBinaryFromPath(commandNames) {
  for (const name of commandNames) {
    const result = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
    if (result.status !== 0) {
      continue;
    }
    const resolved = result.stdout.trim();
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

function resolveDesktopName(desktopId) {
  if (!desktopId) {
    return null;
  }

  const searchPaths = [
    join(homedir(), ".local/share/applications", desktopId),
    `/usr/share/applications/${desktopId}`,
    `/var/lib/flatpak/exports/share/applications/${desktopId}`,
    join(homedir(), ".local/share/flatpak/exports/share/applications", desktopId),
  ];

  for (const desktopPath of searchPaths) {
    if (!existsSync(desktopPath)) {
      continue;
    }
    const content = readFileSync(desktopPath, "utf8");
    const nameLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("Name=") && !line.startsWith("Name["));
    if (nameLine) {
      return nameLine.slice("Name=".length).trim();
    }
  }

  return desktopId.replace(/\.desktop$/, "");
}

function buildDetectedBrowser(definition, binaryPath) {
  return {
    ...definition,
    launchKind: "binary",
    launchTarget: binaryPath,
    binaryPath,
  };
}

function detectInstalledBrowser(definition) {
  for (const binary of definition.binaries ?? []) {
    if (existsSync(binary)) {
      return buildDetectedBrowser(definition, binary);
    }
  }

  for (const commandName of definition.commandNames ?? []) {
    const resolved = resolveBinaryFromPath([commandName]);
    if (resolved) {
      return buildDetectedBrowser(definition, resolved);
    }
  }

  for (const flatpak of definition.flatpaks ?? []) {
    if (flatpakInstalled(flatpak)) {
      return {
        ...definition,
        launchKind: "flatpak",
        launchTarget: flatpak,
        binaryPath: null,
      };
    }
  }

  for (const snap of definition.snaps) {
    if (snapInstalled(snap)) {
      const snapBinary = `/snap/bin/${snap}`;
      return {
        ...definition,
        launchKind: "snap",
        launchTarget: snap,
        binaryPath: existsSync(snapBinary) ? snapBinary : null,
      };
    }
  }

  return null;
}

function discoverBrowserFromExec(desktopId, desktopExec) {
  if (!desktopExec || !existsSync(desktopExec)) {
    return null;
  }

  const catalogMatch = matchBrowserByDesktop(desktopId) ?? matchBrowserByBinary(desktopExec);
  if (catalogMatch) {
    return buildDetectedBrowser(catalogMatch, desktopExec);
  }

  const name = resolveDesktopName(desktopId) ?? basename(desktopExec);
  const lower = `${name} ${basename(desktopExec)}`.toLowerCase();
  const family = /firefox|librewolf|floorp|waterfox|zen/.test(lower) ? "firefox" : "chromium";

  return {
    id: basename(desktopExec).toLowerCase().replace(/[^a-z0-9.-]+/g, "-"),
    name,
    family,
    supportsAutomation: family === "chromium",
    commandNames: [basename(desktopExec)],
    binaries: [desktopExec],
    snaps: [],
    flatpaks: [],
    desktopIds: desktopId ? [desktopId] : [],
    personalProfileDir: family === "chromium" ? "~/.config/chromium" : "~/.mozilla/firefox",
    devProfileDir: `~/.mycontacts-${basename(desktopExec).toLowerCase()}-dev`,
    launchKind: "binary",
    launchTarget: desktopExec,
    binaryPath: desktopExec,
  };
}

export function discoverBrowsers() {
  /** @type {DetectedBrowser[]} */
  const found = [];
  const seen = new Set();

  function addBrowser(browser) {
    const key = browser.binaryPath ?? `${browser.launchKind}:${browser.launchTarget}`;
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    found.push(browser);
  }

  for (const definition of BROWSER_CATALOG) {
    const detected = detectInstalledBrowser(definition);
    if (detected) {
      addBrowser(detected);
    }
  }

  const desktopId = detectDefaultDesktopId();
  const desktopExec = desktopId ? resolveDesktopExec(desktopId) : null;
  const defaultFromExec = discoverBrowserFromExec(desktopId, desktopExec);
  if (defaultFromExec) {
    addBrowser(defaultFromExec);
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function detectDefaultBrowser(installedBrowsers) {
  const desktopId = detectDefaultDesktopId();
  const desktopExec = desktopId ? resolveDesktopExec(desktopId) : null;
  const desktopName = resolveDesktopName(desktopId);
  const defaultDefinition = matchBrowserByDesktop(desktopId) ?? matchBrowserByBinary(desktopExec);

  let defaultBrowser =
    defaultDefinition != null
      ? installedBrowsers.find((browser) => browser.id === defaultDefinition.id)
      : null;

  if (!defaultBrowser) {
    defaultBrowser =
      installedBrowsers.find(
        (browser) =>
          browser.binaryPath === desktopExec ||
          (defaultDefinition && browser.id === defaultDefinition.id),
      ) ?? discoverBrowserFromExec(desktopId, desktopExec);
  }

  return {
    browser: defaultBrowser ?? null,
    defaultDefinition,
    defaultBrowserInstalled: Boolean(defaultBrowser),
    desktopId,
    desktopExec,
    desktopName,
  };
}

export function resolveProfileDir(browser, profileMode) {
  const raw =
    profileMode === "personal"
      ? browser.personalProfileDir
      : browser.devProfileDir ?? browser.personalProfileDir;
  return expandHome(raw);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProcessAlive(pid) {
  return spawnSync("kill", ["-0", String(pid)], { stdio: "ignore" }).status === 0;
}

export function parseChromiumSingletonLockPid(userDataDir) {
  const lockPath = join(userDataDir, "SingletonLock");

  try {
    const target = readlinkSync(lockPath);
    const delimiter = target.lastIndexOf("-");
    if (delimiter === -1) {
      return null;
    }

    const pid = Number.parseInt(target.slice(delimiter + 1), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function findChromiumProfilePids(userDataDir) {
  /** @type {Set<number>} */
  const pids = new Set();

  const lockPid = parseChromiumSingletonLockPid(userDataDir);
  if (lockPid && isProcessAlive(lockPid)) {
    pids.add(lockPid);
  }

  const escapedProfileDir = escapeRegex(userDataDir);
  const byProfileArg = spawnSync("pgrep", ["-f", `--user-data-dir=${escapedProfileDir}`], {
    encoding: "utf8",
  });
  if (byProfileArg.status === 0) {
    for (const line of byProfileArg.stdout.trim().split("\n")) {
      const pid = Number.parseInt(line, 10);
      if (Number.isFinite(pid) && pid > 0) {
        pids.add(pid);
      }
    }
  }

  return [...pids];
}

export function isChromiumProfileRunning(userDataDir) {
  return findChromiumProfilePids(userDataDir).length > 0;
}

function signalChromiumProfile(userDataDir, signal) {
  for (const pid of findChromiumProfilePids(userDataDir)) {
    spawnSync("kill", [`-${signal}`, String(pid)], { stdio: "ignore" });
  }

  const escapedProfileDir = escapeRegex(userDataDir);
  spawnSync("pkill", [`-${signal}`, "-f", `--user-data-dir=${escapedProfileDir}`], {
    stdio: "ignore",
  });
}

export function stopChromiumProfile(userDataDir, { timeoutMs = 8000 } = {}) {
  if (!isChromiumProfileRunning(userDataDir)) {
    return;
  }

  signalChromiumProfile(userDataDir, "TERM");

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isChromiumProfileRunning(userDataDir)) {
      return;
    }
    spawnSync("sleep", ["0.25"]);
  }

  signalChromiumProfile(userDataDir, "KILL");
}

export function isBrowserRunning(browser, userDataDir = null) {
  if (browser.family === "chromium" && userDataDir) {
    return isChromiumProfileRunning(userDataDir);
  }

  const processName = browser.binaryPath
    ? basename(browser.binaryPath)
    : basename(browser.launchTarget);

  if (!processName) {
    return false;
  }

  return spawnSync("pgrep", ["-x", processName], { stdio: "ignore" }).status === 0;
}

export function stopBrowser(browser, { userDataDir = null, timeoutMs = 8000 } = {}) {
  if (browser.family === "chromium" && userDataDir) {
    stopChromiumProfile(userDataDir, { timeoutMs });
    return;
  }

  const processName = browser.binaryPath
    ? basename(browser.binaryPath)
    : basename(browser.launchTarget);

  if (!processName || !isBrowserRunning(browser, userDataDir)) {
    return;
  }

  spawnSync("pkill", ["-TERM", "-x", processName], { stdio: "ignore" });

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isBrowserRunning(browser, userDataDir)) {
      return;
    }
    spawnSync("sleep", ["0.25"]);
  }

  spawnSync("pkill", ["-9", "-x", processName], { stdio: "ignore" });
}

export function getFirefoxDefaultProfile(browser) {
  const inspection = inspectBrowserProfile(browser, "personal");
  return inspection.profilePath ?? null;
}

export function formatBrowserLabel(browser, profileMode) {
  const familyLabel = browser.family === "chromium" ? "Chromium-based" : "Firefox-based";
  const automationLabel = browser.supportsAutomation
    ? "automated install supported"
    : "manual install required";
  const profileDir = resolveProfileDirForBrowser(browser, profileMode);
  return `${browser.name} (${familyLabel}, ${automationLabel}) — profile: ${profileDir}`;
}

export function listProfileContents(browser) {
  return formatProfileSummary(inspectBrowserProfile(browser, "personal"));
}
