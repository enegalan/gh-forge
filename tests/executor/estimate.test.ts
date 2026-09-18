import { describe, expect, it } from "vitest";
import {
  MIN_REQUEST_MS,
  REQUESTS_BY_KIND,
  estimateActionSeconds,
  estimateActions,
  formatDuration,
} from "../../src/executor/estimate.js";
import { ACTION_KIND_LABELS, type ActionKind } from "../../src/domain/action.js";

const KINDS = Object.keys(ACTION_KIND_LABELS) as ActionKind[];

describe("REQUESTS_BY_KIND", () => {
  it("covers every action kind", () => {
    for (const kind of KINDS) {
      expect(REQUESTS_BY_KIND[kind]).toBeGreaterThan(0);
    }
    expect(Object.keys(REQUESTS_BY_KIND).sort()).toEqual([...KINDS].sort());
  });

  it("charges the PR kinds more than the cheap kinds", () => {
    expect(REQUESTS_BY_KIND["merged-pull-request"]).toBeGreaterThan(
      REQUESTS_BY_KIND["close-issue-fast"],
    );
    expect(REQUESTS_BY_KIND["co-authored-merged-pull-request"]).toBe(
      REQUESTS_BY_KIND["merged-pull-request"],
    );
  });
});

describe("estimateActionSeconds", () => {
  it("scales with the throttle, which dominates the run time", () => {
    // Measured p50 for this exact action with the default throttle was 15.85 s.
    const estimate = estimateActionSeconds("merged-pull-request", 1_500);
    expect(estimate).toBeCloseTo(16.5, 5);
    expect(estimate).toBeGreaterThan(15);
    expect(estimate).toBeLessThan(20);
  });

  it("doubles when the throttle doubles", () => {
    const base = estimateActionSeconds("merged-pull-request", 1_500);
    const doubled = estimateActionSeconds("merged-pull-request", 3_000);
    expect(doubled).toBeCloseTo(base * 2, 5);
  });

  it("still assumes a network floor when the throttle is disabled", () => {
    expect(estimateActionSeconds("close-issue-fast", 0)).toBeCloseTo(
      (REQUESTS_BY_KIND["close-issue-fast"] * MIN_REQUEST_MS) / 1000,
      5,
    );
  });

  it("estimates the cheap kinds in seconds", () => {
    expect(estimateActionSeconds("repository-star", 1_500)).toBeCloseTo(4.5, 5);
    expect(estimateActionSeconds("close-issue-fast", 1_500)).toBeCloseTo(6, 5);
    expect(estimateActionSeconds("accepted-discussion-answer", 1_500)).toBeCloseTo(9, 5);
  });
});

describe("estimateActions", () => {
  it("returns zero for an empty plan", () => {
    const estimate = estimateActions([], 1_500);
    expect(estimate.seconds).toBe(0);
    expect(estimate.actionCount).toBe(0);
    expect(estimate.byKind).toEqual({});
  });

  it("sums actions and groups seconds by kind", () => {
    const estimate = estimateActions(
      [{ kind: "merged-pull-request" }, { kind: "merged-pull-request" }, { kind: "repository-star" }],
      1_500,
    );
    expect(estimate.actionCount).toBe(3);
    expect(estimate.byKind["merged-pull-request"]).toBeCloseTo(33, 5);
    expect(estimate.byKind["repository-star"]).toBeCloseTo(4.5, 5);
    expect(estimate.seconds).toBeCloseTo(37.5, 5);
  });

  it("reproduces the measured 896-PR run within 10%", () => {
    const actions = Array.from({ length: 896 }, () => ({ kind: "merged-pull-request" as const }));
    const estimate = estimateActions(actions, 1_500);
    const measuredSeconds = 896 * 15.85;
    expect(estimate.seconds).toBeGreaterThan(measuredSeconds * 0.9);
    expect(estimate.seconds).toBeLessThan(measuredSeconds * 1.1);
  });
});

describe("formatDuration", () => {
  it("renders seconds, minutes and hours", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3_600)).toBe("1h");
    expect(formatDuration(3_780)).toBe("1h 3m");
    expect(formatDuration(3_660)).toBe("1h 1m");
  });

  it("handles degenerate input without crashing", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
  });
});