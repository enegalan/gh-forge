import { POLICY_NOTES } from "../../domain/policy.js";

const AUP_SECTION_4_LINES = [
  "GitHub Acceptable Use Policies — you are about to perform actions GitHub classifies",
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
 * Renders the literal warning plus the achievement policy note, so the user
 * sees the actual Acceptable Use Policy language before consenting.
 */
export function policyNoteBanner(risk: "high-risk"): PolicyBanner {
  const lines = [...AUP_SECTION_4_LINES];
  const note = POLICY_NOTES[risk];
  if (note !== undefined) lines.push(note, "");
  return {
    title: "Policy high-risk",
    lines: [...lines, "This requires --allow-high-risk (or policy.allowHighRisk)."],
    flags: ["--allow-high-risk"],
  };
}
