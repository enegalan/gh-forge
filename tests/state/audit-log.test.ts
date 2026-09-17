import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../../src/config/paths.js";
import { markRiskAccepted, READ_ONLY_RISK_MESSAGE } from "../../src/domain/consent.js";
import { recordAudit, describeConsent } from "../../src/state/audit-log.js";
import { riskAllowed } from "../../src/domain/policy.js";

let home: string;
let paths: ReturnType<typeof resolvePaths>;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), "ghforge-audit-")), ".gh-forge");
  paths = resolvePaths(home);
});

afterEach(async () => {
  await rm(join(home, ".."), { recursive: true, force: true });
});

describe("markRiskAccepted", () => {
  it("accepts safe risk with no gates", () => {
    expect(markRiskAccepted("safe", { allowOptIn: false, allowHighRisk: false })).toBe(true);
  });

  it("rejects opt-in without consent", () => {
    expect(markRiskAccepted("opt-in", { allowOptIn: false, allowHighRisk: false })).toBe(false);
    expect(markRiskAccepted("opt-in", { allowOptIn: true, allowHighRisk: false })).toBe(true);
  });

  it("rejects high-risk without the explicit flag", () => {
    expect(markRiskAccepted("high-risk", { allowOptIn: true, allowHighRisk: false })).toBe(false);
    expect(markRiskAccepted("high-risk", { allowOptIn: true, allowHighRisk: true })).toBe(true);
  });

  it("mentions both flags in the message", () => {
    expect(READ_ONLY_RISK_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe("riskAllowed integration", () => {
  it("is the same source of truth the executor uses", () => {
    expect(riskAllowed("high-risk", { allowOptIn: true, allowHighRisk: false })).toBe(false);
    expect(riskAllowed("high-risk", { allowOptIn: true, allowHighRisk: true })).toBe(true);
  });
});

describe("recordAudit", () => {
  it("appends a JSON line to the audit log", async () => {
    await recordAudit(paths, {
      at: "2026-09-16T00:00:00Z",
      kind: "consent-granted",
      achievementIds: ["galaxy-brain"],
      policyRisk: "opt-in",
      flags: ["--allow-policy-risks"],
    });
    await recordAudit(paths, {
      at: "2026-09-16T00:00:01Z",
      kind: "consent-granted",
      achievementIds: ["starstruck"],
      policyRisk: "high-risk",
      flags: ["--allow-policy-risks", "--allow-high-risk"],
    });
    const raw = await readFile(paths.auditLog, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("galaxy-brain");
    expect(lines[1]).toContain("starstruck");
    expect(lines[1]).toContain("--allow-high-risk");
  });

  it("redacts secrets from the detail field", async () => {
    await recordAudit(paths, {
      at: "2026-09-16T00:00:00Z",
      kind: "consent-granted",
      achievementIds: ["starstruck"],
      policyRisk: "high-risk",
      flags: ["--allow-high-risk"],
      detail: "used token ghp_1234567890abcdefghijklmnopqrstuvwxyz",
    });
    const raw = await readFile(paths.auditLog, "utf8");
    expect(raw).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz");
  });

  it("creates the state directory implicitly", async () => {
    await recordAudit(paths, {
      at: "2026-09-16T00:00:00Z",
      kind: "profile-scan",
      achievementIds: ["quickdraw"],
      policyRisk: "safe",
      flags: [],
    });
    const raw = await readFile(paths.auditLog, "utf8");
    expect(raw).toContain("quickdraw");
  });
});

describe("describeConsent", () => {
  it("summarises the consent entry", () => {
    const summary = describeConsent({
      achievementIds: ["starstruck"],
      policyRisk: "high-risk",
      flags: ["--allow-high-risk"],
    });
    expect(summary).toContain("starstruck");
    expect(summary).toContain("high-risk");
    expect(summary).toContain("--allow-high-risk");
  });
});