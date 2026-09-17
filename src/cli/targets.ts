import type { Config } from "../config/schema.js";
import type { AchievementRegistry } from "../achievements/achievement-registry.js";
import { UsageError } from "../utils/errors.js";
import { parseKeyValue, parseNumber } from "./ui/format.js";

export interface TargetOverride {
  id: string;
  level: number;
}

/**
 * Parses `--target <id>=<level>` CLI arguments into a Record<achievementId, level>.
 * Levels are clamped to 0..4 (0 clears the target).
 */
export function parseTargets(pairs: string[]): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const pair of pairs) {
    const [id, value] = parseKeyValue(pair, "--target");
    const level = Math.round(parseNumber(value, "--target"));
    if (level < 0 || level > 4) {
      throw new UsageError(`--target ${id}=${value}: level must be between 0 and 4`);
    }
    targets[id] = level;
  }
  return targets;
}

/** Builds the default planning targets from `config.targets`. */
export function defaultTargets(config: Config): Record<string, number> {
  return { ...config.targets };
}

/** Fails if any --only id is not a known achievement. */
export function validateAchievementIds(ids: string[], registry: AchievementRegistry): void {
  const known = new Set(registry.ids());
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new UsageError(
      `Unknown achievement${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
      ["Known ids: " + [...known].sort().join(", ")],
    );
  }
}