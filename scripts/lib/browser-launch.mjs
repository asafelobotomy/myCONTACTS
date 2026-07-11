import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function seedDeveloperProfile(userDataDir, { personal = false, profileDirectory = "Default" } = {}) {
  if (userDataDir.includes(".mozilla") || userDataDir.includes(".librewolf") || userDataDir.includes(".floorp")) {
    return;
  }

  const defaultDir = join(userDataDir, profileDirectory);
  const preferencesPath = join(defaultDir, "Preferences");

  if (personal && !existsSync(preferencesPath)) {
    return;
  }

  if (!personal) {
    mkdirSync(defaultDir, { recursive: true });
  }

  let preferences = {};
  if (existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(readFileSync(preferencesPath, "utf8"));
    } catch {
      preferences = {};
    }
  } else if (personal) {
    return;
  }

  preferences.extensions ??= {};
  preferences.extensions.ui ??= {};
  if (!preferences.extensions.ui.developer_mode) {
    preferences.extensions.ui.developer_mode = true;
  }

  writeFileSync(preferencesPath, `${JSON.stringify(preferences)}\n`, "utf8");
}

function buildLaunchArgs(config, options = {}) {
  const args = [
    `--user-data-dir=${config.userDataDir}`,
    `--remote-debugging-port=${config.debugPort}`,
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    config.launchUrl,
  ];

  if (config.profileDirectory && config.profileDirectory !== "Default") {
    args.splice(1, 0, `--profile-directory=${config.profileDirectory}`);
  }

  if (options.newWindow) {
    args.unshift("--new-window");
  }

  if (config.profileMode === "dev") {
    args.push("--disable-sync");
  }

  return args;
}

function spawnBrowser(browser, args, options = {}) {
  switch (browser.launchKind) {
    case "flatpak":
      return spawn("flatpak", ["run", browser.launchTarget, ...args], {
        detached: !options.foreground,
        stdio: options.foreground ? "inherit" : "ignore",
      });
    case "snap":
      return spawn("snap", ["run", browser.launchTarget, ...args], {
        detached: !options.foreground,
        stdio: options.foreground ? "inherit" : "ignore",
      });
    default:
      return spawn(browser.launchTarget, args, {
        detached: !options.foreground,
        stdio: options.foreground ? "inherit" : "ignore",
      });
  }
}

export function launchChromiumBrowser(browser, config, options = {}) {
  seedDeveloperProfile(config.userDataDir, {
    personal: config.profileMode === "personal",
    profileDirectory: config.profileDirectory ?? "Default",
  });
  const args = buildLaunchArgs(config, options);
  const child = spawnBrowser(browser, args, options);
  if (!options.foreground) {
    child.unref();
  }
  return child;
}

export function launchFirefoxBrowser(browser, config, options = {}) {
  const args = [config.launchUrl];
  if (config.firefoxProfilePath) {
    args.unshift("-profile", config.firefoxProfilePath);
  }
  if (options.newWindow) {
    args.unshift("-new-window");
  }

  const child = spawnBrowser(browser, args, options);
  if (!options.foreground) {
    child.unref();
  }
  return child;
}

export async function waitForDebugPort(port, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return true;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function formatLaunchCommand(browser, config) {
  const args = buildLaunchArgs(config).map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg));
  switch (browser.launchKind) {
    case "flatpak":
      return `flatpak run ${browser.launchTarget} ${args.join(" ")}`;
    case "snap":
      return `snap run ${browser.launchTarget} ${args.join(" ")}`;
    default:
      return `${browser.launchTarget} ${args.join(" ")}`;
  }
}
