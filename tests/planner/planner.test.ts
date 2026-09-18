import { describe, expect, it } from "vitest";
import { createPlan } from "../../src/planner/planner.js";
import { createAchievementRegistry } from "../../src/achievements/achievement-registry.js";
import { createDefaultConfig } from "../../src/config/schema.js";
import { makeContext, makeAccount } from "../helpers.js";

const registry = createAchievementRegistry();

interface PlanOptions {
  targets?: Record<string, number>;
  only?: string[];
  config?: ReturnType<typeof createDefaultConfig>;
  allowHighRisk?: boolean;
  knownProgress?: Record<string, number>;
  accounts?: ReturnType<typeof makeAccount>[];
}

async function planFor(options: PlanOptions = {}) {
  const config = options.config ?? createDefaultConfig();
  const ctx = makeContext({
    accounts: options.accounts ?? [makeAccount()],
    config,
    knownProgress: options.knownProgress,
    allowHighRisk: options.allowHighRisk ?? true,
  });
  return createPlan({
    registry,
    context: ctx,
    targets: options.targets ?? {},
    ...(options.only === undefined ? {} : { only: options.only }),
    policyGates: { allowHighRisk: ctx.policyGates.allowHighRisk },
  });
}

describe("createPlan", () => {
  it("returns no actions with no targets", async () => {
    const plan = await planFor({ targets: {} });
    expect(plan.actions).toEqual([]);
    expect(plan.readyToExecute).toBe(false);
  });

  it("plans quickdraw as one safe action", async () => {
    const plan = await planFor({ targets: { quickdraw: 1 } });
    expect(plan.entries[0]?.achievementId).toBe("quickdraw");
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.kind).toBe("close-issue-fast");
    expect(plan.actions[0]?.policyRisk).toBe("safe");
    expect(plan.readyToExecute).toBe(true);
  });

  it("adds a blocker for achievements that are not automatable", async () => {
    const plan = await planFor({ targets: { "open-sourcerer": 1 } });
    expect(plan.blockers.some((blocker) => blocker.includes("cannot be automated"))).toBe(true);
    expect(plan.readyToExecute).toBe(false);
  });

  it("adds a blocker for unknown achievements", async () => {
    const plan = await planFor({ targets: { "bogus-achievement": 1 } });
    expect(plan.blockers.some((blocker) => blocker.includes("bogus-achievement"))).toBe(true);
  });

  it("plans pull-shark default tier as 2 merged PRs", async () => {
    const plan = await planFor({ targets: { "pull-shark": 1 } });
    const entry = plan.entries.find((value) => value.achievementId === "pull-shark");
    expect(entry?.targetRequirement).toBe(2);
    expect(plan.actions.filter((action) => action.kind === "merged-pull-request")).toHaveLength(2);
  });

  it("only keeps targeted achievements when --only is provided", async () => {
    const plan = await planFor({ targets: { "pull-shark": 1, quickdraw: 1 }, only: ["quickdraw"] });
    expect(plan.entries.map((entry) => entry.achievementId)).toEqual(["quickdraw"]);
    expect(plan.actions).toHaveLength(1);
  });

  it("skips targets already reached according to knownProgress", async () => {
    const plan = await planFor({
      targets: { quickdraw: 1 },
      knownProgress: { quickdraw: 1 },
    });
    expect(plan.actions).toEqual([]);
    expect(plan.summary.achievementsAlreadyDone).toBe(1);
  });

  it("flags high-risk starstruck actions", async () => {
    const plan = await planFor({ targets: { starstruck: 1 } });
    expect(plan.actions.some((action) => action.policyRisk === "high-risk")).toBe(true);
    expect(plan.summary.actionsNeedingConsent).toBeGreaterThan(0);
  });

  it("blocks starstruck when high-risk consent is missing", async () => {
    const plan = await planFor({ targets: { starstruck: 1 }, allowHighRisk: false });
    expect(plan.blockers.some((blocker) => blocker.includes("high-risk"))).toBe(true);
    expect(plan.readyToExecute).toBe(false);
  });

  it("reports missing helper accounts for galaxy-brain", async () => {
    const plan = await planFor({ targets: { "galaxy-brain": 1 } });
    expect(plan.summary.missingHelpers).toBeGreaterThan(0);
  });

  it("blocks galaxy-brain when high-risk consent is missing", async () => {
    const plan = await planFor({ targets: { "galaxy-brain": 1 }, allowHighRisk: false });
    expect(plan.readyToExecute).toBe(false);
  });

  it("needs a helper account for pair-extraordinaire", async () => {
    const accounts = [
      makeAccount(),
      makeAccount({ id: "helper", username: "octohelper", role: "helper" }),
    ];
    const plan = await planFor({
      targets: { "pair-extraordinaire": 1 },
      accounts,
    });
    const ledger = plan.entries.find((entry) => entry.achievementId === "pair-extraordinaire");
    expect(ledger?.helpersRequired).toBe(1);
    expect(ledger?.accountsRequired).toBe(2);
    const action = plan.actions.find(
      (candidate) => candidate.kind === "co-authored-merged-pull-request",
    );
    expect(action?.policyRisk).toBe("safe");
  });
});