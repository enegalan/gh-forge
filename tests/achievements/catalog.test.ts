import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  findCatalogEntry,
  requireCatalogEntry,
  catalogIds,
  automatableCatalogEntries,
  tiersFromThresholds,
  CATALOG_VERIFIED_AT,
  COMMUNITY_SOURCE_URL,
} from "../../src/achievements/catalog.js";

describe("catalog", () => {
  it("has exactly the 11 known entries", () => {
    expect(catalogIds().length).toBe(11);
  });

  it("each entry carries a policy risk", () => {
    for (const entry of ACHIEVEMENT_CATALOG) {
      expect(["safe", "opt-in", "high-risk"]).toContain(entry.policyRisk);
    }
  });

  it("marks the 6 automatable entries", () => {
    const expected = ["quickdraw", "pull-shark", "yolo", "pair-extraordinaire", "galaxy-brain", "starstruck"].sort();
    expect(
      automatableCatalogEntries()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(expected);
  });

  it("classifies galaxy-brain as opt-in", () => {
    expect(findCatalogEntry("galaxy-brain")?.policyRisk).toBe("opt-in");
  });

  it("classifies starstruck as high-risk", () => {
    expect(findCatalogEntry("starstruck")?.policyRisk).toBe("high-risk");
  });

  it("every automatable entry has at least one tier", () => {
    for (const entry of automatableCatalogEntries()) {
      expect(entry.tiers.length).toBeGreaterThan(0);
    }
  });

  it("verification date matches the documented pull request date", () => {
    expect(CATALOG_VERIFIED_AT).toBe("2026-09-16");
    expect(COMMUNITY_SOURCE_URL).toMatch(/github\.com/);
  });

  it("findCatalogEntry returns undefined for unknown ids", () => {
    expect(findCatalogEntry("nope")).toBeUndefined();
  });

  it("requireCatalogEntry throws for unknown ids", () => {
    expect(() => requireCatalogEntry("nope")).toThrow();
  });
});

describe("tiersFromThresholds", () => {
  it("builds cumulative tiers from thresholds", () => {
    const tiers = tiersFromThresholds([2, 16, 128, 1024], () => 1);
    expect(tiers).toEqual([
      { level: 1, name: "default", requirement: 2, accountsRequired: 1 },
      { level: 2, name: "bronze", requirement: 16, accountsRequired: 1 },
      { level: 3, name: "silver", requirement: 128, accountsRequired: 1 },
      { level: 4, name: "gold", requirement: 1024, accountsRequired: 1 },
    ]);
  });

  it("names tiers default/bronze/silver/gold", () => {
    const tiers = tiersFromThresholds([1], () => 1);
    expect(tiers[0]?.name).toBe("default");
  });

  it("accountsRequired is delegated per level", () => {
    const tiers = tiersFromThresholds([16, 128], (_level, requirement) => requirement);
    expect(tiers[0]?.accountsRequired).toBe(16);
    expect(tiers[1]?.accountsRequired).toBe(128);
  });
});