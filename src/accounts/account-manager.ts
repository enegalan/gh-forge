import type { GitHubClient } from "../github/github-client.js";
import { createGitHubClient } from "../github/github-client.js";
import { FetchHttpClient } from "../github/http/http-client.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { AuthError, AccountError, errorMessage } from "../utils/errors.js";
import { redactSecrets } from "../utils/redact.js";
import type { Account } from "./account.js";
import { findAccount, helperAccounts } from "./account.js";
import { emptyCapabilities, type AccountCapabilities } from "./capabilities.js";
import { createTokenProvider, TokenCache, defaultExec, type ExecFn, type TokenProvider } from "./auth/token-providers.js";

export interface AuthenticatedAccount {
  account: Account;
  login: string;
  scopes: string[];
  client: GitHubClient;
}

export interface SandboxProbeTarget {
  owner: string;
  name: string;
}

export interface AccountManagerOptions {
  accounts: Account[];
  minIntervalMs?: number;
  logger?: Logger;
  exec?: ExecFn;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
}

export class AccountManager {
  private readonly accounts: Account[];
  private readonly minIntervalMs: number;
  private readonly logger: Logger;
  private readonly exec: ExecFn | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly tokenCache = new TokenCache();
  private readonly providers = new Map<string, TokenProvider>();
  private readonly clients = new Map<string, GitHubClient>();
  private readonly identities = new Map<string, AuthenticatedAccount>();

  constructor(options: AccountManagerOptions) {
    this.accounts = options.accounts;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.logger = options.logger ?? createLogger();
    this.exec = options.exec;
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl;
    this.sleep = options.sleep;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  all(): Account[] {
    return [...this.accounts];
  }

  get(accountId: string): Account {
    const account = findAccount(this.accounts, accountId);
    if (account === undefined) {
      throw new AccountError("ACCOUNT_NOT_FOUND", `Unknown account "${accountId}"`, [
        "Run `gh-forge accounts list` to see configured accounts.",
      ]);
    }
    return account;
  }

  tryGet(accountId: string): Account | null {
    return findAccount(this.accounts, accountId) ?? null;
  }

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

  helpers(): Account[] {
    return helperAccounts(this.accounts);
  }

  providerFor(account: Account): TokenProvider {
    const cached = this.providers.get(account.id);
    if (cached !== undefined) return cached;
    const provider = createTokenProvider(account, this.exec ?? defaultExec, this.env);
    this.providers.set(account.id, provider);
    return provider;
  }

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

  tokenProviderDescription(account: Account): string {
    try {
      return this.providerFor(account).describe();
    } catch {
      return "(unavailable)";
    }
  }

  troubleshootFor(account: Account): string[] {
    try {
      return this.providerFor(account).troubleshoot();
    } catch {
      return [];
    }
  }

  /**
   * Authenticates an account and proves that the token belongs to the username
   * the user configured. GAF refuses to continue if they do not match.
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
          "GAF never uses credentials for an account it cannot identify.",
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
   */
  async probe(accountId: string, sandbox: SandboxProbeTarget | null = null): Promise<AccountCapabilities> {
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
        notes.push(`Sandbox repository ${sandbox.owner}/${sandbox.name} does not exist yet (gh-forge run can create it).`);
      } else {
        const push = repository.permissions?.push === true;
        capabilities.canPushToSandbox = push;
        capabilities.canComment = !repository.private || push;
        capabilities.canCreateDiscussions = repository.has_discussions && (!repository.private || push);
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

    capabilities.commitEmail = await this.resolveCommitEmail(account, authenticated, notes);
    capabilities.canAttributeCoAuthoredCommit = capabilities.commitEmail !== null;
    if (capabilities.commitEmail === null) {
      notes.push(
        `Set a commit email for "${account.id}" (\`gh-forge accounts set-email ${account.id} <email>\`) to use Pair Extraordinaire.`,
      );
    }

    return capabilities;
  }

  private async resolveCommitEmail(
    account: Account,
    authenticated: AuthenticatedAccount,
    notes: string[],
  ): Promise<string | null> {
    if (account.commitEmail !== undefined && account.commitEmail !== "") return account.commitEmail;
    try {
      const emails = await authenticated.client.users.listEmails();
      const verified = emails.filter((entry) => entry.verified);
      const primary = verified.find((entry) => entry.primary) ?? verified[0];
      if (primary !== undefined) return primary.email;
      if (emails.length === 0) {
        notes.push("Could not read account emails (the token likely lacks the `user:email` scope).");
      }
    } catch (error) {
      notes.push(`Could not read account emails: ${redactSecrets(errorMessage(error))}`);
    }
    return null;
  }

  clearCache(): void {
    this.tokenCache.clear();
    this.identities.clear();
  }
}
