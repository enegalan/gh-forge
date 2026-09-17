import type { PolicyRisk } from "./policy.js";

/** The primitive GitHub operations GAF knows how to perform. */
export type ActionKind =
  | "close-issue-fast"
  | "merged-pull-request"
  | "co-authored-merged-pull-request"
  | "accepted-discussion-answer"
  | "repository-star";

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  "close-issue-fast": "open and close an issue within 5 minutes",
  "merged-pull-request": "open and merge a pull request",
  "co-authored-merged-pull-request": "merge a pull request with a co-authored commit",
  "accepted-discussion-answer": "answer a discussion and get the answer accepted",
  "repository-star": "star a repository from one account",
};

/**
 * Capabilities an executed action provides. Two requirements that belong to the
 * same `family` can be satisfied by the same action when the action's
 * capabilities are a superset of the requirement's capabilities
 * (a co-authored merged PR is also a merged PR).
 */
export type ActionCapability = "merged-pr" | "co-authored" | "fast-close" | "accepted-answer" | "star";

export const CAPABILITIES_BY_KIND: Record<ActionKind, ActionCapability[]> = {
  "merged-pull-request": ["merged-pr"],
  "co-authored-merged-pull-request": ["merged-pr", "co-authored"],
  "close-issue-fast": ["fast-close"],
  "accepted-discussion-answer": ["accepted-answer"],
  "repository-star": ["star"],
};

/** Requirements in the same family compete for the same pool of actions. */
export function familyOf(kind: ActionKind): string {
  return CAPABILITIES_BY_KIND[kind][0] ?? kind;
}

export function isCapabilitySuperset(superset: ActionCapability[], subset: ActionCapability[]): boolean {
  return subset.every((capability) => superset.includes(capability));
}


/** How to find out, at resume time, whether an action already happened. */
export interface ActionIdempotencyRef {
  type: "issue" | "pull-request" | "discussion" | "commit" | "star";
  marker: string;
  repository?: string;
  branch?: string;
  number?: number;
  discussionId?: string;
  accountId?: string;
}

export interface PlannedAction {
  key: string;
  kind: ActionKind;
  /** Achievements this action advances (one action can satisfy several). */
  achievementIds: string[];
  /** Human readable description for `gh-forge plan`. */
  description: string;
  /** Account ids (by role) required to perform the action. */
  requiredAccounts: PlannedAccountRequirement[];
  params: Record<string, unknown>;
  policyRisk: PolicyRisk;
}

export interface PlannedAccountRequirement {
  /** "main" means "the main account", "helper" means "any helper account". */
  role: "main" | "helper";
  /** Stable index so multiple helpers are distinguishable. */
  index: number;
  purpose: string;
}

export interface ActionSummary {
  total: number;
  pending: number;
  done: number;
  failed: number;
  skipped: number;
  inFlight: number;
}

export function summarizeActions(actions: Array<{ status: string }>): ActionSummary {
  const summary: ActionSummary = {
    total: actions.length,
    pending: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    inFlight: 0,
  };
  for (const action of actions) {
    switch (action.status) {
      case "pending":
        summary.pending += 1;
        break;
      case "done":
        summary.done += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
      case "in_flight":
        summary.inFlight += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}