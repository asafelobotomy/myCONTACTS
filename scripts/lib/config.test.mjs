import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, hasSavedInstallConfig } from "./config.mjs";

describe("config helpers", () => {
  it("detects a complete saved install config", () => {
    assert.equal(
      hasSavedInstallConfig({
        ...DEFAULT_CONFIG,
        browserId: "brave-origin",
        userDataDir: "/home/user/.config/BraveSoftware/Brave-Origin",
      }),
      true,
    );
  });

  it("requires both browser and profile path before skipping setup", () => {
    assert.equal(
      hasSavedInstallConfig({
        ...DEFAULT_CONFIG,
        browserId: "brave-origin",
      }),
      false,
    );
    assert.equal(
      hasSavedInstallConfig({
        ...DEFAULT_CONFIG,
        userDataDir: "/home/user/.config/BraveSoftware/Brave-Origin",
      }),
      false,
    );
  });
});
