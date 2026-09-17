import type { AchievementContext, Requirement } from "./achievement.js";
import { BaseAchievement } from "./base-achievement.js";
import { ACHIEVEMENT_CATALOG } from "./catalog.js";
import { GalaxyBrainAchievement } from "./galaxy-brain/index.js";
import { PairExtraordinaireAchievement } from "./pair-extraordinaire/index.js";
import { PullSharkAchievement } from "./pull-shark/index.js";
import { QuickdrawAchievement } from "./quickdraw/index.js";
import { StarstruckAchievement } from "./starstruck/index.js";
import { YoloAchievement } from "./yolo/index.js";

/** Achievements whose requirements are known but that GAF never executes. */
class CatalogOnlyAchievement extends BaseAchievement {
  override getRequirements(_targetTier: number, _context: AchievementContext): Requirement[] {
    return [];
  }
}

/**
 * The registry is the single place that knows which achievements exist.
 * Registering a new one is a one-line change here.
 */
export function createAchievementRegistry(): AchievementRegistry {
  return new AchievementRegistry([
    new QuickdrawAchievement(),
    new PullSharkAchievement(),
    new YoloAchievement(),
    new PairExtraordinaireAchievement(),
    new GalaxyBrainAchievement(),
    new StarstruckAchievement(),
  ]);
}

export class AchievementRegistry {
  private readonly achievements: Map<string, BaseAchievement>;
  private readonly catalogOnly: Map<string, CatalogOnlyAchievement>;

  constructor(achievements: BaseAchievement[]) {
    this.achievements = new Map(achievements.map((achievement) => [achievement.id, achievement]));
    this.catalogOnly = new Map(
      ACHIEVEMENT_CATALOG.filter((entry) => !this.achievements.has(entry.id)).map((entry) => [
        entry.id,
        new CatalogOnlyAchievement(entry),
      ]),
    );
  }

  /** All catalogue entries, including retired / not automatable ones. */
  all(): BaseAchievement[] {
    return [...this.achievements.values(), ...this.catalogOnly.values()];
  }

  /** Only achievements GAF can plan and execute. */
  automatable(): BaseAchievement[] {
    return [...this.achievements.values()];
  }

  tryGet(id: string): BaseAchievement | null {
    return this.achievements.get(id) ?? this.catalogOnly.get(id) ?? null;
  }

  get(id: string): BaseAchievement {
    const achievement = this.tryGet(id);
    if (achievement === null) {
      throw new Error(`Unknown achievement "${id}". Known ids: ${this.all().map((a) => a.id).join(", ")}`);
    }
    return achievement;
  }

  ids(): string[] {
    return this.all().map((achievement) => achievement.id);
  }
}