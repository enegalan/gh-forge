import { ConfigStore, resolveMainAccountId } from "../config/config.js";
import { ProgressStore } from "../config/progress.js";
import { resolveHomeDir, resolvePaths, type GafPaths } from "../config/paths.js";
import type { Config } from "../config/schema.js";
import { AccountManager } from "../accounts/account-manager.js";
import { accountsFromConfig } from "../accounts/account.js";
import { createLogger, type LogLevel, type Logger } from "../utils/logger.js";
import { ConfigError } from "../utils/errors.js";

export interface GlobalCliOptions {
  verbose?: boolean;
  quiet?: boolean;
}

export function pathsFor(): GafPaths {
  return resolvePaths(resolveHomeDir());
}

export function loggerFor(_paths: GafPaths, options: GlobalCliOptions): Logger {
  const level: LogLevel = options.verbose === true ? "debug" : options.quiet === true ? "error" : "info";
  return createLogger({ level, prefix: `[gh-forge] ` });
}

export async function loadConfigOrThrow(paths: GafPaths): Promise<Config> {
  const store = new ConfigStore(paths);
  return store.load();
}

export interface AccountManagerBundle {
  manager: AccountManager;
  config: Config;
}

/** Builds an AccountManager without requiring progress/planning context. */
export async function buildAccountManager(
  paths: GafPaths,
  options: GlobalCliOptions,
  config: Config,
): Promise<AccountManager> {
  return new AccountManager({
    accounts: accountsFromConfig(config),
    minIntervalMs: config.execution.minIntervalMs,
    logger: loggerFor(paths, options),
  });
}

export function configStoreFor(paths: GafPaths): ConfigStore {
  return new ConfigStore(paths);
}

export function progressStoreFor(paths: GafPaths): ProgressStore {
  return new ProgressStore(paths);
}

export function mainAccountIdOrThrow(config: Config): string {
  const mainId = resolveMainAccountId(config);
  if (mainId === null) {
    throw new ConfigError("No main account configured", [
      "Run `gh-forge accounts add main --role main --username <login>`.",
    ]);
  }
  return mainId;
}
