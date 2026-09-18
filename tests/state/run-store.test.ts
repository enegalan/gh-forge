import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../../src/config/paths.js";
import { newRunId, RunStore } from "../../src/state/run-store.js";
import { createRunState, type RunState } from "../../src/state/execution-state.js";

let home: string;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), "ghforge-runs-")), ".gh-forge");
});

afterEach(async () => {
  await rm(join(home, ".."), { recursive: true, force: true });
});

const paths = (): ReturnType<typeof resolvePaths> => resolvePaths(home);

function makeRun(runId = newRunId()): RunState {
  return createRunState({
    runId,
    targets: { "pull-shark": 2 },
    accounts: { main: "octocat" },
    dryRun: false,
    flags: { allowHighRisk: false },
  });
}

describe("RunStore", () => {
  it("saves and loads a run", async () => {
    const store = new RunStore(paths());
    const run = makeRun();
    await store.save(run);
    const loaded = await store.load(run.runId);
    expect(loaded.runId).toBe(run.runId);
    expect(loaded.accounts.main).toBe("octocat");
  });

  it("fails to load an unknown run", async () => {
    const store = new RunStore(paths());
    await expect(store.load("nope")).rejects.toThrow();
  });

  it("lists runs sorted by creation time, newest first", async () => {
    const store = new RunStore(paths());
    const older = makeRun("20200101T000001-aaa");
    const newer = makeRun("20200101T000002-bbb");
    older.createdAt = "2026-09-15T00:00:00Z";
    newer.createdAt = "2026-09-16T00:00:00Z";
    await store.save(older);
    await store.save(newer);
    const summaries = await store.list();
    expect(summaries.map((summary) => summary.runId)).toEqual([newer.runId, older.runId]);
  });

  it("reports resumable runs", async () => {
    const store = new RunStore(paths());
    const done = makeRun("20200101T000001-aaa");
    done.actions.push({
      key: "k",
      kind: "merged-pull-request",
      achievementIds: ["pull-shark"],
      description: "a",
      requiredAccountIds: [],
      policyRisk: "safe",
      status: "done",
      attempts: 1,
      params: {},
    });
    const pending = makeRun("20200101T000002-bbb");
    pending.actions.push({
      key: "k",
      kind: "merged-pull-request",
      achievementIds: ["pull-shark"],
      description: "a",
      requiredAccountIds: [],
      policyRisk: "safe",
      status: "pending",
      attempts: 0,
      params: {},
    });
    await store.save(done);
    await store.save(pending);
    const latest = await store.latestResumable();
    expect(latest?.runId).toBe(pending.runId);
  });

  it("redacts secrets when persisting", async () => {
    const store = new RunStore(paths());
    const run = makeRun();
    run.actions.push({
      key: "k",
      kind: "merged-pull-request",
      achievementIds: ["pull-shark"],
      description: "a",
      requiredAccountIds: [],
      policyRisk: "safe",
      status: "failed",
      attempts: 1,
      params: {},
      error: "token ghp_1234567890abcdefghijklmnopqrstuvwxyz rejected",
    });
    await store.save(run);
    const loaded = await store.load(run.runId);
    const error = loaded.actions[0]?.error ?? "";
    expect(error).not.toContain("ghp_");
    expect(error).toContain("***redacted***");
  });

  it("records observations", async () => {
    const store = new RunStore(paths());
    const run = makeRun();
    await store.save(run);
    const updated = await store.recordObservation(run.runId, {
      kind: "profile-scan",
      achievementId: "pull-shark",
      detail: "found level 2",
    });
    expect(updated.observations.length).toBe(1);
    expect(updated.observations[0]?.kind).toBe("profile-scan");
    expect(updated.observations[0]?.detail).toBe("found level 2");
  });

  it("generates unique run ids", () => {
    expect(newRunId()).not.toBe(newRunId());
  });
});