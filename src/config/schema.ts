import { z } from "zod";

/**
 * Configuration schema.
 *
 * Accounts, targets, knownProgress and executionState are deliberately kept in
 * separate files so that "what the user knows", "what the user wants" and "what
 * GAF already did" can never be confused with each other.
 */

export const accountAuthSchema = z.discriminatedUnion("kind", [
  /** Delegate to the official GitHub CLI (tokens live in the OS keychain). */
  z.object({
    kind: z.literal("gh"),
    login: z.string().min(1).optional(),
  }),
  /**
   * Any command that prints the token on stdout, e.g.
   * `security find-generic-password -s gh-forge-helper-1 -w`.
   * The token is read into memory only and never persisted by GAF.
   */
  z.object({
    kind: z.literal("tokenCommand"),
    command: z.string().min(1),
  }),
  /** Read the token from an environment variable, e.g. GH_FORGE_TOKEN__HELPER_1. */
  z.object({
    kind: z.literal("env"),
    var: z.string().min(1),
  }),
]);

export const accountRefSchema = z.object({
  username: z.string().min(1),
  role: z.enum(["main", "helper"]),
  auth: accountAuthSchema.default({ kind: "gh" }),
  /** Email associated with the account, used as `Co-authored-by:` trailer. */
  commitEmail: z.string().email().optional(),
  note: z.string().optional(),
});

export const sandboxRepositorySchema = z.object({
  owner: z.string().min(1).optional(),
  name: z.string().min(1).default("gh-forge-sandbox"),
  visibility: z.enum(["public", "private"]).default("public"),
  discussions: z.boolean().default(true),
  description: z
    .string()
    .default("Sandbox repository used by GitHub Achievement Forge (gh-forge)."),
});

export const policySchema = z.object({
  allowOptIn: z.boolean().default(false),
  allowHighRisk: z.boolean().default(false),
});

export const executionSchema = z.object({
  minIntervalMs: z.number().int().min(0).max(60_000).default(1_500),
  maxActionsPerRun: z.number().int().min(1).max(5_000).default(50),
  maxActionsPerHour: z.number().int().min(1).max(5_000).default(200),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
  branchPrefix: z.string().min(1).default("gh-forge"),
});

export const profileScanSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().url().default("https://github.com"),
});

export const configSchema = z.object({
  version: z.literal(1).default(1),
  mainAccount: z.string().min(1).nullable().default(null),
  accounts: z.record(accountRefSchema).default({}),
  targets: z.record(z.number().int().min(1).max(4)).default({}),
  repositories: z.object({ sandbox: sandboxRepositorySchema.nullable().default(null) }).default({}),
  policy: policySchema.default({}),
  execution: executionSchema.default({}),
  profileScan: profileScanSchema.default({}),
});

export const progressEntrySchema = z.object({
  level: z.number().int().min(0).max(4),
  source: z.enum(["manual", "scraped", "observed"]).default("manual"),
  updatedAt: z.string().optional(),
  note: z.string().optional(),
});

export const progressFileSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.record(progressEntrySchema).default({}),
});

export type AccountAuthConfig = z.infer<typeof accountAuthSchema>;
export type AccountRefConfig = z.infer<typeof accountRefSchema>;
export type SandboxRepositoryConfig = z.infer<typeof sandboxRepositorySchema>;
export type PolicyConfig = z.infer<typeof policySchema>;
export type ExecutionConfig = z.infer<typeof executionSchema>;
export type ProfileScanConfig = z.infer<typeof profileScanSchema>;
export type Config = z.infer<typeof configSchema>;
export type ProgressEntry = z.infer<typeof progressEntrySchema>;
export type ProgressFile = z.infer<typeof progressFileSchema>;

export function createDefaultConfig(): Config {
  return configSchema.parse({});
}
