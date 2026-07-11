import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  buildProfileCandidates,
  buildFlatpakUserDataDir,
  buildSnapUserDataDir,
  expandHomePath,
  getConfigHome,
  getProfileSpec,
} from "./browser-profile-catalog.mjs";

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

function listChromiumProfileDirectories(userDataDir) {
  if (!existsSync(userDataDir)) {
    return ["Default"];
  }

  try {
    const localStatePath = join(userDataDir, "Local State");
    if (existsSync(localStatePath)) {
      const localState = JSON.parse(readFileSync(localStatePath, "utf8"));
      const active = localState.profile?.last_active_profiles;
      if (Array.isArray(active) && active.length) {
        return active.filter((name) => typeof name === "string");
      }
    }
  } catch {
    // fall through
  }

  const discovered = readdirSync(userDataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(userDataDir, name, "Preferences")));

  return discovered.length ? discovered : ["Default"];
}

function countChromiumExtensions(userDataDir, profileDirectory = "Default") {
  const extensionsDir = join(userDataDir, profileDirectory, "Extensions");
  if (!existsSync(extensionsDir)) {
    return 0;
  }

  try {
    return readdirSync(extensionsDir).filter((entry) => !entry.startsWith(".")).length;
  } catch {
    return 0;
  }
}

export function scoreChromiumUserDataDir(userDataDir, browser) {
  let bestScore = -1;
  let bestProfileDirectory = "Default";

  const profileDirectories = listChromiumProfileDirectories(userDataDir);
  for (const profileDirectory of profileDirectories) {
    const preferencesPath = join(userDataDir, profileDirectory, "Preferences");
    if (!existsSync(preferencesPath)) {
      continue;
    }

    let score = 1;
    const extensions = countChromiumExtensions(userDataDir, profileDirectory);
    score += extensions * 10;

    const catalogCandidates = buildProfileCandidates(browser);
    if (catalogCandidates.includes(userDataDir.replace(/\/+$/, ""))) {
      score += 15;
    }

    if (browser.binaryPath) {
      const binaryToken = basename(browser.binaryPath).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (userDataDir.toLowerCase().includes(binaryToken)) {
        score += 25;
      }
    }

    try {
      const localStatePath = join(userDataDir, "Local State");
      if (existsSync(localStatePath)) {
        score += 5;
        const ageDays = (Date.now() - statSync(localStatePath).mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays > 1) {
          score += 20;
        }
      }

      const preferences = JSON.parse(readFileSync(preferencesPath, "utf8"));
      if (preferences.profile?.name && preferences.profile.name !== "Default") {
        score += 2;
      }
    } catch {
      // keep score
    }

    if (score > bestScore) {
      bestScore = score;
      bestProfileDirectory = profileDirectory;
    }
  }

  return { score: bestScore, profileDirectory: bestProfileDirectory };
}

function expandSiblingCandidates(browser, candidates) {
  const spec = getProfileSpec(browser.id);
  if (!spec?.siblingScanParents?.length) {
    return candidates;
  }

  const expanded = [...candidates];
  const configHome = getConfigHome();

  for (const parentRelative of spec.siblingScanParents) {
    const parent = join(configHome, parentRelative);
    if (!existsSync(parent)) {
      continue;
    }

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      expanded.push(join(parent, entry.name));
    }
  }

  return uniquePaths(expanded);
}

export function resolveChromiumPersonalProfile(browser) {
  const candidates = expandSiblingCandidates(browser, buildProfileCandidates(browser));
  let bestPath = expandHomePath(browser.personalProfileDir);
  let bestScore = -1;
  let bestProfileDirectory = "Default";

  for (const candidate of candidates) {
    const { score, profileDirectory } = scoreChromiumUserDataDir(candidate, browser);
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidate;
      bestProfileDirectory = profileDirectory;
    }
  }

  return {
    userDataDir: bestPath,
    profileDirectory: bestProfileDirectory,
    score: bestScore,
  };
}

export function inspectChromiumProfile(userDataDir, profileDirectory = "Default") {
  const preferencesPath = join(userDataDir, profileDirectory, "Preferences");
  const exists = existsSync(preferencesPath);
  const extensions = countChromiumExtensions(userDataDir, profileDirectory);

  let profileName = profileDirectory;
  if (exists) {
    try {
      const preferences = JSON.parse(readFileSync(preferencesPath, "utf8"));
      profileName = preferences.profile?.name ?? profileDirectory;
    } catch {
      profileName = profileDirectory;
    }
  }

  return {
    userDataDir,
    profileDirectory,
    exists,
    extensions,
    profileName,
    looksFresh: exists && extensions === 0,
  };
}

function parseFirefoxProfilesIni(baseDir) {
  const profilesIni = join(baseDir, "profiles.ini");
  if (!existsSync(profilesIni)) {
    return [];
  }

  const content = readFileSync(profilesIni, "utf8");
  const sections = content.split(/^\[/m).slice(1);
  /** @type {{ path: string, name?: string, isDefault: boolean }[]} */
  const profiles = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const values = Object.fromEntries(
      lines
        .map((line) => line.trim())
        .filter((line) => line.includes("="))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=")];
        }),
    );

    if (!values.Path) {
      continue;
    }

    const profilePath =
      values.IsRelative === "1" ? join(baseDir, values.Path) : values.Path;

    profiles.push({
      path: profilePath,
      name: values.Name,
      isDefault: values.Default === "1",
    });
  }

  return profiles;
}

function countFirefoxExtensions(profilePath) {
  const extensionsDir = join(profilePath, "extensions");
  if (!existsSync(extensionsDir)) {
    return 0;
  }

  try {
    return readdirSync(extensionsDir).filter((entry) => !entry.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function buildFirefoxProfileRoots(browser) {
  const spec = getProfileSpec(browser.id);
  if (!spec) {
    return [expandHomePath(browser.personalProfileDir)];
  }

  const configHome = getConfigHome();
  /** @type {string[]} */
  const roots = [];

  for (const root of spec.firefoxProfileRoots ?? []) {
    roots.push(join(configHome, root));
  }

  for (const legacy of spec.legacyUserDataDirs ?? []) {
    roots.push(expandHomePath(`~/${legacy}`));
  }

  for (const entry of spec.flatpakDirs ?? []) {
    roots.push(buildFlatpakUserDataDir(entry.flatpakId, entry.suffix, entry.root ?? "config"));
  }

  for (const entry of spec.snapDirs ?? []) {
    roots.push(buildSnapUserDataDir(entry.snapName, entry.suffix, entry.root ?? "common"));
  }

  if (browser.launchKind === "flatpak" && browser.launchTarget) {
    for (const root of spec.firefoxProfileRoots ?? []) {
      roots.unshift(buildFlatpakUserDataDir(browser.launchTarget, root));
    }
    roots.unshift(buildFlatpakUserDataDir(browser.launchTarget, ".mozilla/firefox", "home"));
  }

  return uniquePaths(roots);
}

export function resolveFirefoxPersonalProfile(browser) {
  const roots = buildFirefoxProfileRoots(browser);
  let bestRoot = expandHomePath(browser.personalProfileDir);
  let bestProfilePath = null;
  let bestScore = -1;

  for (const root of roots) {
    const profiles = parseFirefoxProfilesIni(root);
    if (!profiles.length) {
      continue;
    }

    for (const profile of profiles) {
      let score = profile.isDefault ? 20 : 5;
      score += countFirefoxExtensions(profile.path) * 10;
      if (existsSync(join(profile.path, "prefs.js"))) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
        bestProfilePath = profile.path;
      }
    }
  }

  return {
    profileRoot: bestRoot,
    profilePath: bestProfilePath,
    score: bestScore,
  };
}

export function inspectFirefoxProfile(browser) {
  const resolved = resolveFirefoxPersonalProfile(browser);
  if (!resolved.profilePath) {
    return {
      profileRoot: resolved.profileRoot,
      profilePath: null,
      exists: false,
      extensions: 0,
      profileName: "unknown",
      looksFresh: true,
    };
  }

  const extensions = countFirefoxExtensions(resolved.profilePath);
  return {
    profileRoot: resolved.profileRoot,
    profilePath: resolved.profilePath,
    exists: true,
    extensions,
    profileName: basename(resolved.profilePath),
    looksFresh: extensions === 0,
  };
}

export function resolveProfileDirForBrowser(browser, profileMode) {
  if (profileMode === "dev") {
    return expandHomePath(browser.devProfileDir ?? browser.personalProfileDir);
  }

  if (browser.family === "chromium") {
    return resolveChromiumPersonalProfile(browser).userDataDir;
  }

  const firefox = resolveFirefoxPersonalProfile(browser);
  return firefox.profilePath ?? firefox.profileRoot;
}

export function resolveProfileLaunchOptions(browser, profileMode) {
  if (profileMode === "dev") {
    return {
      userDataDir: expandHomePath(browser.devProfileDir ?? browser.personalProfileDir),
      profileDirectory: "Default",
    };
  }

  if (browser.family === "chromium") {
    const resolved = resolveChromiumPersonalProfile(browser);
    return {
      userDataDir: resolved.userDataDir,
      profileDirectory: resolved.profileDirectory,
    };
  }

  const firefox = resolveFirefoxPersonalProfile(browser);
  return {
    userDataDir: firefox.profileRoot,
    profileDirectory: firefox.profilePath ? basename(firefox.profilePath) : "Default",
    firefoxProfilePath: firefox.profilePath,
  };
}

export function inspectBrowserProfile(browser, profileMode = "personal") {
  if (profileMode === "dev") {
    if (browser.family === "chromium") {
      return inspectChromiumProfile(expandHomePath(browser.devProfileDir ?? browser.personalProfileDir));
    }
    return inspectFirefoxProfile(browser);
  }

  if (browser.family === "chromium") {
    const resolved = resolveChromiumPersonalProfile(browser);
    return inspectChromiumProfile(resolved.userDataDir, resolved.profileDirectory);
  }

  return inspectFirefoxProfile(browser);
}

export function formatProfileSummary(inspection) {
  if (inspection.userDataDir) {
    if (!inspection.exists) {
      return `profile not found at ${inspection.userDataDir} (will be created on first launch)`;
    }

    const parts = [
      `profile "${inspection.profileName}" (${inspection.profileDirectory ?? "Default"})`,
      `${inspection.extensions} extension(s)`,
      `path: ${inspection.userDataDir}`,
    ];
    if (inspection.looksFresh) {
      parts.push("looks like a fresh/empty profile");
    }
    return parts.join(", ");
  }

  if (!inspection.exists) {
    return `profile not found under ${inspection.profileRoot ?? "unknown"} (will be created on first launch)`;
  }

  const parts = [
    `profile "${inspection.profileName}"`,
    `${inspection.extensions} extension(s)`,
    `path: ${inspection.profilePath ?? inspection.profileRoot}`,
  ];
  if (inspection.looksFresh) {
    parts.push("looks like a fresh/empty profile");
  }
  return parts.join(", ");
}
