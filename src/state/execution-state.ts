import type { ActionIdempotencyRef, ActionKind } from "../domain/action.js";
import type { PolicyRisk } from "../domain/policy.js";

/**
 * The run status.
 */
export type RunStatus = "in_progress" | "partial" | "completed" | "failed";

/**
 * The action status.
 */
export type ActionStatus = "pending" | "in_flight" | "done" | "failed" | "skipped";

/**
 * The action state.
 */
export interface ActionState {
  key: string;
  kind: ActionKind;
  achievementIds: string[];
  description: string;
  requiredAccountIds: string[];
  policyRisk: PolicyRisk;
  status: ActionStatus;
  attempts: number;
  params: Record<string, unknown>;
  ref?: ActionIdempotencyRef;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

/**
 * The run observation.
 */
export interface RunObservation {
  at: string;
  kind: string;
  achievementId?: string;
  detail?: string;
}

/**
 * The run state.
 */
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
  accounts: Record<string, string>;
  actions: ActionState[];
  observations: RunObservation[];
}

/**
 * Creates a run state.
 *
 * @param input - The input.
 * @returns The run state.
 */
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

/**
 * Checks if a run is resumable.
 *
 * @param run - The run.
 * @returns True if the run is resumable, false otherwise.
 */
export function isResumable(run: RunState): boolean {
  if (run.status === "completed") return false;
  return run.actions.some(
    (action) =>
      action.status === "pending" || action.status === "failed" || action.status === "in_flight",
  );
}

/**
 * Gets the next pending action.
 *
 * @param run - The run.
 * @returns The next pending action.
 */
export function nextPendingAction(run: RunState): ActionState | undefined {
  return run.actions.find(
    (action) =>
      action.status === "pending" || action.status === "in_flight" || action.status === "failed",
  );
}

/**
 * Recomputes the run status.
 *
 * @param run - The run.
 * @returns The run status.
 */
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
