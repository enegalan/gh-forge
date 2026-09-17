import type { HttpClient } from "./http/http-client.js";
import { DiscussionService } from "./services/discussions.js";
import { IssueService } from "./services/issues.js";
import { PullRequestService } from "./services/pull-requests.js";
import { RepositoryService } from "./services/repositories.js";
import { StarService } from "./services/stars.js";
import { UserService } from "./services/users.js";

/**
 * Achievements never call HTTP directly: they use this facade, which makes the
 * whole GitHub surface mockable in tests.
 */
export interface GitHubClient {
  users: UserService;
  repositories: RepositoryService;
  issues: IssueService;
  pullRequests: PullRequestService;
  discussions: DiscussionService;
  stars: StarService;
  /** Per account rate limit snapshot, updated after every request. */
  readonly rateLimit: { limit: number; remaining: number; resetAt: number } | null;
}

export interface CreateGitHubClientOptions {
  http: HttpClient;
}

export function createGitHubClient(options: CreateGitHubClientOptions): GitHubClient {
  const { http } = options;
  const client: GitHubClient = {
    users: new UserService(http),
    repositories: new RepositoryService(http),
    issues: new IssueService(http),
    pullRequests: new PullRequestService(http),
    discussions: new DiscussionService(http),
    stars: new StarService(http),
    get rateLimit() {
      const info = http.rateLimit;
      if (info === null) return null;
      return { limit: info.limit, remaining: info.remaining, resetAt: info.resetAt };
    },
  };
  return client;
}
