import type { Account } from "../accounts/account.js";
import type { AccountCapabilities } from "../accounts/capabilities.js";
import type { Config } from "../config/schema.js";
import type { ActionKind, PlannedAction } from "../domain/action.js";
import type { PolicyGates, PolicyRisk } from "../domain/policy.js";
import type { GitHubClient } from "../github/github-client.js";
import type { RunState } from "../state/execution-state.js";
import type { Logger } from "../utils/logger.js";

export type TierName = "default" | "bronze" | "silver" | "gold";

/**
 * Tier levels are normalised as 0..4 where 0 means "not earned yet":
 *   1 = default, 2 = bronze, 3 = silver, 4 = gold
 * `requirement` is cumulative (silver implies bronze implies default).
 */
export interface AchievementTier {
  level: number;
  name: TierName;
  requirement: number;
  /**
   * How many distinct accounts the strategy needs for this tier. It is NOT
   * derived from `requirement`: it comes from the concrete strategy.
   */
  accountsRequired: number;
}

/**
 * Where the numbers come from. GitHub does not publish achievement
 * requirements, so every value must be traceable and dated.
 */
export interface RequirementProvenance {
  source: "official" | "community" | "observed";
  url?: string;
  verifiedAt: string;
  confidence: "high" | "medium" | "low" | "unknown";
  notes?: string;
}

export interface Requirement {
  id: string;
  kind: ActionKind;
  count: number;
  /** Total accounts needed for this strategy (main + helpers). */
  accountsRequired: number;
  /** How many of those must be helper accounts. */
  helpersRequired: number;
  accountRoles: PlannedAccountRole[];
  policyRisk: PolicyRisk;
  params: Record<string, unknown>;
  description: string;
}

export interface PlannedAccountRole {
  role: "main" | "helper";
  index: number;
  purpose: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

export interface ExecutionResult {
  achievementId: string;
  executed: number;
  skipped: number;
  failed: number;
  details: string[];
}

export interface SandboxTarget {
  owner: string;
  name: string;
  visibility: "public" | "private";
  discussions: boolean;
}

export interface AchievementContext {
  mainAccount: Account;
  accounts: Account[];
  accountCapabilities: Map<string, AccountCapabilities>;
  /** Client authenticated as the main account. */
  github: GitHubClient;
  /** Client authenticated as any configured account. */
  clientFor(accountId: string): GitHubClient;
  knownProgress: Record<string, number>;
  executionState: RunState | null;
  config: Config;
  sandbox: SandboxTarget;
  logger: Logger;
  policyGates: PolicyGates;
  /** Implemented by the executor; declared here to avoid a circular import. */
  executor: AchievementExecutor;
}

export interface AchievementExecutor {
  runActions(context: AchievementContext, achievementId: string, actions: PlannedAction[]): Promise<ExecutionResult>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  policyRisk: PolicyRisk;
  provenance: RequirementProvenance;
  /** false for retired or unknown-requirement achievements (e.g. Heart On Your Sleeve). */
  automatable: boolean;

  getTiers(): AchievementTier[];
  /** Cumulative units needed to reach a tier level (0 = nothing earned). */
  requirementForLevel(level: number): number;
  getRequirements(targetTier: number, context: AchievementContext): Requirement[];
  /** Concrete, idempotent actions that satisfy the requirements. */
  buildActions(targetTier: number, context: AchievementContext): PlannedAction[];
  validate(context: AchievementContext): Promise<ValidationResult>;
  execute(context: AchievementContext, targetTier: number): Promise<ExecutionResult>;
}

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