#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectDefaultBrowser,
  discoverBrowsers,
  isBrowserRunning,
  listProfileContents,
  stopBrowser,
} from "./lib/browsers.mjs";
import {
  formatProfileSummary,
  inspectBrowserProfile,
  resolveProfileDirForBrowser,
} from "./lib/profile-paths.mjs";
import {
  formatLaunchCommand,
  launchChromiumBrowser,
  launchFirefoxBrowser,
  waitForDebugPort,
} from "./lib/browser-launch.mjs";
import {
  findExtensionByPath,
  getInstalledExtensions,
  isDebugPortOpen,
  loadUnpackedExtension,
  reloadExtensionServiceWorker,
  uninstallExtension,
} from "./lib/cdp.mjs";
import {
  applyBrowserToConfig,
  DIST_DIR,
  findBrowserById,
  findBrowserFromConfig,
  hasSavedInstallConfig,
  loadConfig,
  parseProfileMode,
  REPO_ROOT,
  saveConfig,
} from "./lib/config.mjs";
import {
  chooseFromList,
  confirm,
  confirmSelection,
  isInteractive,
} from "./lib/prompt.mjs";

const HELP = `mycontacts-dev — build, install, and reload the myCONTACTS extension

Usage:
  node scripts/mycontacts-dev.mjs <command> [options]

Commands:
  update     Pull (optional), install deps, build, and install/reload extension (default)
  build      Install deps and build dist/
  reload     Install/reload the extension in the selected browser
  launch     Start the selected browser with CDP enabled (Chromium-based only)
  status     Show repo, browser, profile, and extension status
  help       Show this help

Browser support:
  Chromium-based (automated load/reload via CDP):
    Google Chrome, Chromium, Brave, Edge, Vivaldi, Opera
  Firefox-based (manual temporary install — this extension targets Chrome MV3):
    Firefox, Firefox ESR, LibreWolf, Floorp

Options:
  --browser=<id>       Browser id (e.g. google-chrome, chromium, firefox)
  --profile=personal   Install into your daily browser profile
  --profile=dev        Install into an isolated development profile
  --launch             Launch browser if debug port is not already open
  --restart-browser    Restart a running personal-profile browser without prompting (non-interactive)
  --no-pull            Skip git pull
  --no-install         Skip npm install/ci
  --no-build           Skip npm run build
  --no-reload          Build only; do not touch the browser
  --dry-run            Print actions without executing them
  --yes, -y            Non-interactive mode (use saved/default settings)
  --setup              Re-run browser/profile setup (ignore saved config)

Environment:
  BROWSER_PATH         Override browser binary path
  CHROME_PATH          Alias for BROWSER_PATH

Examples:
  node scripts/mycontacts-dev.mjs update
  node scripts/mycontacts-dev.mjs update --profile=personal --launch
  node scripts/mycontacts-dev.mjs update --browser=brave --profile=dev --yes
  node scripts/mycontacts-dev.mjs update --setup
  BROWSER_PATH=/usr/bin/chromium node scripts/mycontacts-dev.mjs status

Config:
  .mycontacts-dev.json — saved browser/profile/debug settings
  After the first interactive setup, update/reload reuse this file and skip the questionnaire.
`;

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "update";
  const flags = new Set();
  const options = {};

  for (const arg of args) {
    if (arg.startsWith("--browser=")) {
      options.browserId = arg.slice("--browser=".length);
      continue;
    }
    if (arg.startsWith("--profile=")) {
      options.profileMode = parseProfileMode(arg.slice("--profile=".length));
      continue;
    }
    if (arg.startsWith("--")) {
      flags.add(arg);
      continue;
    }
  }

  return { command, flags, options };
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function info(message) {
  process.stdout.write(`\n${message}\n`);
}

function warn(message) {
  process.stderr.write(`Warning: ${message}\n`);
}

function fail(message, example) {
  process.stderr.write(`\nError: ${message}\n`);
  if (example) {
    process.stderr.write(`  ${example}\n`);
  }
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  if (options.dryRun) {
    log(`[dry-run] ${command} ${commandArgs.join(" ")}`);
    return { status: 0 };
  }

  log(`→ ${command} ${commandArgs.join(" ")}`);
  return spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
}

function isGitRepo() {
  return existsSync(resolve(REPO_ROOT, ".git"));
}

function gitPull(config, dryRun, flags) {
  if (!isGitRepo()) {
    warn("Not a git repository — skipping git pull.");
    return;
  }

  const branch = config.gitBranch ?? getCurrentBranch();
  info(`Git pull from ${config.gitRemote}${branch ? ` (${branch})` : ""}`);
  const pullArgs = ["pull", config.gitRemote];
  if (branch) {
    pullArgs.push(branch);
  }

  const result = run("git", pullArgs, { dryRun });
  if (result.status !== 0) {
    fail("git pull failed.", "node scripts/mycontacts-dev.mjs update --no-pull");
  }
}

function getCurrentBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function installDependencies(dryRun) {
  const installArgs = existsSync(resolve(REPO_ROOT, "package-lock.json"))
    ? ["ci"]
    : ["install"];
  const result = run("npm", installArgs, { dryRun });
  if (result.status !== 0) {
    fail("npm install failed.");
  }
}

function buildExtension(dryRun) {
  const result = run("npm", ["run", "build"], { dryRun });
  if (result.status !== 0) {
    fail("npm run build failed.");
  }
}

function shouldRunSetupQuestionnaire(config, flags, cliOptions, prompt) {
  if (!prompt) {
    return false;
  }

  if (flags.has("--setup") || flags.has("--reconfigure")) {
    return true;
  }

  if (cliOptions.browserId || cliOptions.profileMode) {
    return false;
  }

  return !hasSavedInstallConfig(config);
}

async function resolveRuntimeSettings(config, flags, cliOptions, { prompt = isInteractive(flags) } = {}) {
  const installedBrowsers = discoverBrowsers();
  if (!installedBrowsers.length) {
    fail(
      "No supported browsers were found on this system.",
      "Install Google Chrome, Chromium, Firefox, or Brave, then re-run this script.",
    );
  }

  const {
    browser: defaultBrowser,
    desktopId,
    desktopExec,
    desktopName,
    defaultDefinition,
  } = detectDefaultBrowser(installedBrowsers);
  let browser = null;

  if (cliOptions.browserId) {
    browser = findBrowserById(cliOptions.browserId, installedBrowsers);
    if (!browser) {
      fail(
        `Browser '${cliOptions.browserId}' was not found.`,
        `Available: ${installedBrowsers.map((entry) => entry.id).join(", ")}`,
      );
    }
  } else {
    browser = findBrowserFromConfig(config, installedBrowsers) ?? defaultBrowser;
  }

  let profileMode = cliOptions.profileMode ?? config.profileMode ?? "personal";
  const runSetupQuestionnaire = shouldRunSetupQuestionnaire(config, flags, cliOptions, prompt);

  if (runSetupQuestionnaire) {
    info("Browser detection");
    if (desktopId) {
      log(
        `System default browser: ${desktopName ?? desktopId}${desktopExec ? ` (${desktopExec})` : ""}`,
      );
      if (defaultDefinition && defaultBrowser?.id !== defaultDefinition.id) {
        warn(
          `Expected ${defaultDefinition.name} as default, but matched ${defaultBrowser?.name ?? "nothing"}.`,
        );
      }
    } else {
      log("System default browser: could not be detected automatically");
    }
    log(`Supported browsers found: ${installedBrowsers.length}`);

    const defaultIndex = Math.max(
      0,
      installedBrowsers.findIndex((entry) => entry.id === defaultBrowser?.id),
    );

    browser = (
      await chooseFromList(
        "Which browser should myCONTACTS use?",
        installedBrowsers.map((entry) => ({
          value: entry,
          label: `${entry.name} (${entry.family}-based${
            entry.id === defaultBrowser?.id ? ", system default" : ""
          })`,
          detail: [
            entry.binaryPath ? `Binary: ${entry.binaryPath}` : `Launch: ${entry.launchTarget}`,
            entry.supportsAutomation
              ? "Automated install supported"
              : "Manual temporary add-on required (Chrome MV3 extension)",
          ].join(" — "),
        })),
        defaultIndex,
      )
    ).value;

    const profileChoice = await chooseFromList(
      "Which profile should the extension use?",
      [
        {
          value: "personal",
          label: "Personal profile (recommended)",
          detail: `Uses ${resolveProfileDirForBrowser(browser, "personal")} — extension stays in your daily browser`,
        },
        {
          value: "dev",
          label: "Isolated development profile",
          detail: `Uses ${resolveProfileDirForBrowser(browser, "dev")} — separate from daily browsing`,
        },
      ],
      profileMode === "dev" ? 1 : 0,
    );
    profileMode = profileChoice.value;
  } else {
    if (!browser) {
      if (hasSavedInstallConfig(config)) {
        fail(
          `Saved browser '${config.browserId}' is not installed.`,
          "node scripts/mycontacts-dev.mjs update --setup",
        );
      }
      browser = defaultBrowser ?? installedBrowsers[0];
    }

    if (hasSavedInstallConfig(config)) {
      log(`Using saved install settings (${config.browserId}, ${profileMode} profile).`);
    }
  }

  const runtime = applyBrowserToConfig(config, browser, profileMode);
  const profileInspection =
    profileMode === "personal" ? inspectBrowserProfile(browser, profileMode) : null;

  if (runSetupQuestionnaire) {
    const accepted = await confirmSelection("Review install settings", [
      `Browser: ${browser.name} (${browser.family}-based)`,
      `Profile: ${profileMode} (${runtime.userDataDir})`,
      profileInspection
        ? `Profile status: ${formatProfileSummary(profileInspection)}`
        : `Profile status: ${listProfileContents(browser)}`,
      browser.supportsAutomation
        ? "Install method: automated via Chrome DevTools Protocol"
        : "Install method: manual temporary add-on (Firefox)",
      browser.family === "firefox"
        ? "Note: myCONTACTS is a Chrome MV3 extension; Firefox support is best-effort and temporary"
        : profileMode === "personal"
          ? "Personal profile installs persist across browser restarts"
          : "Dev profile keeps testing isolated from your daily browser",
    ]);
    if (!accepted) {
      fail("Cancelled by user.");
    }

    if (profileInspection?.looksFresh && profileMode === "personal") {
      const continueAnyway = await confirm(
        "This profile looks empty (0 extensions). Continue anyway?",
        false,
      );
      if (!continueAnyway) {
        fail(
          "Cancelled. If this is the wrong profile path, delete .mycontacts-dev.json and run again.",
        );
      }
    }
  }

  saveConfig(runtime);
  return { runtime, browser, profileMode };
}

function extensionsPageUrl(browser) {
  switch (browser.id) {
    case "brave":
    case "brave-origin":
      return "brave://extensions";
    case "microsoft-edge":
      return "edge://extensions";
    case "vivaldi":
      return "vivaldi://extensions";
    case "opera":
      return "opera://extensions";
    default:
      return "chrome://extensions";
  }
}

function printManualExtensionSteps(browser, runtime, { installing = false } = {}) {
  const extensionsUrl = extensionsPageUrl(browser);
  const distPath = resolve(DIST_DIR);

  info("Manual extension steps");
  log(
    `${browser.name} is running without remote debugging — keeping it open instead of forcing a restart.`,
  );
  log("");

  if (installing) {
    log("To install myCONTACTS:");
    log(`  1. Open ${extensionsUrl}`);
    log("  2. Enable Developer mode");
    log(`  3. Click Load unpacked and select ${distPath}`);
  } else {
    log("To apply this build:");
    log(`  1. Open ${extensionsUrl}`);
    log("  2. Find myCONTACTS and click Reload");
    if (runtime.extensionId) {
      log(`     (extension id: ${runtime.extensionId})`);
    }
  }

  log("");
  log("For fully automated reload/install next time, answer Yes when asked to restart the browser,");
  log(`or run with --launch --restart-browser, or use --profile=dev for an isolated browser.`);
}

async function ensureChromiumDebugBrowser(runtime, browser, flags, dryRun) {
  if (browser.family !== "chromium") {
    return false;
  }

  if (await isDebugPortOpen(runtime.debugPort)) {
    log(`Debug port ${runtime.debugPort} is already open.`);
    return true;
  }

  const mustLaunch = flags.has("--launch") || isInteractive(flags);
  if (!mustLaunch && !flags.has("--yes")) {
    fail(
      `Debug port ${runtime.debugPort} is not reachable.`,
      "Re-run with --launch, or start the browser manually with remote debugging enabled.",
    );
  }

  if (!mustLaunch && flags.has("--yes")) {
    fail(
      `Debug port ${runtime.debugPort} is not reachable.`,
      "node scripts/mycontacts-dev.mjs update --launch --yes",
    );
  }

  if (browser.family === "chromium" && isBrowserRunning(browser)) {
    if (runtime.profileMode === "personal") {
      let shouldRestart =
        flags.has("--restart-browser") || flags.has("--close-browser");

      if (!shouldRestart && isInteractive(flags)) {
        info(`${browser.name} is currently running.`);
        log("Automated reload requires restarting the browser with remote debugging enabled.");
        shouldRestart = await confirm(`Restart ${browser.name} now?`, false);
      }

      if (!shouldRestart) {
        printManualExtensionSteps(browser, runtime, { installing: !runtime.extensionId });
        return false;
      }

      if (!dryRun) {
        log(`Restarting ${browser.name}...`);
        stopBrowser(browser);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
      }
    } else {
      warn(`${browser.name} is already running. An isolated dev profile will be launched separately.`);
    }
  }

  if (dryRun) {
    log(`[dry-run] ${formatLaunchCommand(browser, runtime)}`);
    return true;
  }

  info(`Launching ${browser.name} (${runtime.profileMode} profile)...`);
  if (runtime.profileMode === "personal" && browser.family === "chromium") {
    const inspection = inspectBrowserProfile(browser, "personal");
    log(`Profile: ${formatProfileSummary(inspection)}`);
    if (inspection.looksFresh) {
      warn(
        "This profile path has no extensions yet. If the browser opens like a fresh install, delete .mycontacts-dev.json and re-run.",
      );
    }
  }
  log(formatLaunchCommand(browser, runtime));
  launchChromiumBrowser(browser, runtime);

  const ready = await waitForDebugPort(runtime.debugPort);
  if (!ready) {
    fail(
      `${browser.name} did not open debug port ${runtime.debugPort} in time.`,
      "node scripts/mycontacts-dev.mjs launch --foreground",
    );
  }

  return true;
}

async function reloadOrLoadExtension(runtime, dryRun) {
  if (!existsSync(resolve(DIST_DIR, "manifest.json"))) {
    fail("dist/manifest.json not found. Run build first.", "node scripts/mycontacts-dev.mjs build");
  }

  const distPath = resolve(DIST_DIR);
  if (dryRun) {
    log(`[dry-run] load/reload extension from ${distPath}`);
    return { action: "dry-run", extensionId: runtime.extensionId };
  }

  const installed = await getInstalledExtensions(runtime.debugPort);
  const existing = findExtensionByPath(installed.extensions, distPath);

  if (existing?.id) {
    log(`Reloading installed extension ${existing.id}...`);
    try {
      await reloadExtensionServiceWorker(runtime.debugPort, existing.id);
      runtime.extensionId = existing.id;
      saveConfig(runtime);
      return { action: "reloaded", extensionId: existing.id };
    } catch (error) {
      warn(`${error instanceof Error ? error.message : error} Trying reinstall...`);
      await uninstallExtension(runtime.debugPort, existing.id);
    }
  }

  log(`Loading unpacked extension from ${distPath}...`);
  const loaded = await loadUnpackedExtension(
    runtime.debugPort,
    distPath,
    runtime.enableInIncognito,
  );

  runtime.extensionId = loaded.id;
  saveConfig(runtime);
  return { action: "loaded", extensionId: loaded.id };
}

async function installForFirefox(browser, runtime, flags, dryRun) {
  const distPath = resolve(DIST_DIR, "manifest.json");
  if (!existsSync(distPath)) {
    fail("dist/manifest.json not found. Run build first.", "node scripts/mycontacts-dev.mjs build");
  }

  info("Firefox-based browser selected");
  log("myCONTACTS is built for Chrome Manifest V3. Firefox can load it only as a temporary add-on.");
  log("");
  log("Manual install steps:");
  log("  1. Open about:debugging#/runtime/this-firefox");
  log("  2. Click “Load Temporary Add-on…”");
  log(`  3. Select ${distPath}`);
  log("");
  log("The add-on remains installed until you quit Firefox.");

  if (dryRun) {
    log("[dry-run] would open Firefox at about:debugging#/runtime/this-firefox");
    return { action: "manual-firefox" };
  }

  const interactive = isInteractive(flags);
  if (interactive) {
    const openNow = await confirm(`Open ${browser.name} at the temporary add-ons page now?`, true);
    if (!openNow) {
      log("Manual install steps printed above.");
      return { action: "manual-firefox" };
    }
  } else if (!flags.has("--launch") && !flags.has("--yes")) {
    log("Re-run with --launch to open the browser automatically.");
    return { action: "manual-firefox" };
  }

  runtime.launchUrl = "about:debugging#/runtime/this-firefox";
  launchFirefoxBrowser(browser, runtime);
  log(`${browser.name} opened. Complete the temporary add-on steps above.`);
  return { action: "manual-firefox" };
}

async function commandStatus(config, flags, cliOptions) {
  const installedBrowsers = discoverBrowsers();
  const { desktopId, desktopExec, desktopName } = detectDefaultBrowser(installedBrowsers);
  const { runtime, browser } = await resolveRuntimeSettings(config, flags, cliOptions, {
    prompt: false,
  });

  log(`Repo:             ${REPO_ROOT}`);
  log(`Dist:              ${DIST_DIR}`);
  log(`Config:            ${resolve(REPO_ROOT, ".mycontacts-dev.json")}`);
  log(`System default:    ${desktopName ?? desktopId ?? "unknown"}${desktopExec ? ` (${desktopExec})` : ""}`);
  log(`Selected browser:  ${browser.name} (${browser.id}, ${browser.family}-based)`);
  log(`Launch target:     ${browser.launchKind} → ${browser.launchTarget}`);
  log(`Profile mode:      ${runtime.profileMode}`);
  log(`Profile path:      ${runtime.userDataDir}`);
  if (browser.family === "chromium" && runtime.profileDirectory) {
    log(`Profile directory: ${runtime.profileDirectory}`);
  }
  if (browser.family === "firefox" && runtime.firefoxProfilePath) {
    log(`Firefox profile:   ${runtime.firefoxProfilePath}`);
  }
  log(`Profile summary:   ${formatProfileSummary(inspectBrowserProfile(browser, runtime.profileMode))}`);
  log(`Debug port:        ${runtime.debugPort}`);
  log(`Extension ID:      ${runtime.extensionId ?? "(not installed yet)"}`);
  log(`Installed browsers: ${installedBrowsers.map((entry) => entry.id).join(", ") || "none"}`);

  if (browser.family !== "chromium") {
    log("Automated install: not supported (manual temporary add-on required)");
    return;
  }

  const debugOpen = await isDebugPortOpen(runtime.debugPort);
  log(`Debug port open:   ${debugOpen ? "yes" : "no"}`);

  if (!debugOpen) {
    log(`Launch command:    ${formatLaunchCommand(browser, runtime)}`);
    return;
  }

  try {
    const installed = await getInstalledExtensions(runtime.debugPort);
    const distPath = resolve(DIST_DIR);
    const existing = findExtensionByPath(installed.extensions, distPath);
    if (existing) {
      log(`Extension status:  installed (${existing.id}, v${existing.version}, enabled=${existing.enabled})`);
    } else {
      log("Extension status:  not installed");
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  }
}

async function commandLaunch(config, flags, cliOptions) {
  const { runtime, browser } = await resolveRuntimeSettings(config, flags, cliOptions);
  if (browser.family !== "chromium") {
    fail(
      `${browser.name} does not support CDP extension loading.`,
      "Use a Chromium-based browser for automated install, or run update to get Firefox manual steps.",
    );
  }

  info(`Launching ${browser.name}...`);
  log(formatLaunchCommand(browser, runtime));
  launchChromiumBrowser(browser, runtime, { foreground: flags.has("--foreground") });

  if (flags.has("--foreground")) {
    return;
  }

  const ready = await waitForDebugPort(runtime.debugPort);
  if (!ready) {
    fail(`${browser.name} started but debug port did not open.`);
  }

  log(`${browser.name} ready on http://127.0.0.1:${runtime.debugPort}`);
}

async function commandUpdate(config, flags, cliOptions) {
  const dryRun = flags.has("--dry-run");
  if (hasSavedInstallConfig(config) && !flags.has("--setup") && !flags.has("--reconfigure")) {
    log("Saved install config found — skipping setup questionnaire.");
  }
  const { runtime, browser } = await resolveRuntimeSettings(config, flags, cliOptions);

  if (!flags.has("--no-pull")) {
    gitPull(runtime, dryRun, flags);
  }
  if (!flags.has("--no-install")) {
    installDependencies(dryRun);
  }
  if (!flags.has("--no-build")) {
    buildExtension(dryRun);
  }
  if (flags.has("--no-reload")) {
    log("Update complete (browser install skipped).");
    return;
  }

  if (browser.family === "firefox") {
    await installForFirefox(browser, runtime, flags, dryRun);
    return;
  }

  const cdpReady = await ensureChromiumDebugBrowser(runtime, browser, flags, dryRun);
  if (!cdpReady) {
    log("Done: build ready — reload the extension manually (see steps above).");
    return;
  }
  const result = await reloadOrLoadExtension(runtime, dryRun);
  log(`Done: ${result.action} extension${result.extensionId ? ` (${result.extensionId})` : ""}.`);
  log("Open the side panel from the myCONTACTS toolbar button.");
  if (runtime.profileMode === "personal") {
    log("Installed into your personal profile — it will persist across normal browser launches.");
  }
}

async function main() {
  const { command, flags, options } = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      log(HELP);
      return;
    case "build":
      installDependencies(flags.has("--dry-run"));
      buildExtension(flags.has("--dry-run"));
      log("Build complete.");
      return;
    case "reload": {
      const { runtime, browser } = await resolveRuntimeSettings(config, flags, options);
      if (browser.family === "firefox") {
        await installForFirefox(browser, runtime, new Set([...flags, "--launch"]), flags.has("--dry-run"));
        return;
      }
      const reloadFlags = new Set([...flags, "--launch"]);
      const cdpReady = await ensureChromiumDebugBrowser(
        runtime,
        browser,
        reloadFlags,
        flags.has("--dry-run"),
      );
      if (!cdpReady) {
        log("Reload skipped — apply changes manually (see steps above).");
        return;
      }
      await reloadOrLoadExtension(runtime, flags.has("--dry-run"));
      log("Reload complete.");
      return;
    }
    case "launch":
      await commandLaunch(config, flags, options);
      return;
    case "status":
      await commandStatus(config, flags, options);
      return;
    case "update":
      await commandUpdate(config, flags, options);
      return;
    default:
      fail(`Unknown command: ${command}`, "node scripts/mycontacts-dev.mjs help");
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
