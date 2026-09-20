import type { GafPaths } from "./paths.js";
import { configSchema, createDefaultConfig, type Config } from "./schema.js";
import type { AccountRefConfig } from "./schema.js";
import { ConfigError } from "../utils/errors.js";
import { pathExists, readJson, writeJsonAtomic } from "../utils/fs-atomic.js";
import { z } from "zod";

/**
 * A config store.
 */
export class ConfigStore {
  /**
   * The paths.
   */
  private readonly paths: GafPaths;

  /**
   * Creates a new config store.
   *
   * @param paths - The paths.
   */
  constructor(paths: GafPaths) {
    this.paths = paths;
  }

  /**
   * Checks if the config file exists.
   *
   * @returns True if the config file exists, false otherwise.
   */
  async exists(): Promise<boolean> {
    return pathExists(this.paths.configFile);
  }

  /**
   * Loads the config from the file.
   *
   * @returns The config.
   */
  async load(): Promise<Config> {
    const raw = await readJson<unknown>(this.paths.configFile);
    if (raw === null) {
      throw new ConfigError(`No configuration found at ${this.paths.configFile}`, [
        "Run `gh-forge init` to create it.",
      ]);
    }
    return this.parse(raw);
  }

  /**
   * Loads the config from the file or creates a default config if the file does not exist.
   *
   * @returns The config.
   */
  async loadOrDefault(): Promise<Config> {
    const raw = await readJson<unknown>(this.paths.configFile);
    if (raw === null) return createDefaultConfig();
    return this.parse(raw);
  }

  /**
   * Parses the config from the raw data.
   *
   * @param raw - The raw data.
   * @returns The config.
   */
  parse(raw: unknown): Config {
    const result = configSchema.safeParse(raw);
    if (!result.success) {
      throw new ConfigError(
        `Invalid configuration in ${this.paths.configFile}: ${formatZodError(result.error)}`,
        ["Fix the file by hand or re-run `gh-forge init --force`."],
      );
    }
    return result.data;
  }

  /**
   * Saves the config to the file.
   *
   * @param config - The config.
   */
  async save(config: Config): Promise<void> {
    const validated = this.parse(config);
    await writeJsonAtomic(this.paths.configFile, validated);
  }

  /**
   * Updates the config.
   *
   * @param mutator - The mutator.
   * @returns The config.
   */
  async update(mutator: (config: Config) => Config | void): Promise<Config> {
    const current = await this.loadOrDefault();
    const draft = structuredClone(current);
    const result = mutator(draft);
    const next = result === undefined ? draft : result;
    await this.save(next);
    return this.parse(next);
  }

  /**
   * Ensures the config is initialized.
   *
   * @returns The config.
   */
  async ensureInitialized(): Promise<Config> {
    const config = await this.loadOrDefault();
    if (!(await this.exists())) {
      await this.save(config);
    }
    return config;
  }
}

/**
 * Formats a Zod error.
 *
 * @param error - The error.
 * @returns The formatted error.
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Returns the account id that should be treated as `main`, if any.
 *
 * @param config - The config.
 * @returns The main account id.
 */
export function resolveMainAccountId(config: Config): string | null {
  if (config.mainAccount !== null && config.mainAccount in config.accounts) {
    return config.mainAccount;
  }
  const mains = Object.entries(config.accounts)
    .filter(([, account]) => account.role === "main")
    .map(([id]) => id);
  if (mains.length === 1) return mains[0] ?? null;
  return null;
}

/**
 * Lists the accounts.
 *
 * @param config - The config.
 * @returns The accounts.
 */
export function listAccounts(config: Config): Array<{ id: string; account: AccountRefConfig }> {
  return Object.entries(config.accounts)
    .map(([id, account]) => ({ id, account }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Lists the helper account ids.
 *
 * @param config - The config.
 * @returns The helper account ids.
 */
export function listHelperAccountIds(config: Config): string[] {
  const mainId = resolveMainAccountId(config);
  return listAccounts(config)
    .filter(({ id, account }) => account.role === "helper" && id !== mainId)
    .map(({ id }) => id);
}
