import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement, helpersOf } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * Pair Extraordinaire — co-authored commits merged in a pull request.
 *
 * Strategy (two accounts, both owned by the user):
 *   main opens a pull request whose commit carries a
 *   `Co-authored-by: <helper name> <helper email>` trailer, then merges it.
 *
 * `accountsRequired` is always 2:
 * one author plus one co-author, and the same pair can earn every tier by
 * repeating the action.
 */
export class PairExtraordinaireAchievement extends BaseAchievement {
  /**
   * Creates a new Pair Extraordinaire achievement.
   */
  constructor() {
    super(requireCatalogEntry("pair-extraordinaire"));
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

    /**
     * The credited co-author is part of the action's identity, not decoration.
     * `actionKey` hashes these params, so a different co-author produces a
     * different key, branch and marker. Without this, correcting the co-author
     * email would re-key nothing and every action would be skipped as
     * "already merged" against pull requests GitHub never credited.
     *
     * `commitMessageFormat` deliberately bumps the key when the commit message
     * layout changes: v1 placed the marker after the `Co-authored-by` trailer,
     * which made GitHub ignore the trailer, so v1 runs must not be resumed as
     * if they had credited the co-author.
     */
    const helper = helpersOf(context)[0];
    const helperEmail =
      helper === undefined
        ? null
        : (context.accountCapabilities.get(helper.id)?.commitEmail ?? null);

    return [
      {
        id: "co-authored-merged-pr",
        kind: "co-authored-merged-pull-request",
        count: units,
        accountsRequired: 2,
        helpersRequired: 1,
        accountRoles: [
          { role: "main", index: 0, purpose: "open the pull request and merge it" },
          { role: "helper", index: 0, purpose: "be credited as co-author of the commit" },
        ],
        policyRisk: "safe",
        params: {
          coAuthor: helper?.username ?? null,
          coAuthorEmail: helperEmail,
          commitMessageFormat: "marker-before-trailer",
        },
        description: "merge a pull request containing a co-authored commit",
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
    if (helpers.length === 0) {
      base.issues.push(
        "Pair Extraordinaire needs a second account of your own to act as co-author. Create it, then run `gh-forge accounts add <id> --role helper --username <login>`.",
      );
      return base;
    }
    const helper = helpers[0];
    if (helper === undefined) return base;
    const capabilities = context.accountCapabilities.get(helper.id);
    if (capabilities !== undefined && !capabilities.authenticated) {
      base.issues.push(`The helper account "${helper.id}" is not authenticated.`);
    } else if (capabilities !== undefined && !capabilities.canAttributeCoAuthoredCommit) {
      base.issues.push(
        capabilities.commitEmail === null
          ? `GitHub Achievement Forge does not know a verified commit email for helper "${helper.id}", so GitHub would not credit it as co-author. Run \`gh-forge accounts set-email ${helper.id} <email>\` with an address verified on the "${helper.username}" account.`
          : `The commit email configured for helper "${helper.id}" (${capabilities.commitEmail}) is not verified on the "${helper.username}" account, so GitHub would not credit it as co-author and every action would be wasted. Verify an email address on that account, then run \`gh-forge accounts set-email ${helper.id} <email>\`.`,
      );
    }
    base.ok = base.issues.length === 0;
    return base;
  }
}
