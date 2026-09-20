import type { HttpClient } from "../http/http-client.js";
import type {
  GitHubBranchProtection,
  GitHubContentResponse,
  GitHubRef,
  GitHubRepository,
} from "../types.js";

/**
 * The create repository input.
 */
export interface CreateRepositoryInput {
  name: string;
  description?: string;
  private: boolean;
  hasDiscussions?: boolean;
  autoInit?: boolean;
}

/**
 * The put file input.
 */
export interface PutFileInput {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string;
  branch: string;
}

/**
 * The repository service.
 */
export class RepositoryService {
  /**
   * The HTTP client.
   */
  private readonly http: HttpClient;

  /**
   * Creates a new repository service.
   *
   * @param http - The HTTP client.
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Gets a repository.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @returns The repository.
   */
  async get(owner: string, repo: string): Promise<GitHubRepository | null> {
    const response = await this.http.requestOptional<GitHubRepository>({
      path: `/repos/${owner}/${repo}`,
    });
    return response === null ? null : response.data;
  }

  /**
   * Creates a repository.
   *
   * @param input - The input.
   * @returns The created repository.
   */
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

  /**
   * Gets branch protection.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param branch - The branch.
   * @returns The branch protection.
   */
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

  /**
   * Gets branch SHA.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param branch - The branch.
   * @returns The branch SHA.
   */
  async getBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
    const response = await this.http.requestOptional<GitHubRef>({
      path: `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    });
    return response === null ? null : response.data.object.sha;
  }

  /**
   * Creates a branch.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param branch - The branch.
   * @param sha - The SHA.
   */
  async createBranch(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/repos/${owner}/${repo}/git/refs`,
      body: { ref: `refs/heads/${branch}`, sha },
    });
  }

  /**
   * Checks if a branch exists.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param branch - The branch.
   * @returns True if the branch exists, false otherwise.
   */
  async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    return (await this.getBranchSha(owner, repo, branch)) !== null;
  }

  /**
   * Gets a file.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param path - The path.
   * @param ref - The ref.
   * @returns The file.
   */
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
   * Creates or updates a file.
   *
   * @param input - The input.
   * @returns The commit SHA and HTML URL.
   */
  async putFile(
    input: PutFileInput,
  ): Promise<{ commitSha: string | null; htmlUrl: string | null }> {
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

  /**
   * Gets a file SHA.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @param path - The path.
   * @param ref - The ref.
   * @returns The file SHA.
   */
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
