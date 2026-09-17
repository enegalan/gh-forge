/**
 * Policy classification for every automatable action.
 *
 * GAF runs `safe` actions by default. `opt-in` and `high-risk` actions require
 * an explicit consent flag (see `docs/SECURITY.md`), because GitHub's Acceptable
 * Use Policies §4 forbids:
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
export type PolicyRisk = "safe" | "opt-in" | "high-risk";

const RISK_ORDER: Record<PolicyRisk, number> = {
  safe: 0,
  "opt-in": 1,
  "high-risk": 2,
};

export interface PolicyGates {
  allowOptIn: boolean;
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
  if (risk === "opt-in") return gates.allowOptIn || gates.allowHighRisk;
  return gates.allowHighRisk;
}

export function riskLabel(risk: PolicyRisk): string {
  switch (risk) {
    case "safe":
      return "safe";
    case "opt-in":
      return "opt-in (needs --allow-policy-risks)";
    case "high-risk":
      return "high-risk (needs --allow-high-risk)";
  }
}

export const POLICY_NOTES: Record<Exclude<PolicyRisk, "safe">, string> = {
  "opt-in":
    "Involves coordinated activity between accounts you own (for example one account creating a " +
    "discussion and another answering it). GitHub's Acceptable Use Policies §4 prohibits " +
    "coordinated inauthentic activity, so this is only planned/executed with explicit consent.",
  "high-risk":
    "Involves automated starring, which GitHub's Acceptable Use Policies §4 explicitly lists as " +
    "'rank abuse, such as automated starring or following'. Only planned/executed with explicit " +
    "consent, and it is documented as a ToS risk in docs/SECURITY.md.",
};