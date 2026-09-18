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
  it("orders safe < high-risk", () => {
    expect(riskWeight("safe")).toBeLessThan(riskWeight("high-risk"));
  });
});

describe("isMaxRisk", () => {
  it("returns the higher of two risks", () => {
    expect(isMaxRisk("safe", "high-risk")).toBe("high-risk");
    expect(isMaxRisk("high-risk", "safe")).toBe("high-risk");
    expect(isMaxRisk("safe", "safe")).toBe("safe");
  });
});

describe("riskAllowed", () => {
  it("always allows safe", () => {
    expect(riskAllowed("safe", { allowHighRisk: false })).toBe(true);
  });

  it("blocks high-risk unless allowHighRisk is set", () => {
    expect(riskAllowed("high-risk", { allowHighRisk: false })).toBe(false);
    expect(riskAllowed("high-risk", { allowHighRisk: true })).toBe(true);
  });
});

describe("riskLabel", () => {
  it("labels each risk", () => {
    expect(riskLabel("safe")).toContain("safe");
    expect(riskLabel("high-risk")).toContain("--allow-high-risk");
  });
});

describe("POLICY_NOTES", () => {
  it("cites AUP for high-risk", () => {
    expect(POLICY_NOTES["high-risk"]).toContain("Acceptable Use Policies");
    expect(POLICY_NOTES["high-risk"]).toContain("rank abuse");
  });

  it("covers every non-safe risk", () => {
    for (const risk of ["high-risk"] as Exclude<PolicyRisk, "safe">[]) {
      expect(POLICY_NOTES[risk].length).toBeGreaterThan(0);
    }
  });
});
