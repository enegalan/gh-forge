import { describe, expect, it } from "vitest";
import {
  createRunState,
  isResumable,
  nextPendingAction,
  recomputeRunStatus,
  type RunState,
} from "../../src/state/execution-state.js";

function runWithActions(actions: Array<{ status: string }>): RunState {
  return {
    version: 1,
    runId: "run-1",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    status: "in_progress",
    dryRun: false,
    targets: {},
    flags: { allowOptIn: false, allowHighRisk: false, yes: false },
    accounts: {},
    actions: actions.map((action, index) => ({
      key: `k${index}`,
      kind: "merged-pull-request",
      achievementIds: ["pull-shark"],
      description: `action ${index}`,
      requiredAccountIds: [],
      policyRisk: "safe",
      status: action.status as RunState["actions"][number]["status"],
      attempts: 0,
      params: {},
    })),
    observations: [],
  };
}

describe("createRunState", () => {
  it("starts with in_progress and empty actions", () => {
    const run = createRunState({
      runId: "r",
      targets: { "pull-shark": 2 },
      accounts: { main: "octocat" },
      dryRun: false,
      flags: { allowOptIn: false, allowHighRisk: false, yes: false },
    });
    expect(run.version).toBe(1);
    expect(run.status).toBe("in_progress");
    expect(run.actions).toEqual([]);
    expect(run.observations).toEqual([]);
    expect(run.targets).toEqual({ "pull-shark": 2 });
  });
});

describe("isResumable", () => {
  it("is false for completed runs", () => {
    expect(isResumable(runWithActions([{ status: "done" }, { status: "done" }]))).toBe(false);
  });

  it("is true when any action is pending/failed/in_flight", () => {
    expect(isResumable(runWithActions([{ status: "done" }, { status: "pending" }]))).toBe(true);
    expect(isResumable(runWithActions([{ status: "failed" }]))).toBe(true);
    expect(isResumable(runWithActions([{ status: "in_flight" }]))).toBe(true);
  });

  it("is false for a run with no actions", () => {
    expect(isResumable(runWithActions([]))).toBe(false);
  });
});

describe("nextPendingAction", () => {
  it("returns the first pending/failed/in_flight action", () => {
    const run = runWithActions([{ status: "done" }, { status: "failed" }, { status: "pending" }]);
    expect(nextPendingAction(run)?.key).toBe("k1");
  });

  it("returns undefined when nothing is left", () => {
    expect(nextPendingAction(runWithActions([{ status: "done" }]))).toBeUndefined();
  });
});

describe("recomputeRunStatus", () => {
  it("returns completed when every action is done", () => {
    expect(recomputeRunStatus(runWithActions([{ status: "done" }, { status: "done" }]))).toBe("completed");
  });

  it("returns partial when some actions remain", () => {
    expect(recomputeRunStatus(runWithActions([{ status: "done" }, { status: "pending" }]))).toBe("partial");
    expect(recomputeRunStatus(runWithActions([{ status: "done" }, { status: "failed" }]))).toBe("partial");
  });

  it("keeps the existing status for an empty run", () => {
    const run = runWithActions([]);
    run.status = "in_progress";
    expect(recomputeRunStatus(run)).toBe("in_progress");
  });
});