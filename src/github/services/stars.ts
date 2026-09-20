import type { HttpClient } from "../http/http-client.js";

/**
 * Starring is only exposed here so that the planner can report requirements and
 * so that idempotency checks are possible. Executing `repository-star` actions
 * is gated behind an explicit high-risk consent flag (see docs/SECURITY.md).
 */
export class StarService {
  /**
   * The HTTP client.
   */
  private readonly http: HttpClient;

  /**
   * Creates a new star service.
   *
   * @param http - The HTTP client.
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Checks if a repository is starred.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @returns True if the repository is starred, false otherwise.
   */
  async hasStarred(owner: string, repo: string): Promise<boolean> {
    const response = await this.http.requestOptional<unknown>({
      path: `/user/starred/${owner}/${repo}`,
    });
    return response !== null;
  }

  /**
   * Stars a repository.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   */
  async star(owner: string, repo: string): Promise<void> {
    await this.http.request<void>({
      method: "PUT",
      path: `/user/starred/${owner}/${repo}`,
      headers: { "content-length": "0" },
    });
  }

  /**
   * Unstars a repository.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   */
  async unstar(owner: string, repo: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/user/starred/${owner}/${repo}`,
    });
  }

  /**
   * Counts the stargazers.
   *
   * @param owner - The owner.
   * @param repo - The repository.
   * @returns The number of stargazers.
   */
  async countStargazers(owner: string, repo: string): Promise<number> {
    const response = await this.http.request<{ stargazers_count: number }>({
      path: `/repos/${owner}/${repo}`,
    });
    return response.data.stargazers_count;
  }
}
