import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement, helpersOf } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * Starstruck — stars on a repository owned by the account.
 *
 * Strategy: each star must come from a different account (one account can only
 * star a repository once), so `accountsRequired` equals the number of stars
 * still missing. The main account cannot star its own repository, so planets
 * must come from helper accounts.
 */
export class StarstruckAchievement extends BaseAchievement {
  /**
   * Creates a new Starstruck achievement.
   */
  constructor() {
    super(requireCatalogEntry("starstruck"));
  }

  /**
   * Gets the requirements for the achievement.
   *
   * @param targetTier - The target tier.
   * @param context - The achievement context.
   * @returns The requirements.
   */
  override getRequirements(targetTier: number, context: AchievementContext): Requirement[] {
    const units = this.unitsFor(targetTier, this.currentLevel(context));
    if (units === 0) return [];
    const role = {
      role: "helper" as const,
      index: 0,
      purpose: `star ${context.sandbox.owner}/${context.sandbox.name} (one account per star)`,
    };
    return [
      {
        id: "stars",
        kind: "repository-star",
        count: units,
        accountsRequired: units,
        helpersRequired: units,
        accountRoles: [role],
        policyRisk: "high-risk",
        params: { repository: `${context.sandbox.owner}/${context.sandbox.name}` },
        description: `star ${context.sandbox.owner}/${context.sandbox.name} with a distinct account`,
      },
    ];
  }

  /**
   * Validates the achievement.
   *
   * @param context - The achievement context.
   * @returns The validation result.
   */
  override async validate(context: AchievementContext): Promise<ValidationResult> {
    const base = await super.validate(context);
    const helpers = helpersOf(context);
    const target = context.config.targets[this.id] ?? 0;
    const missing = this.unitsFor(target, this.currentLevel(context));

    if (missing > 0) {
      base.warnings.push(
        "Starstruck cannot be executed from a single account: GitHub counts one star per account per repository.",
      );
      if (helpers.length < missing) {
        base.issues.push(
          `Required accounts: ${missing} (one per star). Configured accounts: ${helpers.length}. Missing accounts: ${missing - helpers.length}.`,
        );
        base.warnings.push(
          "GitHub Achievement Forge never creates accounts and never automates identity creation. Create the accounts yourself, then authenticate each one with `gh-forge accounts add`.",
        );
      }
      if (context.sandbox.visibility === "private") {
        base.issues.push(
          "The starred repository must be reachable by every account; make the sandbox repository public or add each account as a collaborator (GitHub Achievement Forge does not do this automatically).",
        );
      }
      base.warnings.push(
        "POLICY: automated starring is listed as 'rank abuse' in GitHub's Acceptable Use Policies. You accept this risk by using --allow-high-risk.",
      );
      if (!context.policyGates.allowHighRisk) {
        base.issues.push("Starstruck requires the explicit consent flag --allow-high-risk.");
      }
    }
    base.ok = base.issues.length === 0;
    return base;
  }
}
