/**
 * Policy classification for every automatable action.
 *
 * GitHub Achievement Forge runs `safe` actions by default. `high-risk` actions require an explicit
 * consent flag (see `docs/SECURITY.md`), because GitHub's Acceptable Use
 * Policies forbids them.
 *
 * GitHub Achievement Forge never implements account creation, third-party account usage, rate limit
 * evasion or any other bypass mechanism. Consent flags only acknowledge the risk
 * of actions performed with accounts the user owns.
 */

/**
 * The policy risks.
 */
export type PolicyRisk = "safe" | "high-risk";

/**
 * The order of the risks.
 */
const RISK_ORDER: Record<PolicyRisk, number> = {
  safe: 0,
  "high-risk": 1,
};

/**
 * The policy gates.
 */
export interface PolicyGates {
  allowHighRisk: boolean;
}

/**
 * The weight of the risk.
 *
 * @param risk - The risk.
 * @returns The weight of the risk.
 */
export function riskWeight(risk: PolicyRisk): number {
  return RISK_ORDER[risk];
}

/**
 * The maximum risk.
 *
 * @param a - The first risk.
 * @param b - The second risk.
 * @returns The maximum risk.
 */
export function isMaxRisk(a: PolicyRisk, b: PolicyRisk): PolicyRisk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Checks if a risk is allowed.
 *
 * @param risk - The risk.
 * @param gates - The gates.
 * @returns True if the risk is allowed, false otherwise.
 */
export function riskAllowed(risk: PolicyRisk, gates: PolicyGates): boolean {
  if (risk === "safe") return true;
  return gates.allowHighRisk;
}

/**
 * The label of the risk.
 *
 * @param risk - The risk.
 * @returns The label of the risk.
 */
export function riskLabel(risk: PolicyRisk): string {
  switch (risk) {
    case "safe":
      return "safe";
    case "high-risk":
      return "high-risk (needs --allow-high-risk)";
  }
}

/**
 * The policy notes.
 */
export const POLICY_NOTES: Record<Exclude<PolicyRisk, "safe">, string> = {
  "high-risk":
    "Involves coordinated activity between accounts you own or automated starring, which " +
    "GitHub's Acceptable Use Policies classifies as 'rank abuse' or 'coordinated " +
    "inauthentic activity'. Only planned/executed with explicit consent, and it is " +
    "documented as a ToS risk in docs/SECURITY.md.",
};
