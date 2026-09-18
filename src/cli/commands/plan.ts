import type { GafPaths } from "../../config/paths.js";
import { loadRuntime, buildAchievementContext, readOnlyExecutor, describeAuthErrors } from "../../runtime/context.js";
import { createPlan, describeActionKind } from "../../planner/planner.js";
import { parseTargets, defaultTargets, validateAchievementIds } from "../targets.js";
import { printLine, printJson, section, bullet, table } from "../ui/format.js";
import { riskLabel } from "../../domain/policy.js";
import { levelToTierName } from "../../achievements/achievement.js";
import { loggerFor } from "../context.js";
import { saveLastPlanTargets } from "../../state/last-plan.js";
import { estimateActions, formatDuration } from "../../executor/estimate.js";

export interface PlanCommandOptions {
  only?: string[];
  target?: string[];
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export async function planCommand(paths: GafPaths, options: PlanCommandOptions): Promise<number> {
  const logger = loggerFor(paths, { verbose: options.verbose, quiet: options.quiet });
  const runtime = await loadRuntime({ paths, logger });
  const authErrors = describeAuthErrors(runtime);
  if (authErrors.length > 0) {
    for (const message of authErrors) logger.warn(message);
  }

  const targets = options.target !== undefined && options.target.length > 0
    ? parseTargets(options.target)
    : defaultTargets(runtime.config);

  if (options.only !== undefined && options.only.length > 0) {
    validateAchievementIds(options.only, runtime.registry);
  }

  // Remember the targets this plan used, so `gh-forge run` (without --target)
  // executes exactly what the user just previewed.
  const effectiveTargets: Record<string, number> = { ...targets };
  if (options.only !== undefined && options.only.length > 0) {
    for (const id of Object.keys(effectiveTargets)) {
      if (!options.only.includes(id)) delete effectiveTargets[id];
    }
  }
  await saveLastPlanTargets(paths, effectiveTargets);

  const context = await buildAchievementContext(runtime, readOnlyExecutor());
  const plan = await createPlan({
    registry: runtime.registry,
    context,
    targets,
    ...(options.only === undefined ? {} : { only: options.only }),
    policyGates: {
      allowHighRisk: runtime.config.policy.allowHighRisk,
    },
  });

  const estimate = estimateActions(plan.actions, runtime.config.execution.minIntervalMs);

  if (options.json === true) {
    printJson({ ...plan, estimate });
    return 0;
  }

  section("Plan");
  printLine(`Generated: ${plan.generatedAt}`);
  printLine(`Sandbox:   ${plan.sandbox.owner}/${plan.sandbox.name} (${plan.sandbox.visibility})`);

  if (plan.entries.length === 0) {
    printLine();
    printLine("No achievements are targeted. Set targets in the config or pass --target <id>=<level>.");
    return 0;
  }

  for (const entry of plan.entries) {
    printLine();
    printLine(`${entry.name} (${entry.achievementId})`);
    printLine(`  Target: level ${entry.targetLevel} (${levelToTierName(entry.targetLevel)})`);
    printLine(`  Current: level ${entry.currentLevel} (${levelToTierName(entry.currentLevel)})`);
    printLine(`  Requirements: ${entry.currentRequirement} -> ${entry.targetRequirement}`);
    printLine(`  Risk: ${riskLabel(entry.policyRisk)}`);
    if (entry.automatable) {
      printLine(`  Actions required: ${entry.actionsRequired}`);
      if (entry.helpersRequired > 0) {
        printLine(`  Accounts required: ${entry.accountsRequired} (${entry.helpersRequired} helper)`);
      }
    } else {
      printLine(`  Not automatable by GAF.`);
    }
    for (const issue of entry.validation.issues) printLine(`  ✗ ${issue}`);
    for (const note of entry.validation.warnings) printLine(`  ! ${note}`);
  }

  if (plan.actions.length > 0) {
    const maxDetailRows = 10;
    section(`Actions (${plan.actions.length})`);
    const shown = plan.actions.slice(0, maxDetailRows);
    printLine(
      table(
        ["#", "achievement", "kind", "risk", "description"],
        shown.map((action, index) => [
          String(index + 1),
          action.achievementIds.join("+"),
          action.kind,
          action.policyRisk,
          action.description,
        ]),
      ),
    );
    if (plan.actions.length > shown.length) {
      printLine(`  … and ${plan.actions.length - shown.length} more (use --json for the full list).`);
    }
    printLine();
    printLine("Action breakdown:");
    for (const [kind, count] of Object.entries(plan.summary.actionsByKind)) {
      if (count === undefined) continue;
      printLine(`  ${count}× ${describeActionKind(kind as Parameters<typeof describeActionKind>[0])}`);
    }
    printLine();
    printLine(
      `Estimated execution time: ~${formatDuration(estimate.seconds)} ` +
        `(${estimate.actionCount} actions, execution.minIntervalMs = ${runtime.config.execution.minIntervalMs}).`,
    );
  }

  if (plan.blockers.length > 0) {
    section("Blockers");
    for (const line of bullet(plan.blockers)) printLine(line);
    printLine();
    printLine("Resolve the blockers above, then re-run `gh-forge plan`.");
    return 1;
  }

  if (plan.warnings.length > 0) {
    printLine();
    printLine("Warnings:");
    for (const line of bullet(plan.warnings)) printLine(line);
  }

  printLine();
  printLine(plan.readyToExecute
    ? "Plan is ready to execute. Run `gh-forge run`."
    : "No actions are planned. Adjust targets and re-run.");
  return 0;
}