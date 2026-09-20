import type { HttpClient } from "../http/http-client.js";
import type { GitHubPullRequest } from "../types.js";

/**
 * The create pull request input.
 */
export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

/**
 * The merge pull request input.
 */
export interface MergePullRequestInput {
  owner: string;
  repo: string;
  pullNumber: number;
  mergeMethod: "merge" | "squash" | "rebase";
  commitTitle?: string;
}

/**
 * The merge result.
 */
export interface MergeResult {
  merged: boolean;
  message: string;
  sha: string | null;
}

/**
 * The pull request service.
 */
export class PullRequestService {
  /**
   * The HTTP client.
   */
  private readonly http: HttpClient;

  /**
   * Creates a new pull request service.
   *
   * @param http - The HTTP client.
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Creates a pull request.
   *
   * @param input - The input.
   * @returns The created pull request.
   */
  async create(input: CreatePullRequestInput): Promise<GitHubPullRequest> {
    const response = await this.http.request<GitHubPullRequest>({
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/pulls`,
      body: {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
      },
    });
    return response.data;
  }

  /**
   * Gets a pull request.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param pullNumber - The pull request number.
   * @returns The pull request.
   */
  async get(owner: string, repo: string, pullNumber: number): Promise<GitHubPullRequest | null> {
    const response = await this.http.requestOptional<GitHubPullRequest>({
      path: `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    });
    return response === null ? null : response.data;
  }

  /**
   * Finds a pull request by head.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param head - The head.
   * @returns The pull request.
   */
  async findByHead(owner: string, repo: string, head: string): Promise<GitHubPullRequest | null> {
    const response = await this.http.requestOptional<GitHubPullRequest[]>({
      path: `/repos/${owner}/${repo}/pulls`,
      query: { head, state: "all", per_page: 10 },
    });
    if (response === null) return null;
    return (
      response.data.find((pull) => pull.head.ref === head.split(":")[1]) ?? response.data[0] ?? null
    );
  }

  /**
   * Merges a pull request.
   *
   * @param input - The input.
   * @returns The merge result.
   */
  async merge(input: MergePullRequestInput): Promise<MergeResult> {
    const response = await this.http.requestOptional<{
      merged: boolean;
      message: string;
      sha: string;
    }>({
      method: "PUT",
      path: `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/merge`,
      body: {
        merge_method: input.mergeMethod,
        ...(input.commitTitle === undefined ? {} : { commit_title: input.commitTitle }),
      },
    });
    if (response === null) {
      return { merged: false, message: "merge endpoint returned 404", sha: null };
    }
    return {
      merged: response.data.merged,
      message: response.data.message,
      sha: response.data.sha ?? null,
    };
  }
}
