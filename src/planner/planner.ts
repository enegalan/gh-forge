import type {
  AchievementContext,
  Requirement,
  ValidationResult,
} from "../achievements/achievement.js";
import { BaseAchievement } from "../achievements/base-achievement.js";
import type { AchievementRegistry } from "../achievements/achievement-registry.js";
import type { PlannedAction } from "../domain/action.js";
import { ACTION_KIND_LABELS } from "../domain/action.js";
import type { PolicyGates, PolicyRisk } from "../domain/policy.js";
import { riskAllowed } from "../domain/policy.js";
import {
  mergeRequirements,
  summarizeAccountRequirements,
  type RequirementWithOwner,
} from "./action-planner.js";

/**
 * The achievement plan.
 */
export interface AchievementPlan {
  achievementId: string;
  name: string;
  description: string;
  currentLevel: number;
  targetLevel: number;
  currentRequirement: number;
  targetRequirement: number;
  actionsRequired: number;
  accountsRequired: number;
  helpersRequired: number;
  policyRisk: PolicyRisk;
  automatable: boolean;
  requirements: Requirement[];
  validation: ValidationResult;
}

/**
 * The plan summary.
 */
export interface PlanSummary {
  accountsConfigured: number;
  helperAccountsConfigured: number;
  accountsRequired: number;
  helperAccountsRequired: number;
  missingAccounts: number;
  missingHelpers: number;
  actionsTotal: number;
  actionsByKind: Partial<Record<PlannedAction["kind"], number>>;
  repositoriesRequired: number;
  actionsNeedingConsent: number;
  achievementsTargeted: number;
  achievementsAlreadyDone: number;
}

/**
 * The plan.
 */
export interface Plan {
  generatedAt: string;
  mainAccountId: string | null;
  sandbox: { owner: string; name: string; visibility: string };
  entries: AchievementPlan[];
  actions: PlannedAction[];
  summary: PlanSummary;
  blockers: string[];
  warnings: string[];
  readyToExecute: boolean;
}

/**
 * The create plan options.
 */
export interface CreatePlanOptions {
  registry: AchievementRegistry;
  context: AchievementContext;
  targets: Record<string, number>;
  only?: string[];
  policyGates: PolicyGates;
}

/**
 * The planned target.
 */
interface PlannedTarget {
  achievement: BaseAchievement;
  targetLevel: number;
}

/**
 * Builds the execution plan.
 *
 * @param options - The options.
 * @returns The plan.
 */
export async function createPlan(options: CreatePlanOptions): Promise<Plan> {
  const { registry, context, targets, policyGates } = options;
  const only = options.only === undefined ? null : new Set(options.only);
  const changesStaged: PlannedTarget[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const [achievementId, targetLevel] of Object.entries(targets)) {
    if (only !== null && !only.has(achievementId)) continue;
    if (targetLevel <= 0) continue;
    const achievement = registry.tryGet(achievementId);
    if (achievement === null) {
      blockers.push(`Unknown achievement "${achievementId}" in targets.`);
      continue;
    }
    changesStaged.push({ achievement, targetLevel });
  }

  // Validation is async (it probes GitHub); collect it before building entries.
  const validations = new Map<string, ValidationResult>();
  for (const { achievement } of changesStaged) {
    validations.set(
      achievement.id,
      achievement.automatable
        ? await achievement.validate(context)
        : { ok: false, issues: [], warnings: [] },
    );
  }

  const entries: AchievementPlan[] = [];
  const requirementInputs: RequirementWithOwner[] = [];
  const allRequirements: Requirement[] = [];

  for (const { achievement, targetLevel } of changesStaged) {
    const validation = validations.get(achievement.id) ?? { ok: false, issues: [], warnings: [] };
    const entry = buildEntry(achievement, targetLevel, context, validation);
    entries.push(entry);

    if (!achievement.automatable) {
      blockers.push(
        `${achievement.name} cannot be automated by GitHub Achievement Forge (no verified, automatable requirement).`,
      );
    }
    if (targetLevel > achievement.getTiers().length) {
      blockers.push(`${achievement.name} has no tier level ${targetLevel}.`);
    }
    if (!riskAllowed(entry.policyRisk, policyGates)) {
      blockers.push(
        `${achievement.name} is classified "${entry.policyRisk}" and was not consented to.`,
      );
    }
    for (const issue of validation.issues) blockers.push(`${achievement.name}: ${issue}`);
    for (const note of validation.warnings) warnings.push(`${achievement.name}: ${note}`);

    for (const requirement of entry.requirements) {
      requirementInputs.push({
        achievementId: achievement.id,
        achievementName: achievement.name,
        requirement,
      });
      allRequirements.push(requirement);
    }
  }

  const actions = mergeRequirements(requirementInputs);
  const summary = summarizePlan({ entries, actions, requirements: allRequirements, context });

  if (summary.missingAccounts > 0 || summary.missingHelpers > 0) {
    blockers.push(
      `Required accounts: ${summary.accountsRequired} (of which ${summary.helperAccountsRequired} helper). ` +
        `Configured accounts: ${summary.accountsConfigured} (of which ${summary.helperAccountsConfigured} helper). ` +
        `Missing accounts: ${Math.max(summary.missingAccounts, summary.missingHelpers)}.`,
    );
    warnings.push(
      "GitHub Achievement Forge never creates GitHub accounts and never uses accounts belonging to somebody else. Create them yourself and authenticate each one with `gh-forge accounts add`.",
    );
  }

  const uniqueBlockers = dedupe(blockers);
  const uniqueWarnings = dedupe(warnings);

  return {
    generatedAt: new Date().toISOString(),
    mainAccountId: context.mainAccount.id,
    sandbox: {
      owner: context.sandbox.owner,
      name: context.sandbox.name,
      visibility: context.sandbox.visibility,
    },
    entries,
    actions,
    summary,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    readyToExecute: uniqueBlockers.length === 0 && actions.length > 0,
  };
}

/**
 * Builds an achievement plan entry.
 *
 * @param achievement - The achievement.
 * @param targetLevel - The target level.
 * @param context - The context.
 * @param validation - The validation.
 * @returns The achievement plan entry.
 */
function buildEntry(
  achievement: BaseAchievement,
  targetLevel: number,
  context: AchievementContext,
  validation: ValidationResult,
): AchievementPlan {
  const currentLevel = achievement.currentLevel(context);
  const requirements = achievement.getRequirements(targetLevel, context);
  const accountSummary = summarizeAccountRequirements(requirements);
  return {
    achievementId: achievement.id,
    name: achievement.name,
    description: achievement.description,
    currentLevel,
    targetLevel,
    currentRequirement: achievement.requirementForLevel(currentLevel),
    targetRequirement: achievement.requirementForLevel(targetLevel),
    actionsRequired: requirements.reduce((total, requirement) => total + requirement.count, 0),
    accountsRequired: accountSummary.maxAccountsRequired,
    helpersRequired: accountSummary.helpersRequired,
    policyRisk: achievement.policyRisk,
    automatable: achievement.automatable,
    requirements,
    validation,
  };
}

/**
 * Summarizes the plan.
 *
 * @param input - The input.
 * @returns The plan summary.
 */
function summarizePlan(input: {
  entries: AchievementPlan[];
  actions: PlannedAction[];
  requirements: Requirement[];
  context: AchievementContext;
}): PlanSummary {
  const actionsByKind: Partial<Record<PlannedAction["kind"], number>> = {};
  for (const action of input.actions) {
    actionsByKind[action.kind] = (actionsByKind[action.kind] ?? 0) + 1;
  }
  const accountsRequired = input.requirements.reduce(
    (max, requirement) => Math.max(max, requirement.accountsRequired),
    0,
  );
  const helperAccountsRequired = input.requirements.reduce(
    (max, requirement) => Math.max(max, requirement.helpersRequired),
    0,
  );
  const accountsConfigured = input.context.accounts.length;
  const helperAccountsConfigured = input.context.accounts.filter(
    (account) => account.role === "helper",
  ).length;
  const achievementsAlreadyDone = input.entries.filter(
    (entry) => entry.actionsRequired === 0 && entry.currentLevel >= entry.targetLevel,
  ).length;

  return {
    accountsConfigured,
    helperAccountsConfigured,
    accountsRequired,
    helperAccountsRequired,
    missingAccounts: Math.max(0, accountsRequired - accountsConfigured),
    missingHelpers: Math.max(0, helperAccountsRequired - helperAccountsConfigured),
    actionsTotal: input.actions.length,
    actionsByKind,
    repositoriesRequired: input.actions.length > 0 ? 1 : 0,
    actionsNeedingConsent: input.actions.filter((action) => action.policyRisk !== "safe").length,
    achievementsTargeted: input.entries.length,
    achievementsAlreadyDone,
  };
}

/**
 * Describes an action kind.
 *
 * @param kind - The kind.
 * @returns The description.
 */
export function describeActionKind(kind: PlannedAction["kind"]): string {
  return ACTION_KIND_LABELS[kind];
}

/**
 * Deduplicates an array of strings.
 *
 * @param values - The values.
 * @returns The deduplicated values.
 */
function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
