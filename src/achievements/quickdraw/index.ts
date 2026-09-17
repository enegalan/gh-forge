import type { AchievementContext, Requirement, ValidationResult } from "../achievement.js";
import { BaseAchievement } from "../base-achievement.js";
import { requireCatalogEntry } from "../catalog.js";

/**
 * Quickdraw — close an issue or pull request within 5 minutes of opening it.
 *
 * Strategy (single account):
 *   main opens an issue in the sandbox repository and closes it immediately.
 * The elapsed time between `POST /issues` and `PATCH /issues/{n}` is well below
 * the 5 minute window, so a single action is enough for the only tier.
 */
export class QuickdrawAchievement extends BaseAchievement {
  constructor() {
    super(requireCatalogEntry("quickdraw"));
  }

  override getRequirements(targetTier: number, context: AchievementContext): Requirement[] {
    const units = this.unitsFor(targetTier, this.currentLevel(context));
    if (units === 0) return [];
    return [
      {
        id: "fast-close",
        kind: "close-issue-fast",
        count: units,
        accountsRequired: 1,
        helpersRequired: 0,
        accountRoles: [{ role: "main", index: 0, purpose: "create an issue and close it immediately" }],
        policyRisk: "safe",
        params: { withinMinutes: 5 },
        description: "open an issue and close it within 5 minutes",
      },
    ];
  }

  override async validate(context: AchievementContext): Promise<ValidationResult> {
    const base = await super.validate(context);
    const main = context.mainAccount;
    const capabilities = context.accountCapabilities.get(main.id);
    if (capabilities !== undefined && !capabilities.authenticated) {
      base.issues.push(`The main account "${main.id}" is not authenticated.`);
    } else if (capabilities !== undefined && !capabilities.canPushToSandbox) {
      base.warnings.push(
        `The main account cannot push to ${context.sandbox.owner}/${context.sandbox.name}; creating issues may fail. Using the main account's own repository is what counts for the badge.`,
      );
    }
    base.ok = base.issues.length === 0;
    return base;
  }
}
