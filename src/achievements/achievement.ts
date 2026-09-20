import type { Account, AccountRole } from "../accounts/account.js";
import type { AccountCapabilities } from "../accounts/capabilities.js";
import type { Config } from "../config/schema.js";
import type { ActionKind, PlannedAction } from "../domain/action.js";
import type { PolicyGates, PolicyRisk } from "../domain/policy.js";
import type { GitHubClient } from "../github/github-client.js";
import type { RunState } from "../state/execution-state.js";
import type { Logger } from "../utils/logger.js";

/**
 * Tier names.
 */
export type TierName = "default" | "bronze" | "silver" | "gold";

/**
 * Achievement tiers are normalised as 0..4 where 0 means "not earned yet":
 *   1 = default, 2 = bronze, 3 = silver, 4 = gold
 * `requirement` is cumulative (each tier requires the previous tiers):
 * - default(1): default(1)
 * - bronze(2): default(1) + bronze(2)
 * - silver(3): default(1) + bronze(2) + silver(3)
 * - gold(4): default(1) + bronze(2) + silver(3) + gold(4)
 */
export interface AchievementTier {
  level: number;
  name: TierName;
  requirement: number;
  accountsRequired: number;
}

/**
 * A requirement is a concrete, idempotent action that satisfies a tier.
 */
export interface Requirement {
  id: string;
  kind: ActionKind;
  count: number;
  accountsRequired: number;
  helpersRequired: number;
  accountRoles: PlannedAccountRole[];
  policyRisk: PolicyRisk;
  params: Record<string, unknown>;
  description: string;
}

/**
 * A planned account role is a main or helper account that is part of the strategy.
 */
interface PlannedAccountRole {
  role: AccountRole;
  index: number;
  purpose: string;
}

/**
 * A validation result is the outcome of validating an achievement.
 */
export interface ValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * An execution result is the outcome of executing an achievement.
 */
export interface ExecutionResult {
  achievementId: string;
  executed: number;
  skipped: number;
  failed: number;
  details: string[];
}

/**
 * A sandbox target is the repository that is used to test the achievement.
 */
export interface SandboxTarget {
  owner: string;
  name: string;
  visibility: "public" | "private";
  discussions: boolean;
}

/**
 * An achievement context is the context in which an achievement is executed.
 */
export interface AchievementContext {
  mainAccount: Account;
  accounts: Account[];
  accountCapabilities: Map<string, AccountCapabilities>;
  github: GitHubClient;
  clientFor(accountId: string): GitHubClient;
  knownProgress: Record<string, number>;
  executionState: RunState | null;
  config: Config;
  sandbox: SandboxTarget;
  logger: Logger;
  policyGates: PolicyGates;
  executor: AchievementExecutor;
}

/**
 * An achievement executor is the object that executes an achievement.
 */
export interface AchievementExecutor {
  runActions(
    context: AchievementContext,
    achievementId: string,
    actions: PlannedAction[],
  ): Promise<ExecutionResult>;
}

/**
 * An achievement is a concrete, idempotent action that satisfies a tier.
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  policyRisk: PolicyRisk;
  automatable: boolean;

  getTiers(): AchievementTier[];
  requirementForLevel(level: number): number;
  getRequirements(targetTier: number, context: AchievementContext): Requirement[];
  buildActions(targetTier: number, context: AchievementContext): PlannedAction[];
  validate(context: AchievementContext): Promise<ValidationResult>;
  execute(context: AchievementContext, targetTier: number): Promise<ExecutionResult>;
}

/**
 * Converts a tier name to a level.
 *
 * @param name - The tier name.
 * @returns The level.
 */
export function tierNameToLevel(name: TierName): number {
  switch (name) {
    case "default":
      return 1;
    case "bronze":
      return 2;
    case "silver":
      return 3;
    case "gold":
      return 4;
  }
}

/**
 * Converts a level to a tier name.
 *
 * @param level - The level.
 * @returns The tier name.
 */
export function levelToTierName(level: number): TierName | "none" {
  switch (level) {
    case 0:
      return "none";
    case 1:
      return "default";
    case 2:
      return "bronze";
    case 3:
      return "silver";
    case 4:
      return "gold";
    default:
      return "none";
  }
}
