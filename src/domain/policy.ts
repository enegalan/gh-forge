/**
 * Policy classification for every automatable action.
 *
 * GAF runs `safe` actions by default. `high-risk` actions require an explicit
 * consent flag (see `docs/SECURITY.md`), because GitHub's Acceptable Use
 * Policies forbids:
 *
 *   - "automated excessive bulk activity and coordinated inauthentic activity"
 *   - "inauthentic interactions, such as fake accounts and automated
 *     inauthentic activity"
 *   - "rank abuse, such as automated starring or following"
 *
 * GAF never implements account creation, third-party account usage, rate limit
 * evasion or any other bypass mechanism. Consent flags only acknowledge the risk
 * of actions performed with accounts the user owns.
 */
export type PolicyRisk = "safe" | "high-risk";

const RISK_ORDER: Record<PolicyRisk, number> = {
  safe: 0,
  "high-risk": 1,
};

export interface PolicyGates {
  allowHighRisk: boolean;
}

export function riskWeight(risk: PolicyRisk): number {
  return RISK_ORDER[risk];
}

export function isMaxRisk(a: PolicyRisk, b: PolicyRisk): PolicyRisk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export function riskAllowed(risk: PolicyRisk, gates: PolicyGates): boolean {
  if (risk === "safe") return true;
  return gates.allowHighRisk;
}

export function riskLabel(risk: PolicyRisk): string {
  switch (risk) {
    case "safe":
      return "safe";
    case "high-risk":
      return "high-risk (needs --allow-high-risk)";
  }
}

export const POLICY_NOTES: Record<Exclude<PolicyRisk, "safe">, string> = {
  "high-risk":
    "Involves coordinated activity between accounts you own or automated starring, which " +
    "GitHub's Acceptable Use Policies classifies as 'rank abuse' or 'coordinated " +
    "inauthentic activity'. Only planned/executed with explicit consent, and it is " +
    "documented as a ToS risk in docs/SECURITY.md.",
};
