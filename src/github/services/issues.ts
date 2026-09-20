import type { HttpClient } from "../http/http-client.js";
import type { GitHubIssue } from "../types.js";

/**
 * The create issue input.
 */
export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
}

/**
 * The issue service.
 */
export class IssueService {
  /**
   * The HTTP client.
   */
  private readonly http: HttpClient;

  /**
   * Creates a new issue service.
   *
   * @param http - The HTTP client.
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Creates an issue.
   *
   * @param input - The input.
   * @returns The created issue.
   */
  async create(input: CreateIssueInput): Promise<GitHubIssue> {
    const response = await this.http.request<GitHubIssue>({
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/issues`,
      body: { title: input.title, body: input.body },
    });
    return response.data;
  }

  /**
   * Gets an issue.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param issueNumber - The issue number.
   * @returns The issue.
   */
  async get(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue | null> {
    const response = await this.http.requestOptional<GitHubIssue>({
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
    });
    return response === null ? null : response.data;
  }

  /**
   * Closes an issue.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param issueNumber - The issue number.
   * @returns The closed issue.
   */
  async close(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await this.http.request<GitHubIssue>({
      method: "PATCH",
      path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
      body: { state: "closed" },
    });
    return response.data;
  }

  /**
   * Finds an issue by marker.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param marker - The marker.
   * @returns The issue.
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
