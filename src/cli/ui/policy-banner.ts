import type { PolicyRisk } from "../../domain/policy.js";
import { POLICY_NOTES } from "../../domain/policy.js";

const AUP_SECTION_4_LINES = [
  "GitHub Acceptable Use Policies §4 — you are about to perform actions GitHub classifies",
  "as coordinated or rank-affecting activity. The exact language GAF warns about is:",
  "",
  '  "rank abuse, such as automated starring or following"',
  '  "coordinated inauthentic activity"',
  "  " + "automated excessive bulk activity and coordinated inauthentic activity",
  "",
];

export interface PolicyBanner {
  title: string;
  lines: string[];
  flags: string[];
}

/**
 * Renders the literal §4 warning plus the achievement policy note, so the user
 * sees the actual Acceptable Use Policy language before consenting.
 */
export function policyNoteBanner(risk: Extract<PolicyRisk, "opt-in" | "high-risk">): PolicyBanner {
  const lines = [...AUP_SECTION_4_LINES];
  const note = POLICY_NOTES[risk];
  if (note !== undefined) lines.push(note, "");
  const riskLabel = risk === "opt-in" ? "opt-in" : "high-risk";
  return {
    title: `Policy ${riskLabel}`,
    lines: [
      ...lines,
      ...(riskLabel === "opt-in"
        ? ["This requires --allow-policy-risks (or policy.allowOptInAchievements)."]
        : ["This requires --allow-policy-risks AND --allow-high-risk."]),
    ],
    flags: [
      ...(riskLabel === "opt-in" ? ["--allow-policy-risks"] : []),
      ...(riskLabel === "high-risk" ? ["--allow-policy-risks", "--allow-high-risk"] : []),
    ],
  };
}