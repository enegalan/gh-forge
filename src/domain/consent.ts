import type { PolicyGates, PolicyRisk } from "./policy.js";
import { riskAllowed } from "./policy.js";

export const READ_ONLY_RISK_MESSAGE =
  "These actions are outside the consented risk level. GAF never executes them without explicit flags, and it never bypasses a policy."

/**
 * Decides whether a set of planned actions is allowed by the pre-approved risk
 * gates. The executor itself also checks `riskAllowed` per action; this helper
 * gives the CLI an early, human readable gate.
 */
export function markRiskAccepted(
  maxRisk: PolicyRisk,
  gates: Pick<PolicyGates, "allowOptIn" | "allowHighRisk">,
): boolean {
  return riskAllowed(maxRisk, { allowOptIn: gates.allowOptIn, allowHighRisk: gates.allowHighRisk });
}