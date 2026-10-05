import type { Account } from "./account.js";

/**
 * What an account is actually able to do right now.
 *
 * Configuring an account is not enough: `gh-forge accounts test` probes real
 * capabilities (scopes, permissions on the sandbox repository, Discussions
 * availability) so the planner can stop before executing something impossible.
 */
export interface AccountCapabilities {
  authenticated: boolean;
  identityMatches: boolean;
  login: string | null;
  scopes: string[];
  hasRepoScope: boolean;
  rateLimitRemaining: number | null;
  rateLimitLimit: number | null;
  canCreateRepository: boolean;
  canPushToSandbox: boolean;
  canCreateDiscussions: boolean;
  canComment: boolean;
  canStar: boolean;
  commitEmail: string | null;
  commitEmailVerified: boolean;
  canAttributeCoAuthoredCommit: boolean;
  notes: string[];
}

/**
 * Creates an empty set of capabilities.
 *
 * @returns The empty capabilities.
 */
export function emptyCapabilities(): AccountCapabilities {
  return {
    authenticated: false,
    identityMatches: false,
    login: null,
    scopes: [],
    hasRepoScope: false,
    rateLimitRemaining: null,
    rateLimitLimit: null,
    canCreateRepository: false,
    canPushToSandbox: false,
    canCreateDiscussions: false,
    canComment: false,
    canStar: false,
    commitEmail: null,
    commitEmailVerified: false,
    canAttributeCoAuthoredCommit: false,
    notes: [],
  };
}

/**
 * Describes the capabilities of an account.
 *
 * @param account - The account.
 * @param capabilities - The capabilities.
 * @returns The description of the capabilities.
 */
export function describeCapabilities(
  account: Account,
  capabilities: AccountCapabilities,
): string[] {
  const tick = (value: boolean): string => (value ? "YES" : "NO");
  const verification =
    capabilities.commitEmail === null
      ? ""
      : capabilities.commitEmailVerified
        ? " (verified)"
        : " (NOT verified on GitHub)";
  const lines = [
    `Account: ${account.id} (${account.username})`,
    `  Role: ${account.role}`,
    `  Authenticated: ${tick(capabilities.authenticated)}`,
    `  Identity matches config: ${tick(capabilities.identityMatches)}${capabilities.login === null ? "" : ` (token belongs to ${capabilities.login})`}`,
    `  Scopes: ${capabilities.scopes.length > 0 ? capabilities.scopes.join(", ") : "(none reported)"}`,
    `  Rate limit remaining: ${capabilities.rateLimitRemaining ?? "?"}/${capabilities.rateLimitLimit ?? "?"}`,
    `  Can create repositories: ${tick(capabilities.canCreateRepository)}`,
    `  Can push to sandbox repository: ${tick(capabilities.canPushToSandbox)}`,
    `  Can create discussions: ${tick(capabilities.canCreateDiscussions)}`,
    `  Can comment: ${tick(capabilities.canComment)}`,
    `  Can star repositories: ${tick(capabilities.canStar)}`,
    `  Co-author email: ${capabilities.commitEmail ?? "(unknown)"}${verification}`,
    `  Can be credited in co-authored commits: ${tick(capabilities.canAttributeCoAuthoredCommit)}`,
  ];
  for (const note of capabilities.notes) {
    lines.push(`  note: ${note}`);
  }
  return lines;
}
