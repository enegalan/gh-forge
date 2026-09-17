import type { Account } from "../accounts/account.js";
import type { ActionCapability, PlannedAction } from "../domain/action.js";
import { CAPABILITIES_BY_KIND, familyOf, isCapabilitySuperset } from "../domain/action.js";
import type { Requirement } from "../achievements/achievement.js";
import { actionKey } from "../utils/hash.js";

export interface RequirementWithOwner {
  achievementId: string;
  achievementName: string;
  requirement: Requirement;
}

interface Allocation {
  /** Achievement that owns the unit index used for the action key. */
  ownerId: string;
  ownerName: string;
  kind: PlannedAction["kind"];
  capabilities: ActionCapability[];
  achievementIds: Set<string>;
  requirement: Requirement;
  unitIndex: number;
}

/**
 * Merges the requirements of several achievements into one executable action
 * list.
 *
 * Rules:
 *  - Requirements are grouped by family (a co-authored merged PR is also a
 *    merged PR, so both live in the `merged-pr` family).
 *  - Within a family, requirements are processed from the largest count to the
 *    smallest, and an existing action is reused whenever its capabilities are a
 *    superset of the requirement's capabilities.
 *  - Action keys are owned by the achievement whose requirement created the
 *    action, so adding a new achievement or raising a target never re-keys the
 *    actions that were already executed (that is what makes `run` resumable).
 */
export function mergeRequirements(inputs: RequirementWithOwner[]): PlannedAction[] {
  const byFamily = new Map<string, RequirementWithOwner[]>();
  for (const input of inputs) {
    const family = familyOf(input.requirement.kind);
    const bucket = byFamily.get(family) ?? [];
    bucket.push(input);
    byFamily.set(family, bucket);
  }

  const actions: Allocation[] = [];
  for (const bucket of byFamily.values()) {
    const ordered = [...bucket].sort((a, b) => {
      if (b.requirement.count !== a.requirement.count) return b.requirement.count - a.requirement.count;
      return CAPABILITIES_BY_KIND[b.requirement.kind].length - CAPABILITIES_BY_KIND[a.requirement.kind].length;
    });

    for (const input of ordered) {
      const needed = CAPABILITIES_BY_KIND[input.requirement.kind];
      let assigned = 0;
      for (const action of actions) {
        if (assigned >= input.requirement.count) break;
        if (familyOf(action.kind) !== familyOf(input.requirement.kind)) continue;
        if (!isCapabilitySuperset(action.capabilities, needed)) continue;
        action.achievementIds.add(input.achievementId);
        assigned += 1;
      }
      for (let index = assigned; index < input.requirement.count; index += 1) {
        actions.push({
          ownerId: input.achievementId,
          ownerName: input.achievementName,
          kind: input.requirement.kind,
          capabilities: [...needed],
          achievementIds: new Set([input.achievementId]),
          requirement: input.requirement,
          unitIndex: index,
        });
      }
    }
  }

  return actions.map(toPlannedAction);
}

function toPlannedAction(allocation: Allocation): PlannedAction {
  const achievementIds = [...allocation.achievementIds].sort();
  const key = actionKey({
    achievementId: allocation.ownerId,
    kind: allocation.kind,
    index: allocation.unitIndex,
    params: allocation.requirement.params,
  });
  return {
    key,
    kind: allocation.kind,
    achievementIds,
    description: `${allocation.requirement.description} (#${allocation.unitIndex + 1})`,
    requiredAccounts: allocation.requirement.accountRoles,
    params: { ...allocation.requirement.params, unitIndex: allocation.unitIndex },
    policyRisk: allocation.requirement.policyRisk,
  };
}

export interface AccountRequirementSummary {
  /** Maximum number of accounts any single requirement needs (main + helpers). */
  maxAccountsRequired: number;
  /** Maximum number of helper accounts any single requirement needs. */
  helpersRequired: number;
  purposes: string[];
}

export function summarizeAccountRequirements(requirements: Requirement[]): AccountRequirementSummary {
  let maxAccountsRequired = 0;
  let helpersRequired = 0;
  const purposes: string[] = [];
  for (const requirement of requirements) {
    maxAccountsRequired = Math.max(maxAccountsRequired, requirement.accountsRequired);
    helpersRequired = Math.max(helpersRequired, requirement.helpersRequired);
    for (const role of requirement.accountRoles) {
      purposes.push(`${role.role}[${role.index}]: ${role.purpose}`);
    }
  }
  return { maxAccountsRequired, helpersRequired, purposes };
}

export function resolveAccountForRole(
  input: { main: Account; helpers: Account[] },
  role: { role: "main" | "helper"; index: number },
): Account | null {
  if (role.role === "main") return input.main;
  return input.helpers[role.index] ?? null;
}