import type { GafPaths } from "../../config/paths.js";
import type { Config } from "../../config/schema.js";
import { resolveHomeDir, resolvePaths } from "../../config/paths.js";
import { configStoreFor } from "../context.js";
import { printLine, printJson, section } from "../ui/format.js";
import { UsageError } from "../../utils/errors.js";

const NESTED_SEPARATOR = ".";

const CONFIG_KEYS: Array<{ key: string; description: string }> = [
  { key: "mainAccount", description: "main account id" },
  { key: "policy.allowHighRisk", description: "allow high-risk achievements (Galaxy Brain, Starstruck)" },
  { key: "execution.minIntervalMs", description: "minimum interval between actions (ms)" },
  { key: "execution.mergeMethod", description: "merge method: merge, squash, or rebase" },
  { key: "execution.branchPrefix", description: "branch name prefix" },
  { key: "profileScan.enabled", description: "enable profile scanning" },
  { key: "profileScan.baseUrl", description: "GitHub base URL for profile scans" },
];

/** Shows configurable keys with their current values. */
export async function configKeysCommand(): Promise<number> {
  const store = configStoreFor(resolvePaths(resolveHomeDir()));
  const config = await store.loadOrDefault();
  section("Configurable keys");
  for (const { key, description } of CONFIG_KEYS) {
    const value = getConfigKey(config, key);
    printLine(`  ${key} = ${JSON.stringify(value)}  (${description})`);
  }
  return 0;
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