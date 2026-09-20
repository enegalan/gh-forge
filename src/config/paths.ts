import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The paths for the gh-forge configuration.
 */
export interface GafPaths {
  home: string;
  configFile: string;
  accountsFile: string;
  progressFile: string;
  runsDir: string;
  cacheDir: string;
  auditLog: string;
  planFile: string;
}

/**
 * The default home directory name.
 */
export const DEFAULT_HOME_DIRNAME = ".gh-forge";

/**
 * Resolves the home directory.
 *
 * @param env - The environment.
 * @returns The home directory.
 */
export function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["GH_FORGE_HOME"];
  if (override !== undefined && override.trim() !== "") return override;
  return join(homedir(), DEFAULT_HOME_DIRNAME);
}

/**
 * Resolves the paths.
 *
 * @param home - The home directory.
 * @returns The paths.
 */
export function resolvePaths(home: string = resolveHomeDir()): GafPaths {
  return {
    home,
    configFile: join(home, "config.json"),
    accountsFile: join(home, "accounts.json"),
    progressFile: join(home, "progress.json"),
    runsDir: join(home, "state", "runs"),
    cacheDir: join(home, "cache"),
    auditLog: join(home, "state", "audit.log"),
    planFile: join(home, "state", "last-plan.json"),
  };
}
