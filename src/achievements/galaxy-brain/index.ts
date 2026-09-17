import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement, helpersOf } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * Galaxy Brain — answers accepted in GitHub Discussions.
 *
 * Strategy (two accounts, both owned by the user):
 *   the helper account creates a discussion in the sandbox repository,
 *   the main account answers it, and the helper account (the discussion author)
 *   marks that answer as accepted.
 *
 * `accountsRequired` is 2 for every tier: the same pair repeats the flow.
 *
 * Policy: classified as `opt-in` because it is coordinated activity between two
 * accounts. See docs/SECURITY.md (Acceptable Use Policies §4).
 */
export class GalaxyBrainAchievement extends BaseAchievement {
  constructor() {
    super(requireCatalogEntry("galaxy-brain"));
  }

  override getRequirements(targetTier: number, context: AchievementContext): Requirement[] {
    const units = this.unitsFor(targetTier, this.currentLevel(context));
    if (units === 0) return [];
    return [
      {
        id: "accepted-answer",
        kind: "accepted-discussion-answer",
        count: units,
        accountsRequired: 2,
        helpersRequired: 1,
        accountRoles: [
          { role: "helper", index: 0, purpose: "create the discussion and accept the answer" },
          { role: "main", index: 0, purpose: "post the answer that gets accepted" },
        ],
        policyRisk: "opt-in",
        params: {},
        description: "create a discussion, answer it and accept the answer",
      },
    ];
  }

  override async validate(context: AchievementContext): Promise<ValidationResult> {
    const base = await super.validate(context);
    const helpers = helpersOf(context);
    if (helpers.length === 0) {
      base.issues.push(
        "Galaxy Brain needs a second account of your own to create the discussion. Create it, then run `gh-forge accounts add <id> --role helper --username <login>`.",
      );
      return base;
    }
    const helper = helpers[0];
    if (helper === undefined) return base;
    const capabilities = context.accountCapabilities.get(helper.id);
    if (capabilities !== undefined && !capabilities.authenticated) {
      base.issues.push(`The helper account "${helper.id}" is not authenticated.`);
    }

    try {
      const info = await context.github.discussions.getRepositoryInfo(context.sandbox.owner, context.sandbox.name);
      if (!info.hasDiscussionsEnabled) {
        base.issues.push(
          `Discussions are disabled on ${context.sandbox.owner}/${context.sandbox.name}. Enable them in repository settings (GAF never changes repository settings automatically).`,
        );
      } else if (info.categories.length === 0) {
        base.issues.push(
          `No discussion categories exist on ${context.sandbox.owner}/${context.sandbox.name}; GitHub requires a category to create a discussion.`,
        );
      }
    } catch (error) {
      base.warnings.push(
        "Could not inspect Discussions settings; the executor will report failures as they happen.",
      );
      base.warnings.push(String(error));
    }
    base.ok = base.issues.length === 0;
    return base;
  }
}
