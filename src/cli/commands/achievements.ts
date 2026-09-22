import type { GafPaths } from "../../config/paths.js";
import { ProgressStore } from "../../config/progress.js";
import { createAchievementRegistry } from "../../achievements/achievement-registry.js";
import { ACHIEVEMENT_CATALOG } from "../../achievements/catalog.js";
import { riskLabel, POLICY_NOTES } from "../../domain/policy.js";
import { printLine, printJson, section, table } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";
import type { ProgressEntry } from "../../config/schema.js";

/**
 * The options for the achievements list command.
 */
export interface AchievementsListOptions {
  json?: boolean;
}

/**
 * The options for the achievements progress command.
 */
export interface AchievementsProgressOptions {
  clear?: boolean;
  json?: boolean;
}

/**
 * The achievements list command.
 *
 * @param paths - The paths.
 * @param options - The options.
 * @returns The exit code.
 */
export async function achievementsListCommand(
  paths: GafPaths,
  options: AchievementsListOptions,
): Promise<number> {
  const store = new ProgressStore(paths);
  const file = await store.load();

  if (options.json === true) {
    printJson(
      ACHIEVEMENT_CATALOG.map((entry) => {
        const progress: ProgressEntry | undefined = file.entries[entry.id];
        return {
          id: entry.id,
          name: entry.name,
          automatable: entry.automatable,
          policyRisk: entry.policyRisk,
          level: progress?.level ?? 0,
          tiers: entry.tiers.map((tier) => ({
            level: tier.level,
            name: tier.name,
            requirement: tier.requirement,
            accountsRequired: tier.accountsRequired,
          })),
        };
      }),
    );
    return 0;
  }

  section("Achievements");
  printLine(
    table(
      ["id", "name", "automatable", "risk", "level", "tiers"],
      ACHIEVEMENT_CATALOG.map((entry) => {
        const progress: ProgressEntry | undefined = file.entries[entry.id];
        return [
          entry.id,
          entry.name,
          entry.automatable ? "yes" : "no",
          riskLabel(entry.policyRisk),
          String(progress?.level ?? 0),
          describeTiers(entry.tiers),
        ];
      }),
    ),
  );
  printLine();
  printLine(
    "level: badge tier you already earned (0=none, 1=default, 2=bronze, 3=silver, 4=gold).",
  );
  printLine("Record an earned tier with `gh-forge achievements progress <id> <level>`.");
  printLine(
    "`automatable = yes` means GitHub Achievement Forge can plan and execute concrete GitHub actions for it.",
  );
  printLine(
    "`high-risk` requires the explicit consent flag --allow-high-risk at execution time. See docs/SECURITY.md.",
  );
  return 0;
}

/**
 * Shows an achievement.
 *
 * @param id - The ID of the achievement.
 * @param asJson - Whether to output as JSON.
 * @returns The result code.
 */
export async function achievementsShowCommand(id: string, asJson: boolean): Promise<number> {
  const registry = createAchievementRegistry();
  const achievement = registry.tryGet(id);
  if (achievement === null) {
    throw new UsageError(`Unknown achievement "${id}"`, [
      "Known ids: " + registry.ids().sort().join(", "),
    ]);
  }
  const entry = ACHIEVEMENT_CATALOG.find((candidate) => candidate.id === id);

  if (asJson) {
    printJson({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      automatable: achievement.automatable,
      policyRisk: achievement.policyRisk,
      policyNote: POLICY_NOTES[achievement.policyRisk as keyof typeof POLICY_NOTES] ?? null,
      tiers: achievement.getTiers(),
      notes: entry?.notes ?? [],
    });
    return 0;
  }

  section(achievement.name);
  printLine(`  Id:          ${achievement.id}`);
  printLine(`  Description: ${achievement.description}`);
  printLine(`  Automatable: ${achievement.automatable ? "yes" : "no"}`);
  printLine(`  Policy risk: ${riskLabel(achievement.policyRisk)}`);

  const tiers = achievement.getTiers();
  if (tiers.length > 0) {
    section("Tiers");
    printLine(
      table(
        ["level", "name", "requirement", "accounts"],
        tiers.map((tier) => [
          String(tier.level),
          tier.name,
          String(tier.requirement),
          String(tier.accountsRequired),
        ]),
      ),
    );
  }

  if (achievement.policyRisk !== "safe") {
    const note = POLICY_NOTES[achievement.policyRisk as keyof typeof POLICY_NOTES];
    if (note !== undefined) {
      section("Risk note");
      printLine(`  ${note}`);
    }
  }

  if (entry?.notes !== undefined && entry.notes.length > 0) {
    section("Notes");
    for (const note of entry.notes) printLine(`  - ${note}`);
  }
  return 0;
}

/**
 * The achievements progress command.
 *
 * @param paths - The paths.
 * @param achievementId - The ID of the achievement.
 * @param level - The level.
 * @param options - The options.
 * @returns The exit code.
 */
export async function achievementsProgressCommand(
  paths: GafPaths,
  achievementId: string | undefined,
  level: string | undefined,
  options: AchievementsProgressOptions,
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
    printLine(
      "level: badge tier you already earned (0=none, 1=default, 2=bronze, 3=silver, 4=gold).",
    );
    printLine("Record an earned tier with `gh-forge achievements progress <id> <level>`.");
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
      printLine(
        `${achievementId}: level ${entry.level}${entry.updatedAt === undefined ? "" : ` (${entry.updatedAt})`}`,
      );
    }
    return 0;
  }

  const parsedLevel = Number(level);
  if (!Number.isInteger(parsedLevel) || parsedLevel < 0 || parsedLevel > 4) {
    throw new UsageError(`Level must be an integer between 0 and 4, received "${level}"`);
  }

  if (parsedLevel !== 0) {
    validateLevelForAchievement(achievementId, parsedLevel);
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

/**
 * Validates an achievement ID.
 *
 * @param id - The ID of the achievement.
 * @returns The result code.
 */
function validateAchievementId(id: string): void {
  const registry = createAchievementRegistry();
  if (registry.tryGet(id) === null) {
    throw new UsageError(`Unknown achievement "${id}"`, [
      "Known ids: " + registry.ids().sort().join(", "),
    ]);
  }
}

/**
 * Validates a level for an achievement.
 *
 * @param id - The ID of the achievement.
 * @param level - The level.
 * @returns The result code.
 */
function validateLevelForAchievement(id: string, level: number): void {
  const registry = createAchievementRegistry();
  const achievement = registry.tryGet(id);
  if (achievement === null) return;

  const tiers = achievement.getTiers();
  const maxLevel = tiers.length > 0 ? (tiers[tiers.length - 1]?.level ?? 0) : 0;

  if (tiers.length === 0) {
    throw new UsageError(`Achievement "${id}" has no documented tiers`, [
      "Level cannot be set for this achievement.",
    ]);
  }

  if (level > maxLevel) {
    const tierNames = tiers.map((t) => `${t.level}=${t.name}`).join(", ");
    throw new UsageError(
      `Achievement "${id}" only has ${maxLevel} tier${maxLevel === 1 ? "" : "s"} (${tierNames})`,
      [`Valid levels: 0 (none), ${tierNames}`],
    );
  }
}

/**
 * Describes the tiers of an achievement.
 *
 * @param tiers - The tiers.
 * @returns The description of the tiers.
 */
function describeTiers(tiers: { level: number; name: string; requirement: number }[]): string {
  if (tiers.length === 0) return "(none documented)";
  return tiers.map((tier) => `${tier.name}(${tier.requirement})`).join(", ");
}
