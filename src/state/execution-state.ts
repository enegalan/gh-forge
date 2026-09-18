import type { ActionIdempotencyRef, ActionKind } from "../domain/action.js";
import type { PolicyRisk } from "../domain/policy.js";

export type RunStatus = "in_progress" | "partial" | "completed" | "failed";
export type ActionStatus = "pending" | "in_flight" | "done" | "failed" | "skipped";

export interface ActionState {
  key: string;
  kind: ActionKind;
  achievementIds: string[];
  description: string;
  requiredAccountIds: string[];
  policyRisk: PolicyRisk;
  status: ActionStatus;
  attempts: number;
  /** Parameters the executor needs to perform the action (e.g. unitIndex). */
  params: Record<string, unknown>;
  ref?: ActionIdempotencyRef;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RunObservation {
  at: string;
  kind: string;
  achievementId?: string;
  detail?: string;
}

export interface RunState {
  version: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  dryRun: boolean;
  targets: Record<string, number>;
  flags: {
    allowHighRisk: boolean;
  };
  /** Account id -> GitHub login, frozen at run creation time. */
  accounts: Record<string, string>;
  actions: ActionState[];
  observations: RunObservation[];
}

export function createRunState(input: {
  runId: string;
  targets: Record<string, number>;
  accounts: Record<string, string>;
  dryRun: boolean;
  flags: RunState["flags"];
}): RunState {
  const now = new Date().toISOString();
  return {
    version: 1,
    runId: input.runId,
    createdAt: now,
    updatedAt: now,
    status: "in_progress",
    dryRun: input.dryRun,
    targets: input.targets,
    flags: input.flags,
    accounts: input.accounts,
    actions: [],
    observations: [],
  };
}

export function isResumable(run: RunState): boolean {
  if (run.status === "completed") return false;
  return run.actions.some((action) => action.status === "pending" || action.status === "failed" || action.status === "in_flight");
}

export function nextPendingAction(run: RunState): ActionState | undefined {
  return run.actions.find((action) => action.status === "pending" || action.status === "in_flight" || action.status === "failed");
}

export function recomputeRunStatus(run: RunState): RunStatus {
  if (run.actions.length === 0) return run.status;
  const failed = run.actions.filter((action) => action.status === "failed").length;
  const pending = run.actions.filter(
    (action) => action.status === "pending" || action.status === "in_flight",
  ).length;
  if (pending > 0) return "partial";
  if (failed > 0) return "partial";
  return "completed";
}