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
 *
 * Policy: classified `high-risk`. GitHub's Acceptable Use Policies list
 * "rank abuse, such as automated starring or following" as prohibited activity.
 * GAF requires `--allow-high-risk`, prints a warning and records the consent in
 * the audit log; it never creates accounts, never uses third-party accounts and
 * never tries to hide the activity from GitHub.
 */
export class StarstruckAchievement extends BaseAchievement {
  constructor() {
    super(requireCatalogEntry("starstruck"));
  }

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
          "GAF never creates accounts and never automates identity creation. Create the accounts yourself, then authenticate each one with `gh-forge accounts add`.",
        );
      }
      if (context.sandbox.visibility === "private") {
        base.issues.push(
          "The starred repository must be reachable by every account; make the sandbox repository public or add each account as a collaborator (GAF does not do this automatically).",
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
