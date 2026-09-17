/**
 * Secret redaction.
 *
 * GAF must never print tokens. Any string that is about to be logged, rendered
 * to the terminal, persisted in state or embedded in an error message goes
 * through `redactSecrets` first.
 */

const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, // ghp_, gho_, ghu_, ghs_, ghr_
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bv1\.[A-Za-z0-9_]{40,}\b/g,
  /\b(?:token|password|secret|authorization)\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
];

export const REDACTED = "***redacted***";

export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/token|password|secret|authorization/i.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactValue(entry);
      }
    }
    return result;
  }
  return value;
}
