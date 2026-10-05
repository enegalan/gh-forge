import type { GitHubClient } from "../github/github-client.js";
import { createGitHubClient } from "../github/github-client.js";
import type { GitHubEmail } from "../github/types.js";
import { FetchHttpClient } from "../github/http/http-client.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { AuthError, AccountError, errorMessage } from "../utils/errors.js";
import { redactSecrets } from "../utils/redact.js";
import type { Account } from "./account.js";
import { findAccount, helperAccounts } from "./account.js";
import { emptyCapabilities, type AccountCapabilities } from "./capabilities.js";
import { createTokenProvider, TokenCache, type TokenProvider } from "./auth/token-providers.js";

/**
 * An authenticated account is an account that has been authenticated and has a GitHub client.
 */
interface AuthenticatedAccount {
  account: Account;
  login: string;
  scopes: string[];
  client: GitHubClient;
}

/**
 * A sandbox probe target is a repository that can be used to probe an account.
 */
interface SandboxProbeTarget {
  owner: string;
  name: string;
}

/**
 * The outcome of resolving an account's commit email.
 *
 * `verified` is true only when GitHub confirmed the address belongs to the
 * account. It is the single source of truth for whether a `Co-authored-by`
 * trailer will be credited.
 */
interface CommitEmailResolution {
  email: string | null;
  verified: boolean;
}

/**
 * Whether a token's scopes allow reading the account's email addresses.
 *
 * `GET /user/emails` answers 404 without `user:email`, which the HTTP layer
 * reports as "no data" rather than an error, so the scopes are the only
 * reliable way to tell a missing scope apart from an account with no emails.
 *
 * @param scopes - The token scopes.
 * @returns True if emails can be read.
 */
function canReadEmails(scopes: string[]): boolean {
  return scopes.includes("user") || scopes.includes("user:email");
}

/**
 * Compares email addresses case-insensitively.
 *
 * @param left - The first address.
 * @param right - The second address.
 * @returns True if both are the same address.
 */
function sameEmail(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Renders verified addresses for an error message.
 *
 * @param verified - The verified addresses.
 * @returns The rendered list.
 */
function describeEmails(verified: GitHubEmail[]): string {
  if (verified.length === 0) return "(none)";
  return verified.map((entry) => `"${entry.email}"`).join(", ");
}

/**
 * Options for the AccountManager.
 */
interface AccountManagerOptions {
  accounts: Account[];
  minIntervalMs?: number;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
}

/**
 * Manages the accounts and their authentication.
 */
export class AccountManager {
  /**
   * The accounts.
   */
  private readonly accounts: Account[];
  /**
   * The minimum interval between requests.
   */
  private readonly minIntervalMs: number;
  /**
   * The logger.
   */
  private readonly logger: Logger;
  /**
   * The environment variables.
   */
  private readonly env: NodeJS.ProcessEnv;
  /**
   * The fetch implementation.
   */
  private readonly fetchImpl: typeof fetch | undefined;
  /**
   * The sleep implementation.
   */
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;
  /**
   * The request timeout.
   */
  private readonly requestTimeoutMs: number | undefined;
  /**
   * The token cache.
   */
  private readonly tokenCache = new TokenCache();
  /**
   * The token providers.
   */
  private readonly providers = new Map<string, TokenProvider>();
  /**
   * The GitHub clients.
   */
  private readonly clients = new Map<string, GitHubClient>();
  /**
   * The authenticated accounts.
   */
  private readonly identities = new Map<string, AuthenticatedAccount>();

  /**
   * Creates a new account manager.
   *
   * @param options - The options.
   */
  constructor(options: AccountManagerOptions) {
    this.accounts = options.accounts;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.logger = options.logger ?? createLogger();
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl;
    this.sleep = options.sleep;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  /**
   * Gets all accounts.
   *
   * @returns The accounts.
   */
  all(): Account[] {
    return [...this.accounts];
  }

  /**
   * Gets an account by its ID.
   *
   * @param accountId - The ID of the account.
   * @returns The account.
   */
  get(accountId: string): Account {
    const account = findAccount(this.accounts, accountId);
    if (account === undefined) {
      throw new AccountError("ACCOUNT_NOT_FOUND", `Unknown account "${accountId}"`, [
        "Run `gh-forge accounts list` to see configured accounts.",
      ]);
    }
    return account;
  }

  /**
   * Tries to get an account by its ID.
   *
   * @param accountId - The ID of the account.
   * @returns The account or null if not found.
   */
  tryGet(accountId: string): Account | null {
    return findAccount(this.accounts, accountId) ?? null;
  }

  /**
   * Requires a main account.
   *
   * @returns The main account.
   */
  requireMain(): Account {
    const mains = this.accounts.filter((account) => account.role === "main");
    const main = mains[0];
    if (main === undefined) {
      throw new AccountError("ACCOUNT_NOT_FOUND", "No main account configured", [
        "Run `gh-forge accounts add main --role main --username <login>`.",
      ]);
    }
    return main;
  }

  /**
   * The helper accounts.
   *
   * @returns The helper accounts.
   */
  helpers(): Account[] {
    return helperAccounts(this.accounts);
  }

  /**
   * Gets a token provider for an account.
   *
   * @param account - The account.
   * @returns The token provider.
   */
  providerFor(account: Account): TokenProvider {
    const cached = this.providers.get(account.id);
    if (cached !== undefined) return cached;
    const provider = createTokenProvider(account, this.env);
    this.providers.set(account.id, provider);
    return provider;
  }

  /**
   * Gets a GitHub client for an account.
   *
   * @param account - The account.
   * @returns The GitHub client.
   */
  clientFor(account: Account): GitHubClient {
    const cached = this.clients.get(account.id);
    if (cached !== undefined) return cached;
    const provider = this.providerFor(account);
    const http = new FetchHttpClient({
      token: () => this.tokenCache.resolve(account.id, provider),
      minIntervalMs: this.minIntervalMs,
      logger: this.logger.child(`[${account.id}] `),
      ...(this.fetchImpl === undefined ? {} : { fetchImpl: this.fetchImpl }),
      ...(this.sleep === undefined ? {} : { sleep: this.sleep }),
      ...(this.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: this.requestTimeoutMs }),
    });
    const client = createGitHubClient({ http });
    this.clients.set(account.id, client);
    return client;
  }

  /**
   * Gets a description of the token provider for an account.
   *
   * @param account - The account.
   * @returns The description of the token provider.
   */
  tokenProviderDescription(account: Account): string {
    try {
      return this.providerFor(account).describe();
    } catch {
      return "(unavailable)";
    }
  }

  /**
   * Gets troubleshooting information for an account.
   *
   * @param account - The account.
   * @returns The troubleshooting information.
   */
  troubleshootFor(account: Account): string[] {
    try {
      return this.providerFor(account).troubleshoot();
    } catch {
      return [];
    }
  }

  /**
   * Authenticates an account and proves that the token belongs to the username
   * the user configured. GitHub Achievement Forge refuses to continue if they do not match.
   *
   * @param accountId - The ID of the account.
   * @returns The authenticated account.
   */
  async authenticate(accountId: string): Promise<AuthenticatedAccount> {
    const cached = this.identities.get(accountId);
    if (cached !== undefined) return cached;

    const account = this.get(accountId);
    const client = this.clientFor(account);
    const { user, scopes } = await client.users.getAuthenticatedIdentity();

    if (user.login.toLowerCase() !== account.username.toLowerCase()) {
      throw new AuthError(
        "AUTH_IDENTITY_MISMATCH",
        `Account "${account.id}" is configured as ${account.username} but the credential belongs to ${user.login}`,
        [
          "Each account must be authenticated with a token belonging to that account.",
          "GitHub Achievement Forge never uses credentials for an account it cannot identify.",
          `Run \`gh-forge accounts remove ${account.id}\` and add it again with the right credentials.`,
        ],
      );
    }

    const authenticated: AuthenticatedAccount = { account, login: user.login, scopes, client };
    this.identities.set(accountId, authenticated);
    return authenticated;
  }

  /**
   * Real capability probe used by `gh-forge accounts test`. Nothing here
   * mutates GitHub; everything is read-only and failures are reported instead of
   * thrown, so the planner can explain exactly what is missing.
   *
   * @param accountId - The ID of the account.
   * @param sandbox - The sandbox probe target.
   * @returns The account capabilities.
   */
  async probe(
    accountId: string,
    sandbox: SandboxProbeTarget | null = null,
  ): Promise<AccountCapabilities> {
    const account = this.get(accountId);
    const capabilities = emptyCapabilities();
    const notes = capabilities.notes;

    let authenticated: AuthenticatedAccount;
    try {
      authenticated = await this.authenticate(accountId);
    } catch (error) {
      notes.push(errorMessage(error));
      for (const hint of error instanceof AuthError ? error.hints : this.troubleshootFor(account)) {
        notes.push(hint);
      }
      return capabilities;
    }

    capabilities.authenticated = true;
    capabilities.login = authenticated.login;
    capabilities.identityMatches = true;
    capabilities.scopes = authenticated.scopes;
    capabilities.hasRepoScope =
      authenticated.scopes.includes("repo") || authenticated.scopes.includes("public_repo");

    const rateLimit = authenticated.client.rateLimit;
    if (rateLimit !== null) {
      capabilities.rateLimitRemaining = rateLimit.remaining;
      capabilities.rateLimitLimit = rateLimit.limit;
    }

    /** Classic PATs with `repo` (or `public_repo`) can create repositories. */
    capabilities.canCreateRepository = capabilities.hasRepoScope;
    if (!capabilities.hasRepoScope) {
      notes.push(
        "Token does not report the `repo` scope; creating repositories may fail. Re-authenticate with `-s repo`.",
      );
    }

    capabilities.canStar = true;
    if (!capabilities.hasRepoScope) {
      notes.push("Starring private repositories requires the `repo` scope.");
    }

    if (sandbox !== null) {
      const repository = await authenticated.client.repositories.get(sandbox.owner, sandbox.name);
      if (repository === null) {
        notes.push(
          `Sandbox repository ${sandbox.owner}/${sandbox.name} does not exist yet (gh-forge run can create it).`,
        );
      } else {
        const push = repository.permissions?.push === true;
        capabilities.canPushToSandbox = push;
        capabilities.canComment = !repository.private || push;
        capabilities.canCreateDiscussions =
          repository.has_discussions && (!repository.private || push);
        if (!repository.has_discussions) {
          notes.push(
            `Discussions are disabled on ${sandbox.owner}/${sandbox.name}; Galaxy Brain cannot be executed there.`,
          );
        }
        if (repository.private && !push) {
          notes.push(
            `${sandbox.owner}/${sandbox.name} is private and this account cannot push; discussions/comments will not work.`,
          );
        }
        if (repository.private) {
          notes.push(
            "Private repository contributions only count towards achievements if private contributions are enabled in profile settings.",
          );
        }
      }
    }

    const resolution = await this.resolveCommitEmail(account, authenticated, notes);
    capabilities.commitEmail = resolution.email;
    capabilities.commitEmailVerified = resolution.verified;
    capabilities.canAttributeCoAuthoredCommit = resolution.email !== null && resolution.verified;
    if (resolution.email === null && (account.commitEmail ?? "") === "") {
      notes.push(
        `Set a commit email for "${account.id}" (\`gh-forge accounts set-email ${account.id} <email>\`) to use Pair Extraordinaire.`,
      );
    }

    return capabilities;
  }

  /**
   * Resolves the commit email for an account and proves GitHub would credit it.
   *
   * GitHub only attributes a `Co-authored-by` trailer when the address is a
   * **verified** email on the co-author's account. A configured email is
   * therefore never trusted on its own: it is looked up in the account's
   * verified email list. Anything unconfirmed is reported instead of used, so
   * a run cannot quietly burn every action on credits GitHub will never grant.
   *
   * @param account - The account.
   * @param authenticated - The authenticated account.
   * @param notes - The notes.
   * @returns The commit email and whether GitHub confirmed it.
   */
  private async resolveCommitEmail(
    account: Account,
    authenticated: AuthenticatedAccount,
    notes: string[],
  ): Promise<CommitEmailResolution> {
    const configured = (account.commitEmail ?? "").trim();

    if (!canReadEmails(authenticated.scopes)) {
      if (configured !== "") {
        notes.push(
          `Cannot confirm that "${configured}" is a verified email on "${authenticated.login}" because the token lacks the \`user:email\` scope, so GitHub would not credit it as co-author. Re-authenticate with \`user:email\`.`,
        );
      }
      return { email: configured === "" ? null : configured, verified: false };
    }

    let emails: GitHubEmail[];
    try {
      emails = await authenticated.client.users.listEmails();
    } catch (error) {
      notes.push(`Could not read account emails: ${redactSecrets(errorMessage(error))}`);
      return { email: configured === "" ? null : configured, verified: false };
    }

    const verified = emails.filter((entry) => entry.verified);

    if (configured !== "") {
      const match = verified.find((entry) => sameEmail(entry.email, configured));
      if (match !== undefined) return { email: match.email, verified: true };
      notes.push(
        `"${configured}" is not a verified email address on "${authenticated.login}", so GitHub would not credit it as co-author. Add and verify it on the account, then run \`gh-forge accounts set-email ${account.id} <email>\`. Verified addresses on "${authenticated.login}": ${describeEmails(verified)}.`,
      );
      return { email: null, verified: false };
    }

    const primary = verified.find((entry) => entry.primary) ?? verified[0];
    if (primary !== undefined) return { email: primary.email, verified: true };
    notes.push(
      `"${authenticated.login}" has no verified email addresses, so GitHub can never credit it as a co-author.`,
    );
    return { email: null, verified: false };
  }

  /**
   * Clears the cache.
   */
  clearCache(): void {
    this.tokenCache.clear();
    this.identities.clear();
  }
}
