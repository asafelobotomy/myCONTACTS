import { afterEach, describe, expect, it, vi } from "vitest";

const sessionRemove = vi.fn().mockResolvedValue(undefined);
const sessionSet = vi.fn().mockResolvedValue(undefined);
const sessionGet = vi.fn().mockResolvedValue({});

vi.stubGlobal("chrome", {
  storage: {
    session: {
      get: sessionGet,
      set: sessionSet,
      remove: sessionRemove,
    },
  },
});

describe("crypto session", () => {
  afterEach(async () => {
    vi.resetModules();
    sessionRemove.mockClear();
    sessionSet.mockClear();
    sessionGet.mockClear();
  });

  it("keeps passphrases in memory only", async () => {
    const session = await import("./crypto-session");

    await session.setSessionPassphrase("local-only-secret");
    expect(session.getSessionPassphrase()).toBe("local-only-secret");
    expect(sessionSet).not.toHaveBeenCalled();
    expect(sessionRemove).toHaveBeenCalled();

    await session.setSessionPassphrase(null);
    expect(session.getSessionPassphrase()).toBeNull();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("wipes any legacy session passphrase on restore", async () => {
    const session = await import("./crypto-session");

    await session.restoreSessionPassphrase();
    expect(sessionRemove).toHaveBeenCalled();
    expect(sessionGet).not.toHaveBeenCalled();
  });
});

describe("contact data privacy constants", () => {
  it("tracks legacy library storage keys for purge", async () => {
    const storage = await import("./storage");
    expect(storage.CONTACT_LIBRARY_STORAGE_KEYS).toContain("contactLibrary");
    expect(storage.CONTACT_LIBRARY_DB_NAME).toBe("mycontacts-library");
  });
});
