import type { GafPaths } from "../../config/paths.js";
import { RunStore } from "../../state/run-store.js";
import { printLine, printJson, section, table } from "../ui/format.js";
import { loggerFor } from "../context.js";

export interface StatusCommandOptions {
  run?: string;
  json?: boolean;
}

export async function statusCommand(paths: GafPaths, options: StatusCommandOptions): Promise<number> {
  const logger = loggerFor(paths, {});
  const store = new RunStore(paths);
  const summaries = await store.list();

  if (summaries.length === 0) {
    printLine("No runs recorded yet. Run `gh-forge run` to create the first one.");
    return 0;
  }

  if (options.json === true) {
    if (options.run !== undefined) {
      try {
        const run = await store.load(options.run);
        printJson(run);
        return 0;
      } catch (error) {
        logger.warn(`Run "${options.run}" not found.`);
        printJson({ error: `Run "${options.run}" not found` });
        return 1;
      }
    }
    printJson(summaries);
    return 0;
  }

  section("Runs");
  printLine(
    table(
      ["run id", "status", "dry-run", "created", "updated", "done/total", "resumable"],
      summaries.map((summary) => [
        summary.runId,
        summary.status,
        summary.dryRun ? "yes" : "",
        summary.createdAt,
        summary.updatedAt,
        `${summary.done}/${summary.total}`,
        summary.resumable ? "*" : "",
      ]),
    ),
  );
  printLine();
  printLine("* resumable with `gh-forge run --resume`");

  const target = options.run !== undefined
    ? summaries.find((summary) => summary.runId === options.run)
    : summaries[0];

  if (target === undefined) {
    if (options.run !== undefined) printLine(`Run "${options.run}" not found.`);
    return 0;
  }

  const run = await store.load(target.runId);
  section(`Run ${run.runId}`);
  printLine(`  Status:    ${run.status}`);
  printLine(`  Dry-run:   ${run.dryRun ? "yes" : "no"}`);
  printLine(`  Created:   ${run.createdAt}`);
  printLine(`  Updated:   ${run.updatedAt}`);
  printLine(`  Targets:   ${Object.entries(run.targets).map(([id, level]) => `${id}=${level}`).join(", ")}`);
  printLine(`  Flags:     ${Object.entries(run.flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`);

  section("Actions");
  if (run.actions.length === 0) {
    printLine("  (no actions)");
  } else {
    printLine(
      table(
        ["status", "attempts", "kind", "key", "description", "error"],
        run.actions.map((action) => [
          action.status,
          String(action.attempts),
          action.kind,
          action.key,
          action.description,
          action.error ?? "",
        ]),
      ),
    );
  }

  if (run.observations.length > 0) {
    section("Observations");
    for (const observation of run.observations) {
      printLine(`  ${observation.at} ${observation.kind}${observation.achievementId === undefined ? "" : ` (${observation.achievementId})`}${observation.detail === undefined ? "" : ` - ${observation.detail}`}`);
    }
  }

  return 0;
}