import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic, content addressed key for a planned action.
 *
 * Two planner runs that describe the same logical action must produce the same
 * key; this is what makes `gh-forge run` idempotent and resumable.
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

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
