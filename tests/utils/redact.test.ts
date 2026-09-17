import { describe, expect, it } from "vitest";
import { REDACTED, redactSecrets, redactValue } from "../../src/utils/redact.js";

describe("redactSecrets", () => {
  it("redacts classic PATs", () => {
    expect(redactSecrets("token ghp_1234567890abcdefghijklmnopqrstuvwxyz")).toContain(REDACTED);
  });

  it("redacts fine-grained PATs", () => {
    expect(redactSecrets("use github_pat_1234567890abcdefghijklmnopqrstuvwxyz12345")).toContain(REDACTED);
  });

  it("redacts OAuth tokens", () => {
    expect(redactSecrets("gho_1234567890abcdefghijklmnopqrstuvwxyz ")).toContain(REDACTED);
  });

  it("redacts key=value secrets", () => {
    expect(redactSecrets("Authorization: Bearer deadbeefcafebabedeadbeefcafebabe")).not.toMatch(
      /Bearer\s+deadbeefcafebabedeadbeefcafebabe/,
    );
  });

  it("leaves normal text alone", () => {
    expect(redactSecrets("hello world, this is a normal message")).toBe(
      "hello world, this is a normal message",
    );
  });

  it("does not leak the original secret", () => {
    const secret = "ghp_abcdef0123456789abcdef0123456789";
    const redacted = redactSecrets(`my token is ${secret}`);
    expect(redacted).not.toContain(secret);
  });
});

describe("redactValue", () => {
  it("redacts string values", () => {
    expect(redactValue("ghp_1234567890abcdefghijklmnopqrstuvwxyz")).toBe(REDACTED);
  });

  it("redacts keys whose name suggests a secret", () => {
    expect(redactValue({ token: "abc", normal: "value" })).toEqual({
      token: REDACTED,
      normal: "value",
    });
  });

  it("handles arrays", () => {
    const values: unknown = redactValue(["a", "ghp_1234567890abcdefghijklmnopqrstuvwxyz"]);
    expect(Array.isArray(values)).toBe(true);
    expect(Array.isArray(values) ? values[1] : undefined).toBe(REDACTED);
  });

  it("handles nested objects", () => {
    expect(redactValue({ nested: { token: "x" } })).toEqual({ nested: { token: REDACTED } });
  });

  it("passes through non-strings and non-objects", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(null)).toBe(null);
  });
});