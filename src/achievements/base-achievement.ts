import type { Account } from "../accounts/account.js";
import type { PlannedAction } from "../domain/action.js";
import { actionKey } from "../utils/hash.js";
import type {
  Achievement,
  AchievementContext,
  AchievementTier,
  ExecutionResult,
  Requirement,
  ValidationResult,
} from "./achievement.js";
import { levelToTierName } from "./achievement.js";
import type { CatalogEntry } from "./catalog.js";
import { ExecutionError } from "../utils/errors.js";

/**
 * Shared behaviour for every achievement.
 *
 * Adding a new achievement means creating
 * `src/achievements/<new-achievement>/index.ts` with a class that implements
 * `getRequirements()` and `validate()`, and registering it in
 * `achievement-registry.ts`. Nothing else in the system needs to change.
 */
export abstract class BaseAchievement implements Achievement {
  /**
   * The ID of the achievement.
   */
  readonly id: string;
  /**
   * The name of the achievement.
   */
  readonly name: string;
  /**
   * The description of the achievement.
   */
  readonly description: string;
  /**
   * The policy risk of the achievement.
   */
  readonly policyRisk: CatalogEntry["policyRisk"];
  /**
   * Whether the achievement is automatable.
   */
  readonly automatable: boolean;
  /**
   * The tiers of the achievement.
   */
  protected readonly tiers: AchievementTier[];
  /**
   * The notes of the achievement.
   */
  protected readonly notes: string[];

  /**
   * Creates a new base achievement.
   *
   * @param entry - The catalog entry.
   */
  constructor(entry: CatalogEntry) {
    this.id = entry.id;
    this.name = entry.name;
    this.description = entry.description;
    this.policyRisk = entry.policyRisk;
    this.automatable = entry.automatable;
    this.tiers = entry.tiers;
    this.notes = entry.notes;
  }

  /**
   * The tiers of the achievement.
   *
   * @returns The tiers of the achievement.
   */
  getTiers(): AchievementTier[] {
    return this.tiers.map((tier) => ({ ...tier }));
  }

  /**
   * The tier of the achievement for a given level.
   *
   * @param level - The level.
   * @returns The tier of the achievement.
   */
  tier(level: number): AchievementTier | undefined {
    return this.tiers.find((tier) => tier.level === level);
  }

  /**
   * The requirement for the achievement for a given level.
   *
   * @param level - The level.
   * @returns The requirement for the achievement.
   */
  requirementForLevel(level: number): number {
    if (level <= 0) return 0;
    const tier = this.tier(level) ?? this.tiers[this.tiers.length - 1];
    return tier?.requirement ?? 0;
  }

  /**
   * The maximum level of the achievement.
   *
   * @returns The maximum level of the achievement.
   */
  maxLevel(): number {
    return this.tiers.length;
  }

  /**
   * The units still needed to move from the earned level to the target level.
   *
   * @param targetTier - The target tier.
   * @param currentLevel - The current level.
   * @returns The units still needed to move from the earned level to the target level.
   */
  unitsFor(targetTier: number, currentLevel: number): number {
    return Math.max(
      0,
      this.requirementForLevel(targetTier) - this.requirementForLevel(currentLevel),
    );
  }

  /**
   * The current level of the achievement.
   *
   * @param context - The achievement context.
   * @returns The current level of the achievement.
   */
  currentLevel(context: AchievementContext): number {
    return context.knownProgress[this.id] ?? 0;
  }

  /**
   * Expands this achievement's requirements into concrete, keyed actions.
   * `gh-forge run --only <id>` uses this path; the global planner uses
   * `getRequirements()` and merges requirements ACROSS achievements.
   *
   * @param targetTier - The target tier.
   * @param context - The achievement context.
   * @returns The actions for the achievement.
   */
  buildActions(targetTier: number, context: AchievementContext): PlannedAction[] {
    const requirements = this.getRequirements(targetTier, context);
    return requirements.flatMap((requirement) => this.actionsForRequirement(requirement));
  }

  /**
   * The actions for a given requirement.
   *
   * @param requirement - The requirement.
   * @returns The actions for the requirement.
   */
  protected actionsForRequirement(requirement: Requirement): PlannedAction[] {
    const actions: PlannedAction[] = [];
    for (let index = 0; index < requirement.count; index += 1) {
      const params = { ...requirement.params };
      const key = actionKey({ achievementId: this.id, kind: requirement.kind, index, params });
      actions.push({
        key,
        kind: requirement.kind,
        achievementIds: [this.id],
        description: `${this.name}: ${requirement.description} (#${index + 1} of ${requirement.count})`,
        requiredAccounts: requirement.accountRoles,
        params: { ...params, unitIndex: index },
        policyRisk: requirement.policyRisk,
      });
    }
    return actions;
  }

  /**
   * Validates the achievement.
   *
   * @param context - The achievement context.
   * @returns The validation result.
   */
  async validate(context: AchievementContext): Promise<ValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const target = context.config.targets[this.id] ?? 0;

    if (!this.automatable) {
      issues.push(`${this.name} cannot be automated by GitHub Achievement Forge.`);
    }
    if (this.tiers.length === 0) {
      issues.push(`${this.name} has no verified requirements, so it cannot be planned.`);
    } else if (target > this.maxLevel()) {
      issues.push(`${this.name} has no tier level ${target} (max ${this.maxLevel()}).`);
    }
    for (const requirement of this.getRequirements(target, context)) {
      if (context.accounts.length < requirement.accountsRequired) {
        issues.push(
          `${this.name} requires ${requirement.accountsRequired} accounts for this strategy but only ${context.accounts.length} are configured.`,
        );
      }
      const helpers = context.accounts.filter((account) => account.role === "helper").length;
      if (helpers < requirement.helpersRequired) {
        issues.push(
          `${this.name} requires ${requirement.helpersRequired} additional account(s) of your own (helpers) but only ${helpers} are configured.`,
        );
      }
    }
    for (const note of this.notes) warnings.push(note);
    return { ok: issues.length === 0, issues, warnings };
  }

  /**
   * Executes this achievement on its own (`gh-forge run --only <id>`). The
   * executor receives the actions and is responsible for idempotency, pacing and
   * persistence.
   *
   * @param context - The achievement context.
   * @param targetTier - The target tier.
   * @returns The execution result.
   */
  async execute(context: AchievementContext, targetTier: number): Promise<ExecutionResult> {
    if (!this.automatable) {
      throw new ExecutionError(`${this.name} cannot be executed automatically`, this.notes);
    }
    const actions = this.buildActions(targetTier, context);
    if (actions.length === 0) {
      return {
        achievementId: this.id,
        executed: 0,
        skipped: 0,
        failed: 0,
        details: [`Nothing to do: ${this.name} is already at level ${this.currentLevel(context)}.`],
      };
    }
    return context.executor.runActions(context, this.id, actions);
  }

  /**
   * Describes the progress of the achievement.
   *
   * @param targetTier - The target tier.
   * @param currentLevel - The current level.
   * @returns The description of the progress of the achievement.
   */
  protected describeProgress(targetTier: number, currentLevel: number): string {
    return `${levelToTierName(currentLevel)} -> ${levelToTierName(targetTier)}`;
  }

  /**
   * Gets the requirements for the achievement.
   *
   * @param targetTier - The target tier.
   * @param context - The achievement context.
   * @returns The requirements for the achievement.
   */
  abstract getRequirements(targetTier: number, context: AchievementContext): Requirement[];
}

/**
 * The helpers of the achievement.
 *
 * @param context - The achievement context.
 * @returns The helpers of the achievement.
 */
export function helpersOf(context: AchievementContext): Account[] {
  return context.accounts.filter((account) => account.role === "helper");
}
