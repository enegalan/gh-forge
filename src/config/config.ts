import type { GafPaths } from "./paths.js";
import { configSchema, createDefaultConfig, type Config } from "./schema.js";
import type { AccountRefConfig } from "./schema.js";
import { ConfigError } from "../utils/errors.js";
import { pathExists, readJson, writeJsonAtomic } from "../utils/fs-atomic.js";
import { z } from "zod";

export class ConfigStore {
  private readonly paths: GafPaths;

  constructor(paths: GafPaths) {
    this.paths = paths;
  }

  async exists(): Promise<boolean> {
    return pathExists(this.paths.configFile);
  }

  async load(): Promise<Config> {
    const raw = await readJson<unknown>(this.paths.configFile);
    if (raw === null) {
      throw new ConfigError(
        `No configuration found at ${this.paths.configFile}`,
        ["Run `gh-forge init` to create it."],
      );
    }
    return this.parse(raw);
  }

  async loadOrDefault(): Promise<Config> {
    const raw = await readJson<unknown>(this.paths.configFile);
    if (raw === null) return createDefaultConfig();
    return this.parse(raw);
  }

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

  async save(config: Config): Promise<void> {
    const validated = this.parse(config);
    await writeJsonAtomic(this.paths.configFile, validated);
  }

  async update(mutator: (config: Config) => Config | void): Promise<Config> {
    const current = await this.loadOrDefault();
    const draft = structuredClone(current);
    const result = mutator(draft);
    const next = result === undefined ? draft : result;
    await this.save(next);
    return this.parse(next);
  }

  async ensureInitialized(): Promise<Config> {
    const config = await this.loadOrDefault();
    if (!(await this.exists())) {
      await this.save(config);
    }
    return config;
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/** Returns the account id that should be treated as `main`, if any. */
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

export function listAccounts(config: Config): Array<{ id: string; account: AccountRefConfig }> {
  return Object.entries(config.accounts)
    .map(([id, account]) => ({ id, account }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function listHelperAccountIds(config: Config): string[] {
  const mainId = resolveMainAccountId(config);
  return listAccounts(config)
    .filter(({ id, account }) => account.role === "helper" && id !== mainId)
    .map(({ id }) => id);
}