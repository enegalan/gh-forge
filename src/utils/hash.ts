import { createHash } from "node:crypto";

/**
 * Computes the SHA-256 hash of a string.
 *
 * @param input - The input.
 * @returns The SHA-256 hash.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * A deterministic, content addressed key for a planned action.
 *
 * Two planner runs that describe the same logical action must produce the same
 * key; this is what makes `gh-forge run` idempotent and resumable.
 *
 * @param parts - The parts.
 * @returns The action key.
 */
export function actionKey(parts: {
  achievementId: string;
  kind: string;
  index: number;
  params?: Record<string, unknown>;
}): string {
  const params = parts.params === undefined ? "" : stableStringify(parts.params);
  const material = [parts.achievementId, parts.kind, String(parts.index), params].join("|");
  return sha256Hex(material).slice(0, 16);
}

/**
 * Stable stringifies a value.
 *
 * @param value - The value.
 * @returns The stable stringified value.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
