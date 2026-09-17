import { describe, expect, it } from "vitest";
import {
  POLICY_NOTES,
  isMaxRisk,
  riskAllowed,
  riskLabel,
  riskWeight,
  type PolicyRisk,
} from "../../src/domain/policy.js";

describe("riskWeight", () => {
  it("orders safe < opt-in < high-risk", () => {
    expect(riskWeight("safe")).toBeLessThan(riskWeight("opt-in"));
    expect(riskWeight("opt-in")).toBeLessThan(riskWeight("high-risk"));
  });
});

describe("isMaxRisk", () => {
  it("returns the higher of two risks", () => {
    expect(isMaxRisk("safe", "opt-in")).toBe("opt-in");
    expect(isMaxRisk("high-risk", "opt-in")).toBe("high-risk");
    expect(isMaxRisk("safe", "safe")).toBe("safe");
  });
});

describe("riskAllowed", () => {
  it("always allows safe", () => {
    expect(riskAllowed("safe", { allowOptIn: false, allowHighRisk: false })).toBe(true);
  });

  it("blocks opt-in without consent", () => {
    expect(riskAllowed("opt-in", { allowOptIn: false, allowHighRisk: false })).toBe(false);
    expect(riskAllowed("opt-in", { allowOptIn: true, allowHighRisk: false })).toBe(true);
    expect(riskAllowed("opt-in", { allowOptIn: false, allowHighRisk: true })).toBe(true);
  });

  it("blocks high-risk unless allowHighRisk is set", () => {
    expect(riskAllowed("high-risk", { allowOptIn: true, allowHighRisk: false })).toBe(false);
    expect(riskAllowed("high-risk", { allowOptIn: false, allowHighRisk: true })).toBe(true);
    expect(riskAllowed("high-risk", { allowOptIn: true, allowHighRisk: true })).toBe(true);
  });
});

describe("riskLabel", () => {
  it("labels each risk", () => {
    expect(riskLabel("safe")).toContain("safe");
    expect(riskLabel("opt-in")).toContain("--allow-policy-risks");
    expect(riskLabel("high-risk")).toContain("--allow-high-risk");
  });
});

describe("POLICY_NOTES", () => {
  it("cites AUP §4 for both consent risks", () => {
    expect(POLICY_NOTES["opt-in"]).toContain("Acceptable Use Policies §4");
    expect(POLICY_NOTES["high-risk"]).toContain("rank abuse");
  });

  it("covers every non-safe risk", () => {
    for (const risk of ["opt-in", "high-risk"] as Exclude<PolicyRisk, "safe">[]) {
      expect(POLICY_NOTES[risk].length).toBeGreaterThan(0);
    }
  });
});