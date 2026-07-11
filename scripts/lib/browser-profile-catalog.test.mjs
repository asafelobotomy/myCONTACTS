import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFlatpakUserDataDir,
  buildProfileCandidates,
  buildSnapUserDataDir,
  getConfigHome,
} from "./browser-profile-catalog.mjs";

describe("browser-profile-catalog", () => {
  it("uses XDG config home for native chromium paths", () => {
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config";
    try {
      assert.equal(getConfigHome(), "/tmp/xdg-config");
      const candidates = buildProfileCandidates({ id: "chromium" });
      assert.ok(candidates.includes("/tmp/xdg-config/chromium"));
    } finally {
      if (previous === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previous;
      }
    }
  });

  it("includes flatpak and snap chromium paths", () => {
    const candidates = buildProfileCandidates({ id: "chromium" });
    assert.ok(
      candidates.includes(
        buildFlatpakUserDataDir("org.chromium.Chromium", "chromium"),
      ),
    );
    assert.ok(
      candidates.includes(buildSnapUserDataDir("chromium", "chromium", "common")),
    );
  });

  it("includes brave-origin and sibling brave software scan parent", () => {
    const candidates = buildProfileCandidates({ id: "brave-origin" });
    assert.ok(candidates.some((path) => path.endsWith("BraveSoftware/Brave-Origin")));
    assert.ok(candidates.some((path) => path.endsWith("BraveSoftware")));
  });

  it("includes firefox legacy and xdg profile roots", () => {
    const candidates = buildProfileCandidates({ id: "firefox" });
    assert.ok(candidates.some((path) => path.endsWith(".mozilla/firefox")));
    assert.ok(candidates.some((path) => path.endsWith("mozilla/firefox")));
    assert.ok(
      candidates.includes(
        buildFlatpakUserDataDir("org.mozilla.firefox", ".mozilla/firefox", "home"),
      ),
    );
  });
});
