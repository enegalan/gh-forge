import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveHomeDir, resolvePaths, type GafPaths } from "../../src/config/paths.js";

describe("resolveHomeDir", () => {
  it("respects GH_FORGE_HOME", () => {
    expect(resolveHomeDir({ GH_FORGE_HOME: "/custom/home" })).toBe("/custom/home");
  });

  it("falls back to ~/.gh-forge", () => {
    const homedir = require("node:os").homedir() as string;
    expect(resolveHomeDir({})).toBe(join(homedir, ".gh-forge"));
  });
});

describe("resolvePaths", () => {
  it("builds all paths under the home directory", () => {
    const paths: GafPaths = resolvePaths("/x");
    expect(paths.configFile).toBe(join("/x", "config.json"));
    expect(paths.accountsFile).toBe(join("/x", "accounts.json"));
    expect(paths.progressFile).toBe(join("/x", "progress.json"));
    expect(paths.runsDir).toBe(join("/x", "state", "runs"));
    expect(paths.cacheDir).toBe(join("/x", "cache"));
    expect(paths.auditLog).toBe(join("/x", "state", "audit.log"));
  });
});