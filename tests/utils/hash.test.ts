import { describe, expect, it } from "vitest";
import { actionKey, sha256Hex, stableStringify } from "../../src/utils/hash.js";

describe("sha256Hex", () => {
  it("returns hex of fixed length", () => {
    expect(sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });

  it("differs for different inputs", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});

describe("stableStringify", () => {
  it("orders object keys deterministically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("handles arrays", () => {
    expect(stableStringify([1, 2, 3])).toBe(stableStringify([1, 2, 3]));
  });

  it("handles primitives", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(42)).toBe("42");
  });
});

describe("actionKey", () => {
  it("is deterministic for the same plan parts", () => {
    const a = actionKey({ achievementId: "pull-shark", kind: "merged-pull-request", index: 0 });
    const b = actionKey({ achievementId: "pull-shark", kind: "merged-pull-request", index: 0 });
    expect(a).toBe(b);
  });

  it("changes when the kind changes", () => {
    expect(actionKey({ achievementId: "a", kind: "close-issue-fast", index: 0 })).not.toBe(
      actionKey({ achievementId: "a", kind: "merged-pull-request", index: 0 }),
    );
  });

  it("changes when the unit index changes", () => {
    expect(actionKey({ achievementId: "a", kind: "k", index: 0 })).not.toBe(
      actionKey({ achievementId: "a", kind: "k", index: 1 }),
    );
  });

  it("is independent of object property order in params", () => {
    const a = actionKey({ achievementId: "a", kind: "k", index: 0, params: { x: 1, y: 2 } });
    const b = actionKey({ achievementId: "a", kind: "k", index: 0, params: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });

  it("truncates to 16 hex chars", () => {
    expect(actionKey({ achievementId: "a", kind: "k", index: 0 })).toMatch(/^[0-9a-f]{16}$/);
  });
});