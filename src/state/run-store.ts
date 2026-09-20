import { randomBytes } from "node:crypto";
import type { GafPaths } from "../config/paths.js";
import type { RunObservation, RunState } from "./execution-state.js";
import { isResumable, recomputeRunStatus } from "./execution-state.js";
import { joinPath, listFiles, readJson, writeJsonAtomic } from "../utils/fs-atomic.js";
import { StateError } from "../utils/errors.js";
import { redactSecrets } from "../utils/redact.js";

/**
 * The run summary.
 */
export interface RunSummary {
  runId: string;
  status: RunState["status"];
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
  done: number;
  total: number;
  resumable: boolean;
}

/**
 * Creates a new run ID.
 *
 * @param now - The current date and time.
 * @returns The new run ID.
 */
export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.]/g, "").slice(0, 15);
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

/**
 * The run store.
 */
export class RunStore {
  /**
   * The paths.
   */
  private readonly paths: GafPaths;

  /**
   * Creates a new run store.
   *
   * @param paths - The paths.
   */
  constructor(paths: GafPaths) {
    this.paths = paths;
  }

  /**
   * Gets the run file path.
   *
   * @param runId - The run ID.
   * @returns The run file path.
   */
  runFile(runId: string): string {
    return joinPath(this.paths.runsDir, `${runId}.json`);
  }

  /**
   * Saves a run.
   *
   * @param run - The run.
   * @returns The saved run.
   */
  async save(run: RunState): Promise<RunState> {
    const next: RunState = {
      ...run,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.runFile(run.runId), sanitizeRun(next));
    return next;
  }

  /**
   * Loads a run.
   *
   * @param runId - The run ID.
   * @returns The loaded run.
   */
  async load(runId: string): Promise<RunState> {
    const raw = await readJson<RunState>(this.runFile(runId));
    if (raw === null) {
      throw new StateError(`Run ${runId} not found`, ["Use `gh-forge status` to list runs."]);
    }
    return raw;
  }

  /**
   * Lists the runs.
   *
   * @returns The runs.
   */
  async list(): Promise<RunSummary[]> {
    const files = await listFiles(this.paths.runsDir, ".json");
    const summaries: RunSummary[] = [];
    for (const file of files) {
      const raw = await readJson<RunState>(joinPath(this.paths.runsDir, file));
      if (raw === null) continue;
      summaries.push({
        runId: raw.runId,
        status: raw.status,
        dryRun: raw.dryRun,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        done: raw.actions.filter((action) => action.status === "done").length,
        total: raw.actions.length,
        resumable: isResumable(raw),
      });
    }
    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Gets the latest resumable run.
   *
   * @returns The latest resumable run.
   */
  async latestResumable(): Promise<RunState | null> {
    const summaries = await this.list();
    for (const summary of summaries) {
      if (!summary.resumable) continue;
      const run = await readJson<RunState>(this.runFile(summary.runId));
      if (run !== null && isResumable(run)) return run;
    }
    return null;
  }

  /**
   * Records an observation.
   *
   * @param runId - The run ID.
   * @param observation - The observation.
   * @returns The updated run.
   */
  async recordObservation(
    runId: string,
    observation: Omit<RunObservation, "at">,
  ): Promise<RunState> {
    const run = await this.load(runId);
    run.observations.push({ at: new Date().toISOString(), ...observation });
    run.status = recomputeRunStatus(run);
    return this.save(run);
  }
}

/**
 * Sanitizes a run.
 *
 * @param run - The run.
 * @returns The sanitized run.
 */
function sanitizeRun(run: RunState): RunState {
  return {
    ...run,
    actions: run.actions.map((action) => ({
      ...action,
      ...(action.error === undefined ? {} : { error: redactSecrets(action.error) }),
    })),
    observations: run.observations.map((observation) => ({
      ...observation,
      ...(observation.detail === undefined ? {} : { detail: redactSecrets(observation.detail) }),
    })),
  };
}
