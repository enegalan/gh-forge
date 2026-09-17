import type { GafPaths } from "../../config/paths.js";
import { ProgressStore } from "../../config/progress.js";
import { printLine, printJson, section } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";
import { createAchievementRegistry } from "../../achievements/achievement-registry.js";
import type { ProgressEntry } from "../../config/schema.js";

export interface ProgressCommandOptions {
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
    if (options.json === true) {
      printJson(file.entries);
      return 0;
    }
    const achievements = createAchievementRegistry()
      .all()
      .sort((a, b) => a.id.localeCompare(b.id));
    if (achievements.length === 0) {
      printLine("No achievements in the catalogue.");
      return 0;
    }
    const idWidth = Math.max(...achievements.map((achievement) => achievement.id.length));
    const nameWidth = Math.max(...achievements.map((achievement) => achievement.name.length));
    section("Achievement progress");
    printLine(`  ${"id".padEnd(idWidth)}  ${"name".padEnd(nameWidth)}  level`);
    printLine(`  ${"-".repeat(idWidth)}  ${"-".repeat(nameWidth)}  -----`);
    for (const achievement of achievements) {
      const entry: ProgressEntry | undefined = file.entries[achievement.id];
      printLine(
        `  ${achievement.id.padEnd(idWidth)}  ${achievement.name.padEnd(nameWidth)}  ${entry === undefined || entry.level === 0 ? "0" : String(entry.level)}`,
      );
    }
    printLine();
    printLine("level: badge tier you already earned (0=none, 1=default, 2=bronze, 3=silver, 4=gold).");
    printLine("Record an earned tier with `gh-forge progress <id> <level>`.");
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
      printLine(`${achievementId}: level ${entry.level}${entry.updatedAt === undefined ? "" : ` (${entry.updatedAt})`}`);
    }
    return 0;
  }

  const parsedLevel = Number(level);
  if (!Number.isInteger(parsedLevel) || parsedLevel < 0 || parsedLevel > 4) {
    throw new UsageError(`Level must be an integer between 0 and 4, received "${level}"`);
  }

  if (parsedLevel === 0) {
    await store.clear(achievementId);
    if (options.json === true) {
      printJson({ achievementId, level: 0 });
    } else {
      printLine(`Cleared ${achievementId} progress (level 0 = not earned yet).`);
    }
    return 0;
  }

  await store.setLevel(achievementId, parsedLevel);

  if (options.json === true) {
    printJson({ achievementId, level: parsedLevel });
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