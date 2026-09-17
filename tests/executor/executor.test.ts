import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../../src/config/paths.js";
import { RunStore } from "../../src/state/run-store.js";
import { Executor } from "../../src/executor/executor.js";
import { makeContext, makeAccount, makeStubGitHub, makeRunState } from "../helpers.js";

let home: string;
let paths: ReturnType<typeof resolvePaths>;
let runStore: RunStore;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), "ghforge-exec-")), ".gh-forge");
  paths = resolvePaths(home);
  runStore = new RunStore(paths);
});

afterEach(async () => {
  await rm(join(home, ".."), { recursive: true, force: true });
});

function makeExecutor(overrides: { sleep?: (ms: number) => Promise<void> } = {}) {
  return new Executor({
    runStore,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => ({
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        child: () => null as never,
      }),
    },
    minIntervalMs: 0,
    sleep: overrides.sleep ?? (() => Promise.resolve()),
    now: () => 1_000_000,
  });
}

describe("Executor", () => {
  it("prepareRun creates a run from planned actions", () => {
    const { client } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({
      accounts: [makeAccount()],
      github: client,
    });
    const action = {
      key: "abc",
      kind: "close-issue-fast" as const,
      achievementIds: ["quickdraw"],
      description: "open and close an issue",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { quickdraw: 1 },
      actions: [action],
      dryRun: false,
      flags: { allowOptIn: true, allowHighRisk: true, yes: false },
    });
    expect(run.actions).toHaveLength(1);
    expect(run.actions[0]?.key).toBe("abc");
    expect(run.actions[0]?.status).toBe("pending");
  });

  it("resumes previous action states when existingRun is provided", () => {
    const { client } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({ accounts: [makeAccount()], github: client });
    const prev = makeRunState({
      actions: [
        {
          key: "abc",
          kind: "close-issue-fast",
          achievementIds: ["quickdraw"],
          description: "open and close an issue",
          requiredAccountIds: [],
          policyRisk: "safe",
          status: "done",
          attempts: 1,
          params: {},
        },
      ],
    });
    const action = {
      key: "abc",
      kind: "close-issue-fast" as const,
      achievementIds: ["quickdraw"],
      description: "open and close an issue",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { quickdraw: 1 },
      actions: [action],
      dryRun: false,
      flags: { allowOptIn: true, allowHighRisk: true, yes: false },
      existingRun: prev,
    });
    expect(run.actions[0]?.status).toBe("done");
    expect(run.actions[0]?.attempts).toBe(1);
  });

  it("executes safe actions via the real action runner", async () => {
    const { client, calls } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({ accounts: [makeAccount()], github: client });
    const action = {
      key: "quickdraw-1",
      kind: "close-issue-fast" as const,
      achievementIds: ["quickdraw"],
      description: "open and close an issue",
      requiredAccounts: [],
      params: { withinMinutes: 5 },
      policyRisk: "safe" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { quickdraw: 1 },
      actions: [action],
      dryRun: false,
      flags: { allowOptIn: true, allowHighRisk: true, yes: false },
    });
    const executed = await executor.executeRun(context, run);
    expect(executed.actions[0]?.status).toBe("done");
    expect(calls.issuesCreate).toBe(1);
    expect(calls.issuesClose).toBe(1);
  });

  it("marks unconscionable high-risk actions as skipped", async () => {
    const { client, calls } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({
      accounts: [makeAccount({ id: "helper", username: "h1", role: "helper" }), makeAccount()],
      github: client,
    });
    const action = {
      key: "star-1",
      kind: "repository-star" as const,
      achievementIds: ["starstruck"],
      description: "star the sandbox repo",
      requiredAccounts: [],
      params: {},
      policyRisk: "high-risk" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { starstruck: 1 },
      actions: [action],
      dryRun: false,
      flags: { allowOptIn: true, allowHighRisk: false, yes: false },
    });
    const executed = await executor.executeRun(context, run);
    expect(executed.actions[0]?.status).toBe("skipped");
    expect(calls.star).toBe(0);
  });

  it("dry-run never mutates GitHub", async () => {
    const { client, calls } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({ accounts: [makeAccount()], github: client });
    const action = {
      key: "quickdraw-1",
      kind: "close-issue-fast" as const,
      achievementIds: ["quickdraw"],
      description: "open and close an issue",
      requiredAccounts: [],
      params: { withinMinutes: 5 },
      policyRisk: "safe" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { quickdraw: 1 },
      actions: [action],
      dryRun: true,
      flags: { allowOptIn: true, allowHighRisk: true, yes: false },
    });
    const executed = await executor.executeRun(context, run);
    expect(executed.actions[0]?.status).toBe("pending");
    expect(calls.issuesCreate).toBe(0);
    expect(calls.issuesClose).toBe(0);
    expect(calls.prCreate).toBe(0);
    expect(calls.prMerge).toBe(0);
    expect(calls.putFile).toBe(0);
    expect(calls.createBranch).toBe(0);
    expect(calls.star).toBe(0);
  });

  it("persists the run after every action", async () => {
    const { client } = makeStubGitHub();
    const executor = makeExecutor();
    const context = makeContext({ accounts: [makeAccount()], github: client });
    const action = {
      key: "quickdraw-1",
      kind: "close-issue-fast" as const,
      achievementIds: ["quickdraw"],
      description: "open and close an issue",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe" as const,
    };
    const run = executor.prepareRun({
      context,
      targets: { quickdraw: 1 },
      actions: [action],
      dryRun: false,
      flags: { allowOptIn: true, allowHighRisk: true, yes: false },
    });
    await executor.executeRun(context, run);
    const stored = await runStore.load(run.runId);
    expect(stored.actions[0]?.status).toBe("done");
  });
});