import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseChromiumSingletonLockPid } from "./browsers.mjs";

describe("chromium profile helpers", () => {
  it("reads pid from SingletonLock symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "mycontacts-chromium-"));
    symlinkSync("archlinux-12345", join(dir, "SingletonLock"));
    assert.equal(parseChromiumSingletonLockPid(dir), 12345);
  });

  it("returns null when lock file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "mycontacts-chromium-"));
    assert.equal(parseChromiumSingletonLockPid(dir), null);
  });
});
