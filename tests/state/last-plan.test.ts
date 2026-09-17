import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../../src/config/paths.js";
import { loadLastPlanTargets, saveLastPlanTargets } from "../../src/state/last-plan.js";

let home: string;
let paths: ReturnType<typeof resolvePaths>;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), "ghforge-plan-")), ".gh-forge");
  paths = resolvePaths(home);
});

afterEach(async () => {
  await rm(join(home, ".."), { recursive: true, force: true });
});

describe("last plan store", () => {
  it("returns null when no plan has been generated", async () => {
    expect(await loadLastPlanTargets(paths)).toBeNull();
  });

  it("round-trips the targets of the last plan", async () => {
    await saveLastPlanTargets(paths, { "pull-shark": 4, quickdraw: 1 });
    expect(await loadLastPlanTargets(paths)).toEqual({ "pull-shark": 4, quickdraw: 1 });
  });

  it("keeps only the most recent plan", async () => {
    await saveLastPlanTargets(paths, { "pull-shark": 4 });
    await saveLastPlanTargets(paths, { quickdraw: 1 });
    expect(await loadLastPlanTargets(paths)).toEqual({ quickdraw: 1 });
  });

  it("ignores malformed levels when loading", async () => {
    await saveLastPlanTargets(paths, { "pull-shark": 4 });
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(paths.planFile, "utf8"));
    const parsed = JSON.parse(raw) as { targets: Record<string, unknown> };
    parsed.targets["bogus"] = "high";
    parsed.targets["out-of-range"] = 9;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(paths.planFile, JSON.stringify(parsed), "utf8");
    expect(await loadLastPlanTargets(paths)).toEqual({ "pull-shark": 4 });
  });
});
