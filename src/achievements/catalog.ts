import type { AchievementTier } from "./achievement.js";
import type { PolicyRisk } from "../domain/policy.js";

/**
 * The achievement catalogue.
 *
 * IMPORTANT — provenance
 * GitHub does not publish achievement requirements; the official docs only say
 * that achievements "celebrate specific events and actions" and that the feature
 * is in public preview.
 *
 * If GitHub changes a threshold, update this file only: planner, executor and
 * CLI all read from here.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  automatable: boolean;
  policyRisk: PolicyRisk;
  tiers: AchievementTier[];
  notes: string[];
}

export const CATALOG_VERIFIED_AT = "2026-09-16";
export const COMMUNITY_SOURCE_URL = "https://github.com/drknzz/GitHub-Achievements";

const TIER_NAMES: Array<AchievementTier["name"]> = ["default", "bronze", "silver", "gold"];

/** Builds cumulative tiers (1 default, 2 bronze, 3 silver, 4 gold) from thresholds. */
export function tiersFromThresholds(
  thresholds: number[],
  accountsRequiredFor: (level: number, requirement: number) => number,
): AchievementTier[] {
  return thresholds.map((requirement, index) => {
    const level = index + 1;
    const name = TIER_NAMES[index] ?? "gold";
    return { level, name, requirement, accountsRequired: accountsRequiredFor(level, requirement) };
  });
}

const singleAccount = (): number => 1;

const AUTOMATABLE_ENTRIES: CatalogEntry[] = [
  {
    id: "quickdraw",
    name: "Quickdraw",
    description: "Closed an issue or pull request within 5 minutes of opening it.",
    automatable: true,
    policyRisk: "safe",
    tiers: tiersFromThresholds([1], singleAccount),
    notes: [
      "Single tier: there is no bronze/silver/gold progression.",
      "The 5 minute window is measured from creation to close; GAF closes immediately after creating.",
    ],
  },
  {
    id: "pull-shark",
    name: "Pull Shark",
    description: "Opened pull requests that have been merged.",
    automatable: true,
    policyRisk: "safe",
    tiers: tiersFromThresholds([2, 16, 128, 1024], singleAccount),
    notes: [
      "Only merged pull requests count; closing without merging does not.",
      "Pull requests opened in repositories the account owns are counted (this is how GAF earns it).",
      "Reaching gold means 1022 additional merged pull requests; GAF reports the volume instead of silently grinding it.",
    ],
  },
  {
    id: "yolo",
    name: "YOLO",
    description: "Merged a pull request without a review.",
    automatable: true,
    policyRisk: "safe",
    tiers: tiersFromThresholds([1], singleAccount),
    notes: [
      "The pull request must be merged while having no review decision at all.",
      "Base branch protection must not require approving reviews; GAF detects protection and reports it instead of bypassing it.",
    ],
  },
  {
    id: "pair-extraordinaire",
    name: "Pair Extraordinaire",
    description: "Co-authored commits merged in a pull request.",
    automatable: true,
    policyRisk: "safe",
    tiers: tiersFromThresholds([1, 10, 24, 48], () => 2),
    notes: [
      "Requires two accounts: the commit author and the co-author named in the Co-authored-by trailer.",
      "The co-author email must be verified on the co-author's GitHub account.",
      "The commit must end up merged, so GAF always opens and merges a pull request.",
    ],
  },
];

const OPT_IN_ENTRIES: CatalogEntry[] = [
  {
    id: "galaxy-brain",
    name: "Galaxy Brain",
    description: "Answered a discussion and had the answer accepted.",
    automatable: true,
    policyRisk: "opt-in",
    tiers: tiersFromThresholds([2, 8, 16, 32], () => 2),
    notes: [
      "One account creates the discussion, the main account answers, and the discussion author accepts the answer.",
      "Discussions must be enabled on the repository and the answering account must be able to comment.",
      "GitHub added a separate 'verified answer' state (GA 2025-09-11) above 'marked as answer'; GAF relies only on the accepted answer.",
    ],
  },
  {
    id: "starstruck",
    name: "Starstruck",
    description: "Created a repository that has many stars.",
    automatable: true,
    policyRisk: "high-risk",
    tiers: tiersFromThresholds([16, 128, 512, 4096], (_level, requirement) => requirement),
    notes: [
      "A single account can only contribute one star per repository, so the strategy needs as many distinct accounts as stars.",
      "The stars must be on a repository owned by the main account.",
      "HIGH RISK: Acceptable Use Policies §4 list 'rank abuse, such as automated starring or following' as prohibited. GAF requires an explicit consent flag and documents the risk.",
    ],
  },
];

const NON_AUTOMATABLE_ENTRIES: CatalogEntry[] = [
  {
    id: "public-sponsor",
    name: "Public Sponsor",
    description: "Sponsored an open source contributor through GitHub Sponsors.",
    automatable: false,
    policyRisk: "safe",
    tiers: tiersFromThresholds([1], singleAccount),
    notes: ["Requires real money and a manual payment flow; GAF never automates payments."],
  },
  {
    id: "heart-on-your-sleeve",
    name: "Heart On Your Sleeve",
    description: "Requirement not documented by GitHub.",
    automatable: false,
    policyRisk: "safe",
    tiers: [],
    notes: [
      "GitHub has never documented the trigger, so GAF treats it as unknown: it is listed but never planned or executed.",
    ],
  },
  {
    id: "open-sourcerer",
    name: "Open Sourcerer",
    description: "Requirement not documented by GitHub.",
    automatable: false,
    policyRisk: "safe",
    tiers: [],
    notes: ["Unknown trigger; listed for completeness, never executed."],
  },
  {
    id: "arctic-code-vault-contributor",
    name: "Arctic Code Vault Contributor",
    description: "Contributed code to a repository in the 2020 GitHub Archive Program.",
    automatable: false,
    policyRisk: "safe",
    tiers: [],
    notes: ["Historical badge, no longer earnable."],
  },
  {
    id: "mars-2020-contributor",
    name: "Mars 2020 Helicopter Contributor",
    description: "Contributed code to a repository used by the Mars 2020 Helicopter mission.",
    automatable: false,
    policyRisk: "safe",
    tiers: [],
    notes: ["Historical badge, no longer earnable."],
  },
];

export const ACHIEVEMENT_CATALOG: readonly CatalogEntry[] = [
  ...AUTOMATABLE_ENTRIES,
  ...OPT_IN_ENTRIES,
  ...NON_AUTOMATABLE_ENTRIES,
];

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return ACHIEVEMENT_CATALOG.find((entry) => entry.id === id);
}

/** Fails loudly if a module asks for a catalogue entry that does not exist. */
export function requireCatalogEntry(id: string): CatalogEntry {
  const entry = findCatalogEntry(id);
  if (entry === undefined) {
    throw new Error(`Achievement "${id}" is missing from the catalogue (src/achievements/catalog.ts)`);
  }
  return entry;
}

export function catalogIds(): string[] {
  return ACHIEVEMENT_CATALOG.map((entry) => entry.id);
}

export function automatableCatalogEntries(): CatalogEntry[] {
  return ACHIEVEMENT_CATALOG.filter((entry) => entry.automatable);
}