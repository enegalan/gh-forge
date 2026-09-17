import type { HttpClient } from "../http/http-client.js";
import type {
  GitHubBranchProtection,
  GitHubContentResponse,
  GitHubRef,
  GitHubRepository,
} from "../types.js";

export interface CreateRepositoryInput {
  name: string;
  description?: string;
  private: boolean;
  hasDiscussions?: boolean;
  autoInit?: boolean;
}

export interface PutFileInput {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string;
  branch: string;
}

export class RepositoryService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async get(owner: string, repo: string): Promise<GitHubRepository | null> {
    const response = await this.http.requestOptional<GitHubRepository>({
      path: `/repos/${owner}/${repo}`,
    });
    return response === null ? null : response.data;
  }

  async create(input: CreateRepositoryInput): Promise<GitHubRepository> {
    const response = await this.http.request<GitHubRepository>({
      method: "POST",
      path: "/user/repos",
      body: {
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        private: input.private,
        has_discussions: input.hasDiscussions ?? false,
        auto_init: input.autoInit ?? true,
      },
    });
    return response.data;
  }

  /** Branch protection is only readable with admin rights; unknown means null. */
  async getBranchProtection(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubBranchProtection | null> {
    const response = await this.http.requestOptional<{
      required_pull_request_reviews?: { required_approving_review_count?: number } | null;
    }>({ path: `/repos/${owner}/${repo}/branches/${branch}/protection` });
    if (response === null) return null;
    const reviews = response.data.required_pull_request_reviews ?? null;
    return {
      requiresApprovingReviews: reviews !== null,
      requiredApprovingReviewCount: reviews?.required_approving_review_count ?? 0,
    };
  }

  async getBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
    const response = await this.http.requestOptional<GitHubRef>({
      path: `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    });
    return response === null ? null : response.data.object.sha;
  }

  /** Creates `refs/heads/<branch>` pointing at `<sha>` (idempotent by caller). */
  async createBranch(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/repos/${owner}/${repo}/git/refs`,
      body: { ref: `refs/heads/${branch}`, sha },
    });
  }

  async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    return (await this.getBranchSha(owner, repo, branch)) !== null;
  }

  async getFile(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    const response = await this.http.requestOptional<GitHubContentResponse>({
      path: `/repos/${owner}/${repo}/contents/${path}`,
      query: { ref },
    });
    if (response === null) return null;
    const content = response.data.content ?? "";
    return Buffer.from(content, "base64").toString("utf8");
  }

  /**
   * Creates or updates a file. The commit message may contain a
   * `Co-authored-by:` trailer, which is how Pair Extraordinaire is earned.
   */
  async putFile(input: PutFileInput): Promise<{ commitSha: string | null; htmlUrl: string | null }> {
    const existingSha = await this.getFileSha(input.owner, input.repo, input.path, input.branch);
    const response = await this.http.request<GitHubContentResponse>({
      method: "PUT",
      path: `/repos/${input.owner}/${input.repo}/contents/${input.path}`,
      body: {
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        ...(existingSha === null ? {} : { sha: existingSha }),
      },
    });
    return {
      commitSha: response.data.commit?.sha ?? null,
      htmlUrl: response.data.html_url ?? null,
    };
  }

  private async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    const response = await this.http.requestOptional<GitHubContentResponse>({
      path: `/repos/${owner}/${repo}/contents/${path}`,
      query: { ref },
    });
    return response === null ? null : response.data.sha;
  }
}