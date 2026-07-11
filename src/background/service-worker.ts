import { exportContacts } from "../core/export-service";
import { extractionOptionsFromSettings } from "../core/extraction-options";
import {
  assertExtensionPageSender,
  assertTrustedSender,
  UnauthorizedMessageError,
} from "../core/message-auth";
import {
  clearLibrary,
  getLibrary,
  getSettings,
  LibraryLockedError,
  lockLibrary,
  saveToLibrary,
  setLibraryEncryption,
  unlockLibrary,
  updateSettings,
} from "../core/storage";
import type { BackgroundRequestMessage, Contact, ExportFormat, MessageType } from "../core/types";
import { validateContacts, validateExportFormat, ValidationError } from "../core/validation";
import { ensureContentScriptInjected } from "./inject-content-script";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: BackgroundRequestMessage, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(
  message: BackgroundRequestMessage,
  sender: chrome.runtime.MessageSender,
): Promise<MessageType> {
  try {
    assertTrustedSender(sender);

    switch (message.type) {
      case "GET_LIBRARY":
      case "GET_SETTINGS":
        assertExtensionPageSender(sender);
        return message.type === "GET_LIBRARY"
          ? { type: "LIBRARY_RESULT", payload: await getLibrary() }
          : { type: "SETTINGS_RESULT", payload: await getSettings() };
      case "SAVE_TO_LIBRARY":
        assertExtensionPageSender(sender);
        return { type: "LIBRARY_RESULT", payload: await saveToLibrary(message.payload) };
      case "CLEAR_LIBRARY":
        assertExtensionPageSender(sender);
        return { type: "LIBRARY_RESULT", payload: await clearLibrary() };
      case "UPDATE_SETTINGS":
        assertExtensionPageSender(sender);
        return { type: "SETTINGS_RESULT", payload: await updateSettings(message.payload) };
      case "UNLOCK_LIBRARY":
        assertExtensionPageSender(sender);
        return {
          type: "LIBRARY_RESULT",
          payload: await unlockLibrary(message.payload.passphrase),
        };
      case "SET_LIBRARY_ENCRYPTION":
        assertExtensionPageSender(sender);
        return {
          type: "LIBRARY_RESULT",
          payload: await setLibraryEncryption(message.payload.enabled, message.payload.passphrase),
        };
      case "LOCK_LIBRARY":
        assertExtensionPageSender(sender);
        await lockLibrary();
        return { type: "SETTINGS_RESULT", payload: await getSettings() };
      case "EXPORT_CONTACTS": {
        assertExtensionPageSender(sender);
        const contacts = validateContacts(message.payload.contacts);
        const format = validateExportFormat(message.payload.format);
        const exported = exportContacts(contacts, format);
        return { type: "EXPORT_RESULT", payload: exported };
      }
      case "EXTRACT_CONTACTS":
        assertExtensionPageSender(sender);
        return extractFromActiveTab();
      default: {
        const exhaustive: never = message;
        return { type: "ERROR", payload: `Unsupported message: ${(exhaustive as MessageType).type}` };
      }
    }
  } catch (error) {
    if (error instanceof LibraryLockedError) {
      return { type: "LIBRARY_LOCKED" };
    }
    if (error instanceof UnauthorizedMessageError || error instanceof ValidationError) {
      return { type: "ERROR", payload: error.message };
    }
    return {
      type: "ERROR",
      payload: error instanceof Error ? error.message : "Unexpected background worker error.",
    };
  }
}

async function extractFromActiveTab(): Promise<MessageType> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { type: "ERROR", payload: "No active tab found." };
  }

  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
    return { type: "ERROR", payload: "Cannot scan browser internal pages." };
  }

  try {
    await ensureContentScriptInjected(tab.id);
    const settings = await getSettings();
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_CONTACTS",
      payload: extractionOptionsFromSettings(settings),
    })) as MessageType | undefined;

    if (!response) {
      return { type: "ERROR", payload: "Content script did not respond. Try scanning again." };
    }

    if (response.type === "EXTRACTION_RESULT") {
      if (settings.autoSaveToLibrary && response.payload.contacts.length) {
        try {
          await saveToLibrary(response.payload.contacts);
        } catch (error) {
          if (error instanceof LibraryLockedError) {
            return {
              type: "EXTRACTION_RESULT",
              payload: {
                ...response.payload,
                warnings: [
                  ...(response.payload.warnings ?? []),
                  "Contacts were not auto-saved because the encrypted library is locked.",
                ],
              },
            };
          }
          throw error;
        }
      }
    }

    return response;
  } catch (error) {
    return {
      type: "ERROR",
      payload: error instanceof Error ? error.message : "Failed to communicate with the active tab.",
    };
  }
}

export type { Contact, ExportFormat };
