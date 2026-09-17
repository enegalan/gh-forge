import type { GafPaths } from "../../config/paths.js";
import type { RunState } from "../../state/execution-state.js";
import { loadRuntime, buildAchievementContext, describeAuthErrors } from "../../runtime/context.js";
import { createPlan } from "../../planner/planner.js";
import { Executor } from "../../executor/executor.js";
import { parseTargets, defaultTargets, validateAchievementIds } from "../targets.js";
import { loggerFor } from "../context.js";
import { printLine, section, bullet, confirm } from "../ui/format.js";
import { policyNoteBanner } from "../ui/policy-banner.js";
import { recordAudit } from "../../state/audit-log.js";
import { READ_ONLY_RISK_MESSAGE, markRiskAccepted } from "../../domain/consent.js";
import { loadLastPlanTargets } from "../../state/last-plan.js";

export interface RunCommandOptions {
  dryRun?: boolean;
  only?: string[];
  target?: string[];
  allowPolicyRisks?: boolean;
  allowHighRisk?: boolean;
  resume?: string | boolean;
  status?: boolean;
  yes?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export async function runCommand(paths: GafPaths, options: RunCommandOptions): Promise<number> {
  const logger = loggerFor(paths, { verbose: options.verbose, quiet: options.quiet });
  if (options.status === true) {
    return showLatestStatus(paths);
  }
  const runtime = await loadRuntime({ paths, logger });
  for (const error of describeAuthErrors(runtime)) logger.warn(error);

  const config = runtime.config;
  const flags = {
    allowOptIn: options.allowPolicyRisks === true || config.policy.allowOptIn,
    allowHighRisk: options.allowHighRisk === true || config.policy.allowHighRisk,
    yes: options.yes === true || config.policy.allowOptIn || config.policy.allowHighRisk,
  };

  const targets = options.target !== undefined && options.target.length > 0
    ? parseTargets(options.target)
    : (await loadLastPlanTargets(paths)) ?? defaultTargets(config);

  if (options.only !== undefined && options.only.length > 0) {
    validateAchievementIds(options.only, runtime.registry);
  }

  const executor = new Executor({
    runStore: runtime.runStore,
    logger,
    mergeMethod: config.execution.mergeMethod,
    branchPrefix: config.execution.branchPrefix,
    minIntervalMs: config.execution.minIntervalMs,
  });

  const context = await buildAchievementContext(runtime, executor, null);

  const plan = await createPlan({
    registry: runtime.registry,
    context,
    targets,
    ...(options.only === undefined ? {} : { only: options.only }),
    policyGates: { allowOptIn: flags.allowOptIn, allowHighRisk: flags.allowHighRisk },
  });

  if (plan.actions.length === 0) {
    printLine("Nothing to do: the plan produces no actions.");
    return 0;
  }

  const risk = maxRiskOf(plan.actions.map((action) => action.policyRisk));
  const consented = markRiskAccepted(risk, flags);

  if (!consented) {
    section("Blocked by policy");
    printLine(READ_ONLY_RISK_MESSAGE);
    printLine();
    printLine("This plan contains actions classified beyond the consented risk level:");
    for (const line of bullet(
      [...new Set(plan.actions.map((action) => `${action.kind} (${action.policyRisk})`))],
    )) {
      printLine(line);
    }
    printLine();
    printLine("To consent, re-run with:");
    printLine("  --allow-policy-risks   opt-in achievements (Galaxy Brain)");
    printLine("  --allow-high-risk       high-risk achievements (Starstruck)");
    return 1;
  }

  if (risk !== "safe") {
    const banner = policyNoteBanner(risk);
    section("Risk consent");
    for (const line of bullet(banner.lines)) printLine(line);
    printLine();
    printLine(`Flags used: ${flags.allowHighRisk ? "--allow-high-risk " : ""}${flags.allowOptIn ? "--allow-policy-risks " : ""}${flags.yes ? "--yes " : ""}`.trimEnd());

    if (flags.yes !== true) {
      printLine();
      const ok = await confirm("Continue with these risk actions?");
      if (!ok) {
        printLine("Aborted. No actions were executed.");
        await recordAudit(paths, {
          at: new Date().toISOString(),
          kind: "consent-declined",
          achievementIds: plan.actions.map((action) => action.achievementIds).flat(),
          policyRisk: risk,
          flags: [],
        });
        return 1;
      }
    }

    await recordAudit(paths, {
      at: new Date().toISOString(),
      kind: "consent-granted",
      achievementIds: plan.actions.map((action) => action.achievementIds).flat(),
      policyRisk: risk,
      flags: [
        ...(flags.allowOptIn ? ["--allow-policy-risks"] : []),
        ...(flags.allowHighRisk ? ["--allow-high-risk"] : []),
        ...(flags.yes ? ["--yes"] : []),
      ],
    });
  }

  if (options.dryRun === true) {
    const dryRun = executor.prepareRun({
      context,
      targets,
      actions: plan.actions,
      dryRun: true,
      flags,
    });
    section("Dry run (no actions are executed)");
    printLine(`Run ${dryRun.runId}`);
    printLine(`Actions: ${dryRun.actions.length}`);
    const maxDryRunRows = 10;
    for (const action of dryRun.actions.slice(0, maxDryRunRows)) {
      printLine(`  - ${action.kind} ${action.key} ${action.description}`);
    }
    if (dryRun.actions.length > maxDryRunRows) {
      printLine(`  … and ${dryRun.actions.length - maxDryRunRows} more.`);
    }
    printLine();
    printLine("Run `gh-forge run` to execute these actions.");
    return 0;
  }

  const previous = await resolvePreviousRun(paths, options.resume, runtime.runStore);
  const run = executor.prepareRun({
    context,
    targets,
    actions: plan.actions,
    dryRun: false,
    flags,
    ...(previous === null ? {} : { existingRun: previous }),
  });

  section("Executing");
  printLine(`Run ${run.runId}${previous !== null ? " (resumed)" : ""}`);
  if (previous !== null) {
    const done = run.actions.filter((action) => action.status === "done").length;
    const pending = run.actions.filter((action) => action.status === "pending").length;
    printLine(`Resuming ${done} completed actions; ${pending} remain.`);
  }

  await executor.executeRun(context, run);

  const done = run.actions.filter((action) => action.status === "done").length;
  const failed = run.actions.filter((action) => action.status === "failed").length;
  const skipped = run.actions.filter((action) => action.status === "skipped").length;
  const pending = run.actions.filter((action) => action.status === "pending" || action.status === "in_flight").length;

  printLine();
  printLine(`Run status: ${run.status}`);
  printLine(`Done: ${done}  Failed: ${failed}  Skipped: ${skipped}  Pending: ${pending}`);
  if (failed > 0) {
    section("Failed actions");
    for (const action of run.actions) {
      if (action.status === "failed" && action.error !== undefined) {
        printLine(`  - ${action.key} (${action.kind}): ${action.error}`);
      }
    }
    printLine();
    printLine("You can retry the remaining actions with `gh-forge run --resume`.");
    return failed > 0 ? 1 : 0;
  }
  if (pending > 0) {
    printLine();
    printLine("Run is paused. Resume later with `gh-forge run --resume`.");
    return 0;
  }
  return 0;
}

async function showLatestStatus(_paths: GafPaths): Promise<number> {
  const { RunStore } = await import("../../state/run-store.js");
  const store = new RunStore(_paths);
  const summaries = await store.list();
  if (summaries.length === 0) {
    printLine("No runs recorded yet. Run `gh-forge run` to create the first one.");
    return 0;
  }
  const latest = summaries[0];
  if (latest === undefined) return 0;
  const run = await store.load(latest.runId);
  const done = run.actions.filter((action) => action.status === "done").length;
  const pending = run.actions.filter((action) => action.status === "pending" || action.status === "in_flight").length;
  const failed = run.actions.filter((action) => action.status === "failed").length;
  printLine(`Run ${run.runId} (${run.status}, dry-run=${run.dryRun})`);
  printLine(`  Actions: ${done} done, ${pending} pending, ${failed} failed of ${run.actions.length}`);
  return 0;
}

async function resolvePreviousRun(
  _paths: GafPaths,
  resume: string | boolean | undefined,
  runStore: import("../../state/run-store.js").RunStore,
): Promise<RunState | null> {
  if (resume === undefined || resume === false) return null;
  if (typeof resume === "string" && resume.trim() !== "") {
    return runStore.load(resume.trim());
  }
  return runStore.latestResumable();
}

function maxRiskOf(risks: Array<"safe" | "opt-in" | "high-risk">): "safe" | "opt-in" | "high-risk" {
  if (risks.includes("high-risk")) return "high-risk";
  if (risks.includes("opt-in")) return "opt-in";
  return "safe";
}