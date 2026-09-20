import { ConfigStore, resolveMainAccountId } from "../config/config.js";
import { ProgressStore } from "../config/progress.js";
import { resolveHomeDir, resolvePaths, type GafPaths } from "../config/paths.js";
import type { Config } from "../config/schema.js";
import { AccountManager } from "../accounts/account-manager.js";
import { accountsFromConfig } from "../accounts/account.js";
import { createLogger, type LogLevel, type Logger } from "../utils/logger.js";
import { ConfigError } from "../utils/errors.js";

/**
 * The global CLI options.
 */
export interface GlobalCliOptions {
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Resolves the paths for the CLI.
 *
 * @returns The paths for the CLI.
 */
export function pathsFor(): GafPaths {
  return resolvePaths(resolveHomeDir());
}

/**
 * Builds a logger for the CLI.
 *
 * @param _paths - The paths for the CLI.
 * @param options - The CLI options.
 * @returns The logger.
 */
export function loggerFor(_paths: GafPaths, options: GlobalCliOptions): Logger {
  const level: LogLevel =
    options.verbose === true ? "debug" : options.quiet === true ? "error" : "info";
  return createLogger({ level, prefix: `[gh-forge] ` });
}

/**
 * Loads the configuration or throws an error.
 *
 * @param paths - The paths for the CLI.
 * @returns The configuration.
 */
export async function loadConfigOrThrow(paths: GafPaths): Promise<Config> {
  const store = new ConfigStore(paths);
  return store.load();
}

/**
 * The bundle of an account manager and configuration.
 *
 * @property manager - The account manager.
 * @property config - The configuration.
 */
export interface AccountManagerBundle {
  manager: AccountManager;
  config: Config;
}

/**
 * Builds an AccountManager without requiring progress/planning context.
 *
 * @param paths - The paths for the CLI.
 * @param options - The CLI options.
 * @param config - The configuration.
 * @returns The account manager bundle.
 */
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

/**
 * Builds a config store for the CLI.
 *
 * @param paths - The paths for the CLI.
 * @returns The config store.
 */
export function configStoreFor(paths: GafPaths): ConfigStore {
  return new ConfigStore(paths);
}

/**
 * Builds a progress store for the CLI.
 *
 * @param paths - The paths for the CLI.
 * @returns The progress store.
 */
export function progressStoreFor(paths: GafPaths): ProgressStore {
  return new ProgressStore(paths);
}

/**
 * Resolves the main account ID or throws an error.
 *
 * @param config - The configuration.
 * @returns The main account ID.
 */
export function mainAccountIdOrThrow(config: Config): string {
  const mainId = resolveMainAccountId(config);
  if (mainId === null) {
    throw new ConfigError("No main account configured", [
      "Run `gh-forge accounts add main --role main --username <login>`.",
    ]);
  }
  return mainId;
}
