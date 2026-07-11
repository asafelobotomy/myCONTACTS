import type { BackgroundRequestMessage, MessageType } from "../core/types";

export function sendRuntimeMessage<T extends BackgroundRequestMessage>(
  message: T,
): Promise<MessageType> {
  return chrome.runtime.sendMessage(message);
}

export function downloadTextFile(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
