import type { AchievementContext, AchievementExecutor, ExecutionResult } from "../achievements/achievement.js";
import type { PlannedAction } from "../domain/action.js";
import { riskAllowed } from "../domain/policy.js";
import type { ActionState, RunState } from "../state/execution-state.js";
import { createRunState, recomputeRunStatus } from "../state/execution-state.js";
import { newRunId, RunStore } from "../state/run-store.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { redactSecrets } from "../utils/redact.js";
import { errorMessage } from "../utils/errors.js";
import { runAction } from "./action-runner.js";

export interface ExecutorOptions {
  runStore: RunStore;
  logger?: Logger;
  mergeMethod?: "merge" | "squash" | "rebase";
  branchPrefix?: string;
  maxActionsPerRun?: number;
  maxActionsPerHour?: number;
  minIntervalMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Called after every action so the CLI can stream progress. */
  onAction?: (action: ActionState) => void;
}

export interface PrepareRunOptions {
  context: AchievementContext;
  targets: Record<string, number>;
  actions: PlannedAction[];
  dryRun: boolean;
  flags: RunState["flags"];
  /** Resume an existing run instead of creating a new one. */
  existingRun?: RunState | null;
}

/**
 * Executes planned actions and persists the run state after every single action,
 * so an interrupted run can always be resumed without repeating work.
 */
export class Executor implements AchievementExecutor {
  private readonly runStore: RunStore;
  private readonly logger: Logger;
  private readonly mergeMethod: "merge" | "squash" | "rebase";
  private readonly branchPrefix: string;
  private readonly maxActionsPerRun: number;
  private readonly maxActionsPerHour: number;
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onAction: ((action: ActionState) => void) | null;

  constructor(options: ExecutorOptions) {
    this.runStore = options.runStore;
    this.logger = options.logger ?? createLogger();
    this.mergeMethod = options.mergeMethod ?? "merge";
    this.branchPrefix = options.branchPrefix ?? "gh-forge";
    this.maxActionsPerRun = options.maxActionsPerRun ?? 50;
    this.maxActionsPerHour = options.maxActionsPerHour ?? 200;
    this.minIntervalMs = options.minIntervalMs ?? 1_500;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.onAction = options.onAction ?? null;
  }

  /**
   * Creates (or resumes) the run state for a plan. Actions that already exist in
   * a previous run keep their status, which is what makes `gh-forge run` pick up
   * where it left off instead of starting from scratch.
   */
  prepareRun(options: PrepareRunOptions): RunState {
    const { context, targets, actions, dryRun, flags } = options;
    const accounts: Record<string, string> = {};
    for (const account of context.accounts) accounts[account.id] = account.username;

    const previous = options.existingRun ?? null;
    const run =
      previous ??
      createRunState({
        runId: newRunId(),
        targets,
        accounts,
        dryRun,
        flags,
      });

    const previousByKey = new Map((previous?.actions ?? []).map((action) => [action.key, action]));
    run.targets = targets;
    run.accounts = accounts;
    run.dryRun = dryRun;
    run.flags = flags;
    run.actions = actions.map((action) => mergeActionState(action, previousByKey.get(action.key)));
    return run;
  }

  /** Executes a whole plan, persisting after each action. */
  async executeRun(context: AchievementContext, run: RunState): Promise<RunState> {
    for (const action of run.actions) {
      if (!riskAllowed(action.policyRisk, run.flags) && action.status === "pending") {
        action.status = "skipped";
        action.error = `Policy: "${action.policyRisk}" requires explicit consent (see docs/SECURITY.md).`;
      }
    }

    let executedThisRun = 0;
    const startedAt = this.now();
    let lastActionAt = 0;

    for (const action of run.actions) {
      if (executedThisRun >= this.maxActionsPerRun) {
        this.logger.warn(
          `Reached maxActionsPerRun (${this.maxActionsPerRun}); remaining actions stay pending and can be resumed with \`gh-forge run\`.`,
        );
        break;
      }
      if (action.status === "done" || action.status === "skipped") continue;
      if (action.attempts >= this.maxAttempts) {
        action.status = "failed";
        action.error = action.error ?? "Maximum attempts reached";
        await this.persist(run);
        continue;
      }
      if (this.overHourlyBudget(run, startedAt)) {
        this.logger.warn(
          `Reached maxActionsPerHour (${this.maxActionsPerHour}); stopping to stay well below GitHub's rate limits. Resume later with \`gh-forge run\`.`,
        );
        break;
      }

      if (lastActionAt !== 0 && this.minIntervalMs > 0) {
        await this.sleep(Math.max(0, lastActionAt + this.minIntervalMs - this.now()));
      }

      await this.executeOne(context, run, action);
      lastActionAt = this.now();
      executedThisRun += 1;
    }

    run.status = recomputeRunStatus(run);
    return this.persist(run);
  }

  /** Implements `AchievementExecutor`: used by `gh-forge run --only <id>`. */
  async runActions(
    context: AchievementContext,
    achievementId: string,
    actions: PlannedAction[],
  ): Promise<ExecutionResult> {
    const run = this.prepareRun({
      context,
      targets: { [achievementId]: context.config.targets[achievementId] ?? 0 },
      actions,
      dryRun: false,
      flags: {
        allowOptIn: context.policyGates.allowOptIn,
        allowHighRisk: context.policyGates.allowHighRisk,
        yes: false,
      },
    });
    const executed = await this.executeRun(context, run);
    return toExecutionResult(achievementId, executed);
  }

  private async executeOne(context: AchievementContext, run: RunState, action: ActionState): Promise<void> {
    action.status = "in_flight";
    action.attempts += 1;
    action.startedAt = new Date().toISOString();
    await this.persist(run);

    this.logger.info(`action ${action.key} (${action.kind}) - ${action.description}`);
    try {
      const outcome = await runAction({
        context,
        action: toPlannedAction(action),
        logger: this.logger.child(`[${action.key}] `),
        dryRun: run.dryRun,
        mergeMethod: this.mergeMethod,
        branchPrefix: this.branchPrefix,
      });
      action.finishedAt = new Date().toISOString();
      switch (outcome.status) {
        case "done":
        case "skipped":
          action.status = "done";
          this.logger.info(`  done: ${outcome.message}`);
          break;
        case "would-run":
          action.status = "pending";
          this.logger.info(`  ${outcome.message}`);
          break;
        case "failed":
          action.status = "failed";
          action.error = outcome.message;
          this.logger.warn(`  failed: ${outcome.message}`);
          break;
      }
      if (outcome.ref !== undefined) action.ref = outcome.ref;
      if (outcome.result !== undefined) action.result = outcome.result;
      if (run.dryRun) action.status = "pending";
    } catch (error) {
      action.status = "failed";
      action.error = redactSecrets(errorMessage(error));
      action.finishedAt = new Date().toISOString();
      this.logger.error(`  failed: ${action.error}`);
    }

    await this.persist(run);
    this.onAction?.(action);
  }

  private overHourlyBudget(run: RunState, referenceTime: number): boolean {
    const cutoff = referenceTime - 60 * 60 * 1000;
    const recent = run.actions.filter(
      (action) =>
        action.status === "done" &&
        action.finishedAt !== undefined &&
        Date.parse(action.finishedAt) >= cutoff,
    ).length;
    return recent >= this.maxActionsPerHour;
  }

  private async persist(run: RunState): Promise<RunState> {
    const saved = await this.runStore.save(run);
    run.updatedAt = saved.updatedAt;
    return run;
  }
}
function mergeActionState(action: PlannedAction, previous: ActionState | undefined): ActionState {
  const base: ActionState = {
    key: action.key,
    kind: action.kind,
    achievementIds: action.achievementIds,
    description: action.description,
    requiredAccountIds: [],
    policyRisk: action.policyRisk,
    status: "pending",
    attempts: 0,
    params: action.params,
  };
  if (previous === undefined) return base;
  return {
    ...base,
    // An action interrupted mid-flight becomes pending again so it can be
    // retried; the action runner checks GitHub before mutating anything.
    status: previous.status === "in_flight" ? "pending" : previous.status,
    attempts: previous.attempts,
    ...(previous.ref === undefined ? {} : { ref: previous.ref }),
    ...(previous.result === undefined ? {} : { result: previous.result }),
    ...(previous.error === undefined ? {} : { error: previous.error }),
    ...(previous.startedAt === undefined ? {} : { startedAt: previous.startedAt }),
    ...(previous.finishedAt === undefined ? {} : { finishedAt: previous.finishedAt }),
  };
}

export function toPlannedAction(action: ActionState): PlannedAction {
  return {
    key: action.key,
    kind: action.kind,
    achievementIds: action.achievementIds,
    description: action.description,
    requiredAccounts: [],
    params: action.params ?? {},
    policyRisk: action.policyRisk,
  };
}

export function toExecutionResult(achievementId: string, run: RunState): ExecutionResult {
  const mine = run.actions.filter((action) => action.achievementIds.includes(achievementId));
  const done = mine.filter((action) => action.status === "done").length;
  const failed = mine.filter((action) => action.status === "failed").length;
  const skipped = mine.filter((action) => action.status === "skipped").length;
  return {
    achievementId,
    executed: done,
    skipped,
    failed,
    details: mine.map(
      (action) =>
        `${action.key}: ${action.status}${action.error === undefined ? "" : ` (${action.error})`}`,
    ),
  };
}