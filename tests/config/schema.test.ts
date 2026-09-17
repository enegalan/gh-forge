import { describe, expect, it } from "vitest";
import {
  accountAuthSchema,
  configSchema,
  createDefaultConfig,
  progressFileSchema,
} from "../../src/config/schema.js";

describe("configSchema", () => {
  it("parses an empty document into defaults", () => {
    const config = configSchema.parse({});
    expect(config.version).toBe(1);
    expect(config.mainAccount).toBeNull();
    expect(config.accounts).toEqual({});
    expect(config.targets).toEqual({});
    expect(config.repositories.sandbox).toBeNull();
    expect(config.policy.allowOptIn).toBe(false);
    expect(config.policy.allowHighRisk).toBe(false);
    expect(config.execution.minIntervalMs).toBe(1500);
    expect(config.profileScan.enabled).toBe(false);
  });

  it("rejects an unknown top-level version", () => {
    expect(() => configSchema.parse({ version: 2 })).toThrow();
  });

  it("clamps invalid target values", () => {
    const config = configSchema.parse({ targets: { "pull-shark": 3 } });
    expect(config.targets["pull-shark"]).toBe(3);
  });

  it("rejects a target outside 1..4", () => {
    expect(() => configSchema.parse({ targets: { x: 0 } })).toThrow();
    expect(() => configSchema.parse({ targets: { x: 5 } })).toThrow();
  });

  it("accepts a full account config", () => {
    const config = configSchema.parse({
      mainAccount: "main",
      accounts: {
        main: {
          username: "octocat",
          role: "main",
          auth: { kind: "gh", login: "octocat" },
          commitEmail: "octocat@github.com",
        },
        helper1: {
          username: "octohelper",
          role: "helper",
          auth: { kind: "env", var: "GH_FORGE_TOKEN__HELPER_1" },
        },
      },
    });
    expect(config.accounts["main"]?.auth.kind).toBe("gh");
    expect(config.accounts["helper1"]?.auth.kind).toBe("env");
    expect(config.accounts["helper1"]?.auth).not.toContain("token");
  });

  it("supports token command auth", () => {
    const result = accountAuthSchema.safeParse({
      kind: "tokenCommand",
      command: "security find-generic-password -s gh-forge -w",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown auth kinds", () => {
    const result = accountAuthSchema.safeParse({ kind: "bogus" });
    expect(result.success).toBe(false);
  });

  it("sanitises sandbox settings", () => {
    const config = configSchema.parse({
      repositories: {
        sandbox: {
          owner: "octocat",
          name: "sandbox-test",
          visibility: "private",
          discussions: false,
        },
      },
    });
    expect(config.repositories.sandbox?.owner).toBe("octocat");
    expect(config.repositories.sandbox?.name).toBe("sandbox-test");
    expect(config.repositories.sandbox?.visibility).toBe("private");
    expect(config.repositories.sandbox?.discussions).toBe(false);
  });
});

describe("createDefaultConfig", () => {
  it("returns a valid default config", () => {
    const config = createDefaultConfig();
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("progressFileSchema", () => {
  it("parses an empty progress file", () => {
    const file = progressFileSchema.parse({});
    expect(file.entries).toEqual({});
  });

  it("parses entries with source labels", () => {
    const file = progressFileSchema.parse({
      entries: {
        "pull-shark": { level: 2, source: "scraped", updatedAt: "2026-09-16T12:00:00Z" },
      },
    });
    expect(file.entries["pull-shark"]?.level).toBe(2);
    expect(file.entries["pull-shark"]?.source).toBe("scraped");
  });

  it("rejects levels outside 0..4", () => {
    expect(() => progressFileSchema.parse({ entries: { x: { level: 5 } } })).toThrow();
    expect(() => progressFileSchema.parse({ entries: { x: { level: -1 } } })).toThrow();
  });
});