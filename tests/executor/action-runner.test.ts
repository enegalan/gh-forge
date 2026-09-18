import { describe, expect, it } from "vitest";
import {
  branchNameFor,
  ensureRepository,
  markerFor,
  markerHtml,
  runAction,
  type ActionRunInput,
} from "../../src/executor/action-runner.js";
import { makeContext, makeAccount, makeStubGitHub } from "../helpers.js";
import type { GitHubIssue, GitHubPullRequest } from "../../src/github/types.js";
import type { PlannedAction } from "../../src/domain/action.js";

const silentLogger = {
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
};

function makeInput(
  clientAndCalls: ReturnType<typeof makeStubGitHub>,
  action: PlannedAction,
  overrides: Partial<ActionRunInput> = {},
): ActionRunInput {
  const context = makeContext({
    accounts: [
      makeAccount(),
      makeAccount({ id: "helper", username: "octohelper", role: "helper" }),
    ],
    github: clientAndCalls.client,
  });
  return {
    context,
    action,
    logger: silentLogger,
    dryRun: false,
    mergeMethod: "merge",
    branchPrefix: "gh-forge",
    ...overrides,
  };
}

function quickdrawAction(): PlannedAction {
  return {
    key: "qd-1",
    kind: "close-issue-fast",
    achievementIds: ["quickdraw"],
    description: "quickdraw action",
    requiredAccounts: [],
    params: { withinMinutes: 5 },
    policyRisk: "safe",
  };
}

describe("markers", () => {
  it("builds a marker from an action key", () => {
    expect(markerFor("abc123")).toBe("gh-forge:abc123");
  });

  it("builds a marker html comment", () => {
    expect(markerHtml("gh-forge:abc123")).toBe("<!-- gh-forge:abc123 -->");
  });
});

describe("branchNameFor", () => {
  it("uses the prefix, achievement and action key", () => {
    const action = quickdrawAction();
    expect(branchNameFor(action, "gh-forge")).toBe("gh-forge/quickdraw/qd-1");
  });
});

describe("ensureRepository", () => {
  it("returns the existing repository without creating it", async () => {
    const { client, calls } = makeStubGitHub();
    const input = makeInput({ client, calls }, quickdrawAction());
    const result = await ensureRepository(input);
    expect(result.created).toBe(false);
    expect(result.repo).toBe("gh-forge-sandbox");
  });

  it("creates the repository when missing", async () => {
    const stub = makeStubGitHub({ repoResult: Promise.resolve(null) });
    const input = makeInput(stub, quickdrawAction());
    const result = await ensureRepository(input);
    expect(result.created).toBe(true);
    expect(result.repo).toBe("gh-forge-sandbox");
  });
});

describe("runAction - quickdraw", () => {
  it("opens and closes an issue", async () => {
    const stub = makeStubGitHub();
    const input = makeInput(stub, quickdrawAction());
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.issuesCreate).toBe(1);
    expect(stub.calls.issuesClose).toBe(1);
    expect(outcome.ref?.type).toBe("issue");
  });

  it("short-circuits when a marker issue already exists", async () => {
    const existing: GitHubIssue = {
      id: 2,
      number: 7,
      title: "existing",
      state: "closed",
      body: "<!-- gh-forge:qd-1 -->",
      html_url: "",
      created_at: "",
      closed_at: null,
    };
    const stub = makeStubGitHub({ existingIssue: existing });
    const input = makeInput(stub, quickdrawAction());
    const outcome = await runAction(input);
    expect(outcome.status).toBe("skipped");
    expect(stub.calls.issuesCreate).toBe(0);
    expect(stub.calls.issuesClose).toBe(0);
  });

  it("dry-run returns would-run without mutating", async () => {
    const stub = makeStubGitHub();
    const input = makeInput(stub, quickdrawAction(), { dryRun: true });
    const outcome = await runAction(input);
    expect(outcome.status).toBe("would-run");
    expect(stub.calls.issuesCreate).toBe(0);
    expect(stub.calls.issuesClose).toBe(0);
  });
});

describe("runAction - pull requests", () => {
  function mergedPRAction(): PlannedAction {
    return {
      key: "ps-1",
      kind: "merged-pull-request",
      achievementIds: ["pull-shark"],
      description: "merged pr",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe",
    };
  }

  it("creates a branch, commits a file, opens and merges a PR", async () => {
    const stub = makeStubGitHub();
    const input = makeInput(stub, mergedPRAction());
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.putFile).toBe(1);
    expect(stub.calls.prCreate).toBe(1);
    expect(stub.calls.prMerge).toBe(1);
  });

  it("skips when the PR is already merged", async () => {
    const existing: GitHubPullRequest = {
      id: 1,
      number: 10,
      title: "gh-forge pr",
      state: "closed",
      merged: true,
      merged_at: "2026-09-16T00:00:00Z",
      html_url: "https://x/pull/10",
      body: "<!-- gh-forge:ps-1 -->",
      draft: false,
      head: { ref: "gh-forge/pull-shark/ps-1", sha: "sha", repo: { full_name: "o/r" } },
      base: { ref: "main" },
    };
    const stub = makeStubGitHub({ existingPull: existing });
    const input = makeInput(stub, mergedPRAction());
    const outcome = await runAction(input);
    expect(outcome.status).toBe("skipped");
    expect(stub.calls.prCreate).toBe(0);
    expect(stub.calls.prMerge).toBe(0);
  });

  const fastMerge = {
    mergePollIntervalMs: 1,
    mergeMaxAttempts: 5,
    sleep: () => Promise.resolve(),
  };

  it("waits for GitHub's lazily computed mergeability before merging", async () => {
    const stub = makeStubGitHub({ pullMergeableSequence: [null, null, true] });
    const input = makeInput(stub, mergedPRAction(), fastMerge);
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.prMerge).toBe(1);
  });

  it("retries a transient 405 not-mergeable failure", async () => {
    const stub = makeStubGitHub({ mergeFailures: 1 });
    const input = makeInput(stub, mergedPRAction(), fastMerge);
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.prMerge).toBe(2);
  });

  it("fails without merging when the PR has real conflicts", async () => {
    const stub = makeStubGitHub({ pullMergeableSequence: [false] });
    const input = makeInput(stub, mergedPRAction(), fastMerge);
    const outcome = await runAction(input);
    expect(outcome.status).toBe("failed");
    expect(outcome.message).toContain("conflicts");
    expect(stub.calls.prMerge).toBe(0);
  });

  it("gives up after the configured number of mergeability polls", async () => {
    const stub = makeStubGitHub({ pullMergeableSequence: [null] });
    const input = makeInput(stub, mergedPRAction(), { ...fastMerge, mergeMaxAttempts: 3 });
    const outcome = await runAction(input);
    expect(outcome.status).toBe("failed");
    expect(stub.calls.prMerge).toBe(0);
  });
});

describe("runAction - co-authored merged PR", () => {
  it("requires a verified helper commit email", async () => {
    const stub = makeStubGitHub();
    const context = makeContext({
      accounts: [makeAccount({ commitEmail: "main@example.com" })],
      github: stub.client,
    });
    const action: PlannedAction = {
      key: "pe-1",
      kind: "co-authored-merged-pull-request",
      achievementIds: ["pair-extraordinaire"],
      description: "co-authored pr",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe",
    };
    const input: ActionRunInput = {
      context,
      action,
      logger: silentLogger,
      dryRun: false,
      mergeMethod: "merge",
      branchPrefix: "gh-forge",
    };
    await expect(runAction(input)).rejects.toThrow();
  });

  it("adds the Co-authored-by trailer when the helper email is known", async () => {
    const stub = makeStubGitHub();
    const context = makeContext({
      accounts: [
        makeAccount({ id: "main", username: "octocat", role: "main" }),
        makeAccount({
          id: "helper",
          username: "octohelper",
          role: "helper",
          commitEmail: "helper@example.com",
        }),
      ],
      github: stub.client,
    });
    const action: PlannedAction = {
      key: "pe-1",
      kind: "co-authored-merged-pull-request",
      achievementIds: ["pair-extraordinaire"],
      description: "co-authored pr",
      requiredAccounts: [],
      params: {},
      policyRisk: "safe",
    };
    const input: ActionRunInput = {
      context,
      action,
      logger: silentLogger,
      dryRun: false,
      mergeMethod: "merge",
      branchPrefix: "gh-forge",
    };
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.prMerge).toBe(1);
  });
});

describe("runAction - repository star", () => {
  it("uses the first helper account to star the repo", async () => {
    const stub = makeStubGitHub();
    const context = makeContext({
      accounts: [
        makeAccount({ id: "main", username: "octocat", role: "main" }),
        makeAccount({ id: "helper", username: "octohelper", role: "helper" }),
      ],
      github: stub.client,
    });
    const action: PlannedAction = {
      key: "ss-1",
      kind: "repository-star",
      achievementIds: ["starstruck"],
      description: "star the sandbox",
      requiredAccounts: [],
      params: { unitIndex: 0 },
      policyRisk: "high-risk",
    };
    const input: ActionRunInput = {
      context,
      action,
      logger: silentLogger,
      dryRun: false,
      mergeMethod: "merge",
      branchPrefix: "gh-forge",
    };
    const outcome = await runAction(input);
    expect(outcome.status).toBe("done");
    expect(stub.calls.star).toBe(1);
  });

  it("skips when the account already starred", async () => {
    const stub = makeStubGitHub({ hasStarredResult: true });
    const context = makeContext({
      accounts: [
        makeAccount({ id: "main", username: "octocat", role: "main" }),
        makeAccount({ id: "helper", username: "octohelper", role: "helper" }),
      ],
      github: stub.client,
    });
    const action: PlannedAction = {
      key: "ss-1",
      kind: "repository-star",
      achievementIds: ["starstruck"],
      description: "star",
      requiredAccounts: [],
      params: { unitIndex: 0 },
      policyRisk: "high-risk",
    };
    const input: ActionRunInput = {
      context,
      action,
      logger: silentLogger,
      dryRun: false,
      mergeMethod: "merge",
      branchPrefix: "gh-forge",
    };
    const outcome = await runAction(input);
    expect(outcome.status).toBe("skipped");
    expect(stub.calls.star).toBe(0);
  });

  it("fails when no helper account is available for the requested unit index", async () => {
    const stub = makeStubGitHub();
    const context = makeContext({
      accounts: [
        makeAccount({ id: "main", username: "octocat", role: "main" }),
        makeAccount({ id: "helper", username: "octohelper", role: "helper" }),
      ],
      github: stub.client,
    });
    const action: PlannedAction = {
      key: "ss-9",
      kind: "repository-star",
      achievementIds: ["starstruck"],
      description: "star",
      requiredAccounts: [],
      params: { unitIndex: 9 },
      policyRisk: "high-risk",
    };
    const input: ActionRunInput = {
      context,
      action,
      logger: silentLogger,
      dryRun: false,
      mergeMethod: "merge",
      branchPrefix: "gh-forge",
    };
    const outcome = await runAction(input);
    expect(outcome.status).toBe("failed");
    expect(stub.calls.star).toBe(0);
  });
});