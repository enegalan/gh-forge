import type { GafPaths } from "../../config/paths.js";
import type { Config } from "../../config/schema.js";
import { configStoreFor } from "../context.js";
import { printLine, printJson, section } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";

const NESTED_SEPARATOR = ".";

export interface ConfigProgressOptions {
  sync?: boolean;
  json?: boolean;
  verbose?: boolean;
}

/** Reads a nested config key like `execution.minIntervalMs`. */
export async function configGetCommand(paths: GafPaths, key: string): Promise<number> {
  const store = configStoreFor(paths);
  const config = await store.loadOrDefault();
  const value = getConfigKey(config, key);
  if (value === undefined) {
    throw new UsageError(`Unknown config key "${key}"`);
  }
  printJson(value);
  return 0;
}

/** Writes a nested config key, coercing booleans and numbers. */
export async function configSetCommand(paths: GafPaths, key: string, value: string): Promise<number> {
  const store = configStoreFor(paths);
  await store.update((config) => {
    setConfigKey(config, key, coerceValue(value));
  });
  printLine(`Set ${key} = ${coerceValue(value)}`);
  return 0;
}

/** Shows progress and optionally scans public profiles to reconcile knownProgress. */
export async function configProgressCommand(paths: GafPaths, options: ConfigProgressOptions): Promise<number> {
  const { ProgressStore } = await import("../../config/progress.js");
const { scanProfile, tierToLevel, describeScraped } = await import("../../profile/achievement-scraper.js");
    const { recordAudit } = await import("../../state/audit-log.js");
  const progressStore = new ProgressStore(paths);
  const file = await progressStore.load();

  if (options.sync === true) {
    const config = await configStoreFor(paths).loadOrDefault();
    const mainUsername = config.accounts[config.mainAccount ?? ""]?.username;
    if (mainUsername === undefined) {
      throw new UsageError("No main account is configured; a profile scan needs a username.");
    }
    const scan = await scanProfile(mainUsername, { baseUrl: config.profileScan.baseUrl });
    if (scan.warnings.length > 0) {
      printLine("Scan warnings:");
      for (const warning of scan.warnings) printLine(`  - ${warning}`);
    }
    if (scan.achievements.length > 0) {
      for (const achievement of scan.achievements) {
        await progressStore.setLevel(achievement.slug, tierToLevel(achievement.tier), {
          source: "scraped",
          note: `Profile scan at ${scan.scannedAt}`,
        });
      }
      await recordAudit(paths, {
        at: new Date().toISOString(),
        kind: "profile-scan",
        achievementIds: scan.achievements.map((entry) => entry.slug),
        policyRisk: "safe",
        flags: [],
      });
      printLine(`Reconciled ${scan.achievements.length} achievements from ${mainUsername}'s public profile.`);
      for (const entry of scan.achievements) printLine(`  ${describeScraped(entry)}`);
    }
  }

  const entries = Object.entries(file.entries).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    printLine("No known progress yet. Set levels with `gh-forge progress <id> <level>` or run `--sync`.");
    return 0;
  }
  section("Known progress");
  for (const [id, entry] of entries) {
    printLine(`  ${id}: level ${entry.level} (${entry.source}${entry.updatedAt === undefined ? "" : `, ${entry.updatedAt}`})`);
  }
  return 0;
}

function getConfigKey(config: Config, key: string): unknown {
  const parts = key.split(NESTED_SEPARATOR);
  let current: unknown = config;
  for (const part of parts) {
    if (current !== null && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function setConfigKey(config: Config, key: string, value: unknown): void {
  const parts = key.split(NESTED_SEPARATOR);
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index] ?? "";
    const next = current[part];
    if (next === null || typeof next !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last === undefined) {
    throw new UsageError(`Invalid config key "${key}"`);
  }
  current[last] = value;
}

function coerceValue(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}