import type { Account } from "../accounts/account.js";
import { accountsFromConfig, toAccount } from "../accounts/account.js";
import type { AccountCapabilities } from "../accounts/capabilities.js";
import { AccountManager } from "../accounts/account-manager.js";
import type { ExecFn } from "../accounts/auth/token-providers.js";
import { ConfigStore, resolveMainAccountId } from "../config/config.js";
import { ProgressStore } from "../config/progress.js";
import type { GafPaths } from "../config/paths.js";
import type { Config } from "../config/schema.js";
import { RunStore } from "../state/run-store.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { AccountError, ConfigError, ExecutionError } from "../utils/errors.js";
import { createAchievementRegistry, type AchievementRegistry } from "../achievements/achievement-registry.js";
import type { AchievementContext, AchievementExecutor, SandboxTarget } from "../achievements/achievement.js";

export interface RuntimeOptions {
  paths: GafPaths;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
  exec?: ExecFn;
  verifyAccounts?: boolean;
}

export interface Runtime {
  paths: GafPaths;
  config: Config;
  knownProgress: Record<string, number>;
  accounts: Account[];
  accountManager: AccountManager;
  registry: AchievementRegistry;
  sandbox: SandboxTarget;
  capabilities: Map<string, AccountCapabilities>;
  authErrors: Map<string, string>;
  configStore: ConfigStore;
  progressStore: ProgressStore;
  runStore: RunStore;
  logger: Logger;
}

/** Loads config, progress and accounts, and probes every account (read-only). */
export async function loadRuntime(options: RuntimeOptions): Promise<Runtime> {
  const logger = options.logger ?? createLogger();
  const configStore = new ConfigStore(options.paths);
  const progressStore = new ProgressStore(options.paths);
  const runStore = new RunStore(options.paths);

  const config = await configStore.load();
  const mainId = resolveMainAccountId(config);
  if (mainId === null) {
    throw new AccountError("ACCOUNT_NOT_FOUND", "No main account is configured", [
      "Run `gh-forge accounts add main --role main --username <login>`.",
    ]);
  }
  const mainRef = config.accounts[mainId];
  if (mainRef === undefined) {
    throw new ConfigError(`mainAccount "${mainId}" does not exist in accounts`);
  }

  const accounts = accountsFromConfig(config);
  const accountManager = new AccountManager({
    accounts,
    minIntervalMs: config.execution.minIntervalMs,
    logger,
    ...(options.exec === undefined ? {} : { exec: options.exec }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
  });

  const sandbox = resolveSandbox(config, mainRef.username);
  const knownProgress = await progressStore.levels();
  const capabilities = new Map<string, AccountCapabilities>();
  const authErrors = new Map<string, string>();

  if (options.verifyAccounts ?? true) {
    for (const account of accounts) {
      const probed = await accountManager.probe(account.id, {
        owner: sandbox.owner,
        name: sandbox.name,
      });
      capabilities.set(account.id, probed);
      if (!probed.authenticated) {
        const hints = accountManager.troubleshootFor(account);
        authErrors.set(
          account.id,
          `Account "${account.id}"${account.role === "main" ? " (main)" : ""} is not authenticated. ${hints.join(" ")}`,
        );
      }
    }
  }

  return {
    paths: options.paths,
    config,
    knownProgress,
    accounts,
    accountManager,
    registry: createAchievementRegistry(),
    sandbox,
    capabilities,
    authErrors,
    configStore,
    progressStore,
    runStore,
    logger,
  };
}

export function resolveSandbox(config: Config, mainUsername: string): SandboxTarget {
  const sandbox = config.repositories.sandbox;
  if (sandbox === null) {
    return {
      owner: mainUsername,
      name: "gh-forge-sandbox",
      visibility: "public",
      discussions: true,
    };
  }
  return {
    owner: sandbox.owner ?? mainUsername,
    name: sandbox.name,
    visibility: sandbox.visibility,
    discussions: sandbox.discussions,
  };
}

export function requireMainAccount(runtime: Runtime): Account {
  const mainId = resolveMainAccountId(runtime.config);
  if (mainId === null) {
    throw new AccountError("ACCOUNT_NOT_FOUND", "No main account is configured");
  }
  const ref = runtime.config.accounts[mainId];
  if (ref === undefined) {
    throw new ConfigError(`mainAccount "${mainId}" does not exist in accounts`);
  }
  return toAccount(mainId, ref);
}

export async function buildAchievementContext(
  runtime: Runtime,
  executor: AchievementExecutor,
  executionState: AchievementContext["executionState"] = null,
): Promise<AchievementContext> {
  const mainAccount = requireMainAccount(runtime);
  const mainAuthenticated = await runtime.accountManager.authenticate(mainAccount.id);

  return {
    mainAccount,
    accounts: runtime.accounts,
    accountCapabilities: runtime.capabilities,
    github: mainAuthenticated.client,
    clientFor: (accountId: string) => {
      const account = runtime.accountManager.get(accountId);
      return runtime.accountManager.clientFor(account);
    },
    knownProgress: runtime.knownProgress,
    executionState,
    config: runtime.config,
    sandbox: runtime.sandbox,
    logger: runtime.logger,
    policyGates: {
      allowHighRisk: runtime.config.policy.allowHighRisk,
    },
    executor,
  };
}

/**
 * Executor used while planning: it guarantees that `gh-forge plan` (and every
 * validation step) can never mutate GitHub, even by accident.
 */
export function readOnlyExecutor(): AchievementExecutor {
  return {
    runActions: () => {
      throw new ExecutionError(
        "The planner is read-only and never executes actions; use `gh-forge run` instead.",
      );
    },
  };
}

export function describeAuthErrors(runtime: Runtime): string[] {
  const messages: string[] = [];
  for (const [, error] of runtime.authErrors) messages.push(error);
  return messages;
}
