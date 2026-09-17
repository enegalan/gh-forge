import type { AccountRefConfig, Config } from "../config/schema.js";

/**
 * An `Account` is always a GitHub account owned and controlled by the user.
 *
 * `role` is only a convenience to distinguish the user's primary account from
 * their additional accounts; every account is authenticated by the user and GAF
 * never uses accounts belonging to somebody else, never creates accounts and
 * never asks for passwords.
 */
export type AccountRole = "main" | "helper";

export interface Account {
  id: string;
  username: string;
  role: AccountRole;
  auth: AccountRefConfig["auth"];
  commitEmail?: string;
  note?: string;
}

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

export function accountsFromConfig(config: Config): Account[] {
  return Object.entries(config.accounts)
    .map(([id, ref]) => toAccount(id, ref))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function findAccount(accounts: Account[], id: string): Account | undefined {
  return accounts.find((account) => account.id === id);
}

export function mainAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.role === "main");
}

export function helperAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.role === "helper");
}