import { extractContactsFromPage } from "../core/extraction-service";
import { DEFAULT_EXTRACTION_OPTIONS } from "../core/extraction-options";
import type { ContentScriptMessage, MessageType } from "../core/types";

chrome.runtime.onMessage.addListener((message: ContentScriptMessage, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ type: "PONG" } satisfies MessageType);
    return false;
  }

  if (message.type !== "EXTRACT_CONTACTS") {
    return false;
  }

  void (async () => {
    try {
      const result = await extractContactsFromPage({
        document,
        url: new URL(window.location.href),
        window,
        options: message.payload ?? DEFAULT_EXTRACTION_OPTIONS,
      });
      sendResponse({ type: "EXTRACTION_RESULT", payload: result } satisfies MessageType);
    } catch (error) {
      sendResponse({
        type: "ERROR",
        payload: error instanceof Error ? error.message : "Extraction failed",
      } satisfies MessageType);
    }
  })();

  return true;
});

export {};
