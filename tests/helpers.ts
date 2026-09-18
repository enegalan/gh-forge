import type { GitHubClient } from "../src/github/github-client.js";
import type {
  DiscussionService,
  RepositoryDiscussionInfo,
} from "../src/github/services/discussions.js";
import type { IssueService } from "../src/github/services/issues.js";
import type { PullRequestService } from "../src/github/services/pull-requests.js";
import { GitHubHttpError } from "../src/github/http/http-errors.js";
import type { RepositoryService } from "../src/github/services/repositories.js";
import type { StarService } from "../src/github/services/stars.js";
import type { UserService } from "../src/github/services/users.js";
import type { AchievementContext, AchievementExecutor } from "../src/achievements/achievement.js";
import type { Account } from "../src/accounts/account.js";
import type { AccountCapabilities } from "../src/accounts/capabilities.js";
import type { Config } from "../src/config/schema.js";
import { createDefaultConfig } from "../src/config/schema.js";
import type { RunState } from "../src/state/execution-state.js";
import type {
  GitHubBranchProtection,
  GitHubDiscussion,
  GitHubEmail,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
} from "../src/github/types.js";

export class NoopExecutor implements AchievementExecutor {
  readonly calls: Array<{ achievementId: string; actionsCount: number }> = [];

  async runActions(
    _context: AchievementContext,
    achievementId: string,
    actions: unknown[],
  ): Promise<{ achievementId: string; executed: number; skipped: number; failed: number; details: string[] }> {
    this.calls.push({ achievementId, actionsCount: actions.length });
    return { achievementId, executed: 0, skipped: 0, failed: 0, details: [] };
  }
}

export const SAMPLE_USER: GitHubUser = {
  login: "octocat",
  id: 1,
  type: "User",
  html_url: "https://github.com/octocat",
};

export const SAMPLE_REPO: GitHubRepository = {
  id: 1,
  node_id: "R_1",
  name: "gh-forge-sandbox",
  full_name: "octocat/gh-forge-sandbox",
  owner: { login: "octocat" },
  private: false,
  fork: false,
  archived: false,
  has_discussions: true,
  default_branch: "main",
  stargazers_count: 0,
  html_url: "https://github.com/octocat/gh-forge-sandbox",
  permissions: { admin: true, push: true, pull: true },
};

export interface StubOptions {
  repo?: GitHubRepository | null;
  repoResult?: Promise<GitHubRepository | null>;
  branchProtection?: GitHubBranchProtection | null;
  existingIssue?: GitHubIssue | null;
  existingPull?: GitHubPullRequest | null;
  existingDiscussions?: GitHubDiscussion[];
  discussionInfo?: RepositoryDiscussionInfo;
  hasStarredResult?: boolean;
  pullMergeableSequence?: Array<boolean | null>;
  mergeFailures?: number;
  trackCalls?: boolean;
}

export interface StubCalls {
  issuesCreate: number;
  issuesClose: number;
  prCreate: number;
  prMerge: number;
  star: number;
  putFile: number;
  createBranch: number;
}

/**
 * Mutable stub GitHub client. Mutating methods record their calls so tests can
 * assert (1) a dry-run never calls them and (2) idempotency short-circuits.
 */
export function makeStubGitHub(options: StubOptions = {}): { client: GitHubClient; calls: StubCalls } {
  const calls: StubCalls = {
    issuesCreate: 0,
    issuesClose: 0,
    prCreate: 0,
    prMerge: 0,
    star: 0,
    putFile: 0,
    createBranch: 0,
  };

  const userService = {
    getAuthenticated: async () => SAMPLE_USER,
    getAuthenticatedIdentity: async () => ({ user: SAMPLE_USER, scopes: ["repo"] }),
    getByLogin: async (login: string) => ({ ...SAMPLE_USER, login }),
    listEmails: async (): Promise<GitHubEmail[]> => [
      { email: "octocat@example.com", primary: true, verified: true, visibility: "public" },
    ],
    getRateLimit: async () => ({ limit: 5000, remaining: 4999, resetAt: 0 }),
  } as unknown as UserService;

  const repoResult = options.repoResult ?? Promise.resolve(options.repo ?? SAMPLE_REPO);
  const repositoryService = {
    get: async () => repoResult,
    create: async () => SAMPLE_REPO,
    getBranchProtection: async () => options.branchProtection ?? null,
    getBranchSha: async () => "sha123",
    createBranch: async () => {
      calls.createBranch += 1;
    },
    branchExists: async () => false,
    getFile: async () => null,
    putFile: async () => {
      calls.putFile += 1;
      return { commitSha: "sha456", htmlUrl: "https://github.com/octocat/gh-forge-sandbox/blob/main/x.md" };
    },
  } as unknown as RepositoryService;

  const issueService = {
    create: async () => {
      calls.issuesCreate += 1;
      const created: GitHubIssue = {
        id: 1,
        number: 42,
        title: "gh-forge test",
        state: "open",
        body: "gh-forge",
        html_url: "https://github.com/octocat/gh-forge-sandbox/issues/42",
        created_at: new Date().toISOString(),
        closed_at: null,
      };
      return created;
    },
    get: async (_owner: string, _repo: string, number: number) => {
      const existing = options.existingIssue;
      if (existing !== null && existing !== undefined && existing.number === number) return existing;
      return null;
    },
    close: async () => {
      calls.issuesClose += 1;
      return {
        id: 1,
        number: 42,
        title: "gh-forge test",
        state: "closed",
        body: "gh-forge",
        html_url: "https://github.com/octocat/gh-forge-sandbox/issues/42",
        created_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      };
    },
    findByMarker: async () => options.existingIssue ?? null,
  } as unknown as IssueService;

  let lastCreatedPull: GitHubPullRequest | null = null;
  let pullGetCount = 0;
  let mergeAttempts = 0;
  const pullRequestService = {
    create: async () => {
      calls.prCreate += 1;
      const created: GitHubPullRequest = {
        id: 1,
        number: 10,
        title: "gh-forge pr",
        state: "open",
        merged: false,
        merged_at: null,
        html_url: "https://github.com/octocat/gh-forge-sandbox/pull/10",
        body: "gh-forge",
        draft: false,
        head: { ref: "gh-forge/pull-shark/abc", sha: "sha", repo: { full_name: "octocat/gh-forge-sandbox" } },
        base: { ref: "main" },
        mergeable: true,
      };
      lastCreatedPull = created;
      return created;
    },
    get: async () => {
      const base = options.existingPull ?? lastCreatedPull ?? null;
      if (base === null) return null;
      const sequence = options.pullMergeableSequence;
      const mergeable =
        sequence === undefined
          ? (base.mergeable ?? true)
          : (sequence[Math.min(pullGetCount, sequence.length - 1)] ?? null);
      pullGetCount += 1;
      return { ...base, mergeable };
    },
    findByHead: async () => options.existingPull ?? lastCreatedPull ?? null,
    merge: async () => {
      calls.prMerge += 1;
      mergeAttempts += 1;
      if (mergeAttempts <= (options.mergeFailures ?? 0)) {
        throw new GitHubHttpError({
          status: 405,
          method: "PUT",
          url: "/repos/octocat/gh-forge-sandbox/pulls/10/merge",
          message: "Pull Request is not mergeable",
        });
      }
      return {
        merged: options.existingPull?.merged ?? true,
        message: "Pull Request successfully merged",
        sha: "sha789",
      };
    },
  } as unknown as PullRequestService;

  const discussionInfo: RepositoryDiscussionInfo = options.discussionInfo ?? {
    repositoryId: "R_1",
    hasDiscussionsEnabled: true,
    categories: [{ id: "DIC_1", name: "General", slug: "general" }],
  };

  const discussionService = {
    getRepositoryInfo: async () => discussionInfo,
    listDiscussions: async () => options.existingDiscussions ?? [],
    getDiscussion: async (id: string) =>
      (options.existingDiscussions ?? []).find((discussion) => discussion.id === id) ?? null,
    createDiscussion: async (input: { title: string; body: string; categoryId: string }) => ({
      id: "D_1",
      number: 1,
      url: `https://github.com/octocat/gh-forge-sandbox/discussions/1`,
      title: input.title,
    }),
    addComment: async () => ({
      id: "DC_1",
      body: "answer",
      url: "https://github.com/octocat/gh-forge-sandbox/discussions/1#comment-1",
      isAnswer: false,
      author: null,
    }),
    markAsAnswer: async () => {},
  } as unknown as DiscussionService;

  const starService = {
    hasStarred: async () => options.hasStarredResult ?? false,
    star: async () => {
      calls.star += 1;
    },
    unstar: async () => {},
    countStargazers: async () => 42,
  } as unknown as StarService;

  const client: GitHubClient = {
    users: userService,
    repositories: repositoryService,
    issues: issueService,
    pullRequests: pullRequestService,
    discussions: discussionService,
    stars: starService,
    rateLimit: { limit: 5000, remaining: 4999, resetAt: 0 },
  };
  return { client, calls };
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "main",
    username: "octocat",
    role: "main",
    auth: { kind: "gh", login: "octocat" },
    ...overrides,
  };
}

export const emptyCapabilities: AccountCapabilities = {
  authenticated: true,
  login: "octocat",
  identityMatches: true,
  scopes: ["repo"],
  hasRepoScope: true,
  canCreateRepository: true,
  canStar: true,
  canPushToSandbox: true,
  canComment: true,
  canCreateDiscussions: true,
  commitEmail: "octocat@example.com",
  canAttributeCoAuthoredCommit: true,
  rateLimitRemaining: 5000,
  rateLimitLimit: 5000,
  notes: [],
};

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

export interface MakeContextOptions {
  accounts?: Account[];
  capabilities?: Map<string, AccountCapabilities>;
  config?: Config;
  github?: GitHubClient;
  executor?: AchievementExecutor;
  knownProgress?: Record<string, number>;
  sandboxOwner?: string;
  sandboxName?: string;
  allowHighRisk?: boolean;
}

export function makeContext(options: MakeContextOptions = {}): AchievementContext {
  const accounts = options.accounts ?? [makeAccount()];
  const config = options.config ?? createDefaultConfig();
  const capabilities =
    options.capabilities ??
    new Map(
      accounts.map((account) => [
        account.id,
        {
          ...emptyCapabilities,
          login: account.username,
          commitEmail: `${account.username}@example.com`,
        } as AccountCapabilities,
      ]),
    );
  const github = options.github ?? makeStubGitHub().client;
  const executor = options.executor ?? new NoopExecutor();
  const main = accounts.find((account) => account.role === "main") ?? accounts[0] ?? makeAccount();

  return {
    mainAccount: main,
    accounts,
    accountCapabilities: capabilities,
    github,
    clientFor: () => github,
    knownProgress: options.knownProgress ?? {},
    executionState: null,
    config,
    sandbox: {
      owner: options.sandboxOwner ?? main.username,
      name: options.sandboxName ?? "gh-forge-sandbox",
      visibility: "public",
      discussions: true,
    },
    logger: silentLogger,
    policyGates: {
      allowHighRisk: options.allowHighRisk ?? true,
    },
    executor,
  };
}

export function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    version: 1,
    runId: "run-test",
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    status: "in_progress",
    dryRun: false,
    targets: {},
    flags: { allowHighRisk: true },
    accounts: { main: "octocat" },
    actions: [],
    observations: [],
    ...overrides,
  };
}