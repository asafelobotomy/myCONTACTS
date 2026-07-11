export class UnauthorizedMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedMessageError";
  }
}

export function isTrustedExtensionSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

export function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  return Boolean(sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`));
}

export function assertTrustedSender(sender: chrome.runtime.MessageSender): void {
  if (!isTrustedExtensionSender(sender)) {
    throw new UnauthorizedMessageError("Untrusted message sender.");
  }
}

export function assertExtensionPageSender(sender: chrome.runtime.MessageSender): void {
  assertTrustedSender(sender);
  if (!isExtensionPageSender(sender)) {
    throw new UnauthorizedMessageError("Message must come from an extension page.");
  }
}
