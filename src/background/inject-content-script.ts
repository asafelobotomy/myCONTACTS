import "../content/content-script.ts?script";

const CONTENT_SCRIPT_LOADER = "assets/content-script-loader.js";

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { type: "PING" })) as
      | { type: string }
      | undefined;
    return response?.type === "PONG";
  } catch {
    return false;
  }
}

async function waitForContentScript(tabId: number, attempts = 8): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await pingContentScript(tabId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }

  throw new Error("Content script failed to initialize.");
}

export async function ensureContentScriptInjected(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_LOADER],
  });

  await waitForContentScript(tabId);
}
