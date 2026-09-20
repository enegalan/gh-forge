import type { GafPaths } from "../config/paths.js";
import { appendLine, ensureDir } from "../utils/fs-atomic.js";
import { dirname } from "node:path";
import { redactSecrets } from "../utils/redact.js";
import type { PolicyRisk } from "../domain/policy.js";

/**
 * The audit entry.
 */
export interface AuditEntry {
  at: string;
  kind: string;
  achievementIds: string[];
  policyRisk: PolicyRisk | "safe";
  flags: string[];
  detail?: string;
}

/**
 * Records an audit entry.
 *
 * Consent audit log at ~/.gh-forge/state/audit.log.
 *
 * Every high-risk execution is appended here together with the exact
 * flags that were passed, so there is a durable record of the explicit consent
 * that GitHub Achievement Forge asked for and received.
 *
 * @param paths - The paths.
 * @param entry - The entry.
 * @returns The void.
 */
export async function recordAudit(paths: GafPaths, entry: AuditEntry): Promise<void> {
  const line = [
    JSON.stringify({
      at: entry.at,
      kind: entry.kind,
      achievementIds: entry.achievementIds,
      policyRisk: entry.policyRisk,
      flags: entry.flags,
      ...(entry.detail === undefined ? {} : { detail: redactSecrets(entry.detail) }),
    }),
  ].join("|");
  await ensureDir(dirname(paths.auditLog));
  await appendLine(paths.auditLog, line);
}

/**
 * Describes a consent entry.
 *
 * @param entry - The entry.
 * @returns The description.
 */
export function describeConsent(
  entry: Pick<AuditEntry, "achievementIds" | "policyRisk" | "flags">,
): string {
  return [
    `achievements=${entry.achievementIds.join(",")}`,
    `risk=${entry.policyRisk}`,
    `flags=${entry.flags.join(",")}`,
  ].join(" ");
}
