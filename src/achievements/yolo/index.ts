import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * YOLO — merge a pull request without any review.
 *
 * Strategy (single account):
 *   main merges a pull request in its own repository without requesting or
 *   receiving a review.
 *
 * Important: this only works when branch protection does not require approving
 * reviews. GAF detects branch protection and reports it; it never disables or
 * bypasses protection rules.
 */
export class YoloAchievement extends BaseAchievement {
  constructor() {
    super(requireCatalogEntry("yolo"));
  }

  override getRequirements(targetTier: number, context: AchievementContext): Requirement[] {
    const units = this.unitsFor(targetTier, this.currentLevel(context));
    if (units === 0) return [];
    return [
      {
        id: "merged-pr-no-review",
        kind: "merged-pull-request",
        count: units,
        accountsRequired: 1,
        helpersRequired: 0,
        accountRoles: [{ role: "main", index: 0, purpose: "merge a pull request without a review" }],
        policyRisk: "safe",
        params: { requireNoReview: true },
        description: "merge a pull request without any review",
      },
    ];
  }

  override async validate(context: AchievementContext): Promise<ValidationResult> {
    const base = await super.validate(context);
    const target = context.config.targets[this.id] ?? 0;
    if (target > 0 && this.currentLevel(context) < target) {
      const main = context.mainAccount;
      try {
        const repository = await context.github.repositories.get(context.sandbox.owner, context.sandbox.name);
        if (repository !== null) {
          const protection = await context.github.repositories.getBranchProtection(
            context.sandbox.owner,
            context.sandbox.name,
            repository.default_branch,
          );
          if (protection !== null && protection.requiresApprovingReviews) {
            base.issues.push(
              `Branch protection on ${context.sandbox.owner}/${context.sandbox.name} requires ${
                protection.requiredApprovingReviewCount || "at least one"
              } approving review(s), so a pull request cannot be merged "without a review".`,
            );
            base.warnings.push(
              "GAF never modifies or bypasses branch protection. Use a repository without required reviews, or ask the maintainer to change it.",
            );
          }
        }
        if (context.sandbox.visibility === "private") {
          const capabilities = context.accountCapabilities.get(main.id);
          if (capabilities?.hasRepoScope !== true) {
            base.issues.push(
              "Merging pull requests in a private repository requires the `repo` scope.",
            );
          }
        }
      } catch {
        base.warnings.push(
          "Could not read branch protection settings; GAF will rely on the merge call to fail loudly.",
        );
      }
    }
    return base;
  }
}
