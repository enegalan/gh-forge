import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * Pull Shark — merged pull requests opened by the account.
 *
 * Strategy (single account):
 *   main opens a pull request in its own (sandbox) repository and merges it.
 * Each merged pull request is one unit; thresholds are cumulative
 * (2 / 16 / 128 / 1024).
 */
export class PullSharkAchievement extends BaseAchievement {
  constructor() {
    super(requireCatalogEntry("pull-shark"));
  }

  override getRequirements(targetTier: number, context: AchievementContext): Requirement[] {
    const units = this.unitsFor(targetTier, this.currentLevel(context));
    if (units === 0) return [];
    return [
      {
        id: "merged-pr",
        kind: "merged-pull-request",
        count: units,
        accountsRequired: 1,
        helpersRequired: 0,
        accountRoles: [{ role: "main", index: 0, purpose: "open and merge a pull request" }],
        policyRisk: "safe",
        params: {},
        description: "open and merge a pull request",
      },
    ];
  }

  override async validate(context: AchievementContext): Promise<ValidationResult> {
    const base = await super.validate(context);
    const units = this.unitsFor(context.config.targets[this.id] ?? 0, this.currentLevel(context));
    if (units > 200) {
      base.warnings.push(
        `${units} merged pull requests are required. That is a lot of automated activity: GitHub may apply secondary rate limits and the volume is visible to everyone. Consider a lower target tier.`,
      );
    }
    return base;
  }
}
