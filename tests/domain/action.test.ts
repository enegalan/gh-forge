import { describe, expect, it } from "vitest";
import {
  ACTION_KIND_LABELS,
  CAPABILITIES_BY_KIND,
  familyOf,
  isCapabilitySuperset,
  summarizeActions,
  type ActionKind,
} from "../../src/domain/action.js";

describe("ACTION_KIND_LABELS", () => {
  it("labels every action kind", () => {
    const kinds: ActionKind[] = [
      "close-issue-fast",
      "merged-pull-request",
      "co-authored-merged-pull-request",
      "accepted-discussion-answer",
      "repository-star",
    ];
    for (const kind of kinds) {
      expect(ACTION_KIND_LABELS[kind]).toBeTruthy();
    }
  });
});

describe("CAPABILITIES_BY_KIND", () => {
  it("co-authored merged PR implies merged PR capability", () => {
    expect(CAPABILITIES_BY_KIND["co-authored-merged-pull-request"]).toContain("merged-pr");
    expect(CAPABILITIES_BY_KIND["co-authored-merged-pull-request"]).toContain("co-authored");
  });

  it("a plain merged PR only satisfies merged-pr", () => {
    expect(CAPABILITIES_BY_KIND["merged-pull-request"]).toEqual(["merged-pr"]);
  });
});

describe("familyOf", () => {
  it("groups merged PR kinds into the same family", () => {
    expect(familyOf("merged-pull-request")).toBe("merged-pr");
    expect(familyOf("co-authored-merged-pull-request")).toBe("merged-pr");
  });

  it("each kind maps to its first capability", () => {
    for (const [kind, capabilities] of Object.entries(CAPABILITIES_BY_KIND)) {
      expect(familyOf(kind as ActionKind)).toBe(capabilities[0]);
    }
  });
});

describe("isCapabilitySuperset", () => {
  it("returns false for unrelated sets", () => {
    expect(isCapabilitySuperset(["merged-pr"], ["star"])).toBe(false);
  });

  it("returns true for equal sets", () => {
    expect(isCapabilitySuperset(["merged-pr"], ["merged-pr"])).toBe(true);
  });

  it("returns true when superset contains everything the subset asks for", () => {
    expect(isCapabilitySuperset(["merged-pr", "co-authored"], ["merged-pr"])).toBe(true);
  });

  it("returns false when a capability is missing", () => {
    expect(isCapabilitySuperset(["merged-pr"], ["merged-pr", "co-authored"])).toBe(false);
  });
});

describe("summarizeActions", () => {
  it("counts each status", () => {
    const summary = summarizeActions([
      { status: "done" },
      { status: "done" },
      { status: "pending" },
      { status: "failed" },
      { status: "skipped" },
      { status: "in_flight" },
      { status: "unknown-status" },
    ]);
    expect(summary).toEqual({
      total: 7,
      pending: 1,
      done: 2,
      failed: 1,
      skipped: 1,
      inFlight: 1,
    });
  });

  it("ignores unrecognised statuses", () => {
    expect(summarizeActions([{ status: "bogus" }])).toEqual({
      total: 1,
      pending: 0,
      done: 0,
      failed: 0,
      skipped: 0,
      inFlight: 0,
    });
  });
});