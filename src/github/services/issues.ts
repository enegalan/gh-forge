import type { HttpClient } from "../http/http-client.js";
import type { GitHubIssue } from "../types.js";

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
}

export class IssueService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async create(input: CreateIssueInput): Promise<GitHubIssue> {
    const response = await this.http.request<GitHubIssue>({
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/issues`,
      body: { title: input.title, body: input.body },
    });
    return response.data;
  }

  async get(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue | null> {
    const response = await this.http.requestOptional<GitHubIssue>({
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
    });
    return response === null ? null : response.data;
  }

  /** Closing an issue (and PRs are issues) is what Quickdraw measures. */
  async close(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await this.http.request<GitHubIssue>({
      method: "PATCH",
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
      body: { state: "closed" },
    });
    return response.data;
  }

  /**
   * Best-effort remote idempotency: find an issue that carries a GAF marker.
   * The search API is rate limited, so callers must tolerate `null`.
   */
  async findByMarker(owner: string, repo: string, marker: string): Promise<GitHubIssue | null> {
    const response = await this.http.requestOptional<{ items: GitHubIssue[] }>({
      path: "/search/issues",
      query: { q: `repo:${owner}/${repo} "${marker}" in:body type:issue`, per_page: 10 },
    });
    if (response === null) return null;
    return response.data.items.find((item) => item.body?.includes(marker)) ?? null;
  }
}