import type { GafPaths } from "../../config/paths.js";
import { ProgressStore } from "../../config/progress.js";
import { printLine, printJson, section } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";
import { createAchievementRegistry } from "../../achievements/achievement-registry.js";
import type { ProgressEntry } from "../../config/schema.js";

export interface ProgressCommandOptions {
  source?: "manual" | "scraped" | "observed";
  note?: string;
  clear?: boolean;
  json?: boolean;
}

export async function progressCommand(
  paths: GafPaths,
  achievementId: string | undefined,
  level: string | undefined,
  options: ProgressCommandOptions,
): Promise<number> {
  const store = new ProgressStore(paths);

  if (achievementId !== undefined && options.clear === true) {
    await store.clear(achievementId);
    if (options.json === true) {
      printJson({ cleared: achievementId });
    } else {
      printLine(`Cleared progress for "${achievementId}".`);
    }
    return 0;
  }

  if (achievementId === undefined) {
    const file = await store.load();
    const entries = Object.entries(file.entries).sort(([a], [b]) => a.localeCompare(b));
    if (options.json === true) {
      printJson(file.entries);
      return 0;
    }
    if (entries.length === 0) {
      printLine("No known progress yet. Set levels with `gh-forge progress <id> <level>`.");
      return 0;
    }
    section("Known progress");
    for (const [id, entry] of entries) {
      printLine(`  ${id}: level ${entry.level} (${entry.source}${entry.updatedAt === undefined ? "" : `, ${entry.updatedAt}`})`);
    }
    return 0;
  }

  validateAchievementId(achievementId);
  if (level === undefined) {
    const file = await store.load();
    const entry: ProgressEntry | undefined = file.entries[achievementId];
    if (entry === undefined) {
      printLine(`No known progress for "${achievementId}".`);
      return 0;
    }
    if (options.json === true) {
      printJson(entry);
    } else {
      printLine(`${achievementId}: level ${entry.level} (${entry.source}${entry.updatedAt === undefined ? "" : `, ${entry.updatedAt}`})`);
    }
    return 0;
  }

  const parsedLevel = Number(level);
  if (!Number.isInteger(parsedLevel) || parsedLevel < 0 || parsedLevel > 4) {
    throw new UsageError(`Level must be an integer between 0 and 4, received "${level}"`);
  }

  await store.setLevel(achievementId, parsedLevel, {
    source: options.source ?? "manual",
    ...(options.note === undefined ? {} : { note: options.note }),
  });

  if (options.json === true) {
    printJson({ achievementId, level: parsedLevel, source: options.source ?? "manual" });
  } else {
    printLine(`Set ${achievementId} progress to level ${parsedLevel}.`);
  }
  return 0;
}

function validateAchievementId(id: string): void {
  const registry = createAchievementRegistry();
  if (registry.tryGet(id) === null) {
    throw new UsageError(`Unknown achievement "${id}"`, [
      "Known ids: " + registry.ids().sort().join(", "),
    ]);
  }
}