import type { AccountRefConfig, Config } from "../config/schema.js";

/**
 * The role of an account.
 */
export type AccountRole = "main" | "helper";

/**
 * An account is a GitHub account owned and controlled by the user.
 */
export interface Account {
  id: string;
  username: string;
  role: AccountRole;
  auth: AccountRefConfig["auth"];
  commitEmail?: string;
  note?: string;
}

/**
 * Converts an account reference configuration to an account.
 *
 * @param id - The ID of the account.
 * @param ref - The account reference configuration.
 * @returns The account.
 */
export function toAccount(id: string, ref: AccountRefConfig): Account {
  return {
    id,
    username: ref.username,
    role: ref.role,
    auth: ref.auth,
    ...(ref.commitEmail === undefined ? {} : { commitEmail: ref.commitEmail }),
    ...(ref.note === undefined ? {} : { note: ref.note }),
  };
}

/**
 * Converts a configuration to a list of accounts.
 *
 * @param config - The configuration.
 * @returns The accounts.
 */
export function accountsFromConfig(config: Config): Account[] {
  return Object.entries(config.accounts)
    .map(([id, ref]) => toAccount(id, ref))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Finds an account by its ID.
 *
 * @param accounts - The accounts.
 * @param id - The ID of the account.
 * @returns The account or undefined if not found.
 */
export function findAccount(accounts: Account[], id: string): Account | undefined {
  return accounts.find((account) => account.id === id);
}

/**
 * Finds the main accounts.
 *
 * @param accounts - The accounts.
 * @returns The main accounts.
 */
export function mainAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.role === "main");
}

/**
 * Finds the helper accounts.
 *
 * @param accounts - The accounts.
 * @returns The helper accounts.
 */
export function helperAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.role === "helper");
}
