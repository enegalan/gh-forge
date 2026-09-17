import { createAchievementRegistry } from "../../achievements/achievement-registry.js";
import { ACHIEVEMENT_CATALOG } from "../../achievements/catalog.js";
import { riskLabel, POLICY_NOTES } from "../../domain/policy.js";
import { describeProvenance } from "../../planner/planner.js";
import { printLine, printJson, section, table } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";

export async function achievementsListCommand(asJson: boolean): Promise<number> {
  if (asJson) {
    printJson(
      ACHIEVEMENT_CATALOG.map((entry) => ({
        id: entry.id,
        name: entry.name,
        automatable: entry.automatable,
        policyRisk: entry.policyRisk,
        tiers: entry.tiers.map((tier) => ({
          level: tier.level,
          name: tier.name,
          requirement: tier.requirement,
          accountsRequired: tier.accountsRequired,
        })),
        provenance: entry.provenance,
      })),
    );
    return 0;
  }

  section("Achievements");
  printLine(
    table(
      ["id", "name", "automatable", "policy risk", "tiers"],
      ACHIEVEMENT_CATALOG.map((entry) => [
        entry.id,
        entry.name,
        entry.automatable ? "yes" : "no",
        riskLabel(entry.policyRisk),
        describeTiers(entry.tiers),
      ]),
    ),
  );
  printLine();
  printLine("`automatable = yes` means GAF can plan and execute concrete GitHub actions for it.");
  printLine("`opt-in` and `high-risk` require explicit consent flags at execution time. See docs/SECURITY.md.");
  return 0;
}

export async function achievementsShowCommand(id: string, asJson: boolean): Promise<number> {
  const registry = createAchievementRegistry();
  const achievement = registry.tryGet(id);
  if (achievement === null) {
    throw new UsageError(`Unknown achievement "${id}"`, [
      "Known ids: " + registry.ids().sort().join(", "),
    ]);
  }
  const entry = ACHIEVEMENT_CATALOG.find((candidate) => candidate.id === id);

  if (asJson) {
    printJson({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      automatable: achievement.automatable,
      policyRisk: achievement.policyRisk,
      policyNote: POLICY_NOTES[achievement.policyRisk as keyof typeof POLICY_NOTES] ?? null,
      tiers: achievement.getTiers(),
      provenance: achievement.provenance,
      notes: entry?.notes ?? [],
    });
    return 0;
  }

  section(achievement.name);
  printLine(`  Id:          ${achievement.id}`);
  printLine(`  Description: ${achievement.description}`);
  printLine(`  Automatable: ${achievement.automatable ? "yes" : "no"}`);
  printLine(`  Policy risk: ${riskLabel(achievement.policyRisk)}`);
  printLine(`  Provenance:  ${describeProvenance(achievement.provenance)}`);

  const tiers = achievement.getTiers();
  if (tiers.length > 0) {
    section("Tiers");
    printLine(
      table(
        ["level", "name", "requirement", "accounts"],
        tiers.map((tier) => [
          String(tier.level),
          tier.name,
          String(tier.requirement),
          String(tier.accountsRequired),
        ]),
      ),
    );
  }

  if (achievement.policyRisk !== "safe") {
    const note = POLICY_NOTES[achievement.policyRisk as keyof typeof POLICY_NOTES];
    if (note !== undefined) {
      section("Risk note");
      printLine(`  ${note}`);
    }
  }

  if (entry?.notes !== undefined && entry.notes.length > 0) {
    section("Notes");
    for (const note of entry.notes) printLine(`  - ${note}`);
  }
  return 0;
}

function describeTiers(tiers: { level: number; name: string; requirement: number }[]): string {
  if (tiers.length === 0) return "(none documented)";
  return tiers
    .map((tier) => `${tier.name}(${tier.requirement})`)
    .join(", ");
}