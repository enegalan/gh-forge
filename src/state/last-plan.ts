import type { GafPaths } from "../config/paths.js";
import { readJson, writeJsonAtomic } from "../utils/fs-atomic.js";

/**
 * Targets used by the most recent `gh-forge plan`.
 *
 * `plan` is a preview and never touches GitHub, but remembering the targets it
 * used is what makes `gh-forge run` execute the plan the
 * user just saw instead of silently re-planning from empty config targets.
 * Explicit `--target` flags on `run` always win over this file.
 */
const LAST_PLAN_VERSION = 1;

interface LastPlanFile {
  version: typeof LAST_PLAN_VERSION;
  updatedAt: string;
  targets: Record<string, number>;
}

export async function saveLastPlanTargets(paths: GafPaths, targets: Record<string, number>): Promise<void> {
  const file: LastPlanFile = {
    version: LAST_PLAN_VERSION,
    updatedAt: new Date().toISOString(),
    targets,
  };
  await writeJsonAtomic(paths.planFile, file);
}

/** Returns the stored targets, or null when no plan has been generated yet. */
export async function loadLastPlanTargets(paths: GafPaths): Promise<Record<string, number> | null> {
  const raw = await readJson<unknown>(paths.planFile);
  if (raw === null || typeof raw !== "object") return null;
  const maybe = raw as Partial<LastPlanFile>;
  if (typeof maybe.targets !== "object" || maybe.targets === null) return null;
  const targets: Record<string, number> = {};
  for (const [id, level] of Object.entries(maybe.targets)) {
    if (typeof level === "number" && Number.isInteger(level) && level >= 0 && level <= 4) {
      targets[id] = level;
    }
  }
  return targets;
}
