import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectChromiumProfile,
  resolveChromiumPersonalProfile,
  resolveProfileLaunchOptions,
  scoreChromiumUserDataDir,
} from "./profile-paths.mjs";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPTS_DIR, "../..");
export const DIST_DIR = join(REPO_ROOT, "dist");
export const CONFIG_PATH = join(REPO_ROOT, ".mycontacts-dev.json");

export const DEFAULT_CONFIG = {
  browserId: null,
  profileMode: "personal",
  debugPort: 9222,
  userDataDir: null,
  profileDirectory: "Default",
  firefoxProfilePath: null,
  extensionId: null,
  enableInIncognito: true,
  gitRemote: "origin",
  gitBranch: null,
  launchUrl: "about:blank",
};

export function expandHome(pathValue) {
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      userDataDir: parsed.userDataDir ? expandHome(parsed.userDataDir) : null,
      firefoxProfilePath: parsed.firefoxProfilePath ? expandHome(parsed.firefoxProfilePath) : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function scoreChromiumPath(userDataDir, browser) {
  return scoreChromiumUserDataDir(userDataDir, browser);
}

export function applyBrowserToConfig(config, browser, profileMode) {
  const resolved = resolveProfileLaunchOptions(browser, profileMode);
  let { userDataDir, profileDirectory, firefoxProfilePath } = resolved;

  if (profileMode === "personal" && browser.family === "chromium" && config.userDataDir) {
    const savedPath = config.userDataDir;
    const auto = resolveChromiumPersonalProfile(browser);
    const saved = scoreChromiumPath(savedPath, browser);
    const savedInspection = inspectChromiumProfile(savedPath, saved.profileDirectory);

    const savedLooksWrong =
      !savedInspection.exists ||
      (savedInspection.looksFresh && auto.score > saved.score + 5);

    if (!savedLooksWrong && saved.score >= auto.score) {
      userDataDir = savedPath;
      profileDirectory = saved.profileDirectory;
    } else if (auto.score > saved.score) {
      userDataDir = auto.userDataDir;
      profileDirectory = auto.profileDirectory;
    }
  }

  return {
    ...config,
    browserId: browser.id,
    profileMode,
    userDataDir,
    profileDirectory,
    firefoxProfilePath: firefoxProfilePath ?? null,
  };
}

export function findBrowserById(browserId, installedBrowsers) {
  return installedBrowsers.find((browser) => browser.id === browserId) ?? null;
}

export function findBrowserFromConfig(config, installedBrowsers) {
  if (config.browserId) {
    const saved = findBrowserById(config.browserId, installedBrowsers);
    if (saved) {
      return saved;
    }
  }

  if (process.env.CHROME_PATH || process.env.BROWSER_PATH) {
    const override = process.env.BROWSER_PATH ?? process.env.CHROME_PATH;
    const match = installedBrowsers.find(
      (browser) => browser.binaryPath === override || browser.launchTarget === override,
    );
    if (match) {
      return match;
    }
  }

  return null;
}

export function parseProfileMode(value) {
  if (value === "personal" || value === "dev") {
    return value;
  }
  return null;
}
