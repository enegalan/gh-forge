import type { HttpClient } from "../http/http-client.js";
import type { GitHubPullRequest } from "../types.js";

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface MergePullRequestInput {
  owner: string;
  repo: string;
  pullNumber: number;
  mergeMethod: "merge" | "squash" | "rebase";
  commitTitle?: string;
}

export interface MergeResult {
  merged: boolean;
  message: string;
  sha: string | null;
}

export class PullRequestService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

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

  async get(owner: string, repo: string, pullNumber: number): Promise<GitHubPullRequest | null> {
    const response = await this.http.requestOptional<GitHubPullRequest>({
      path: `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    });
    return response === null ? null : response.data;
  }

  /** `head` must be `owner:branch`. */
  async findByHead(owner: string, repo: string, head: string): Promise<GitHubPullRequest | null> {
    const response = await this.http.requestOptional<GitHubPullRequest[]>({
      path: `/repos/${owner}/${repo}/pulls`,
      query: { head, state: "all", per_page: 10 },
    });
    if (response === null) return null;
    return response.data.find((pull) => pull.head.ref === head.split(":")[1]) ?? response.data[0] ?? null;
  }

  /**
   * Merging without any review is what earns YOLO. If the base branch requires
   * approving reviews GitHub returns 405/403 and GAF reports it instead of
   * trying to bypass branch protection.
   */
  async merge(input: MergePullRequestInput): Promise<MergeResult> {
    const response = await this.http.requestOptional<{ merged: boolean; message: string; sha: string }>({
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