import type { HttpClient } from "../http/http-client.js";

/**
 * Starring is only exposed here so that the planner can report requirements and
 * so that idempotency checks are possible. Executing `repository-star` actions
 * is gated behind an explicit high-risk consent flag (see docs/SECURITY.md).
 */
export class StarService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async hasStarred(owner: string, repo: string): Promise<boolean> {
    const response = await this.http.requestOptional<unknown>({
      path: `/user/starred/${owner}/${repo}`,
    });
    return response !== null;
  }

  async star(owner: string, repo: string): Promise<void> {
    await this.http.request<void>({
      method: "PUT",
      path: `/user/starred/${owner}/${repo}`,
      headers: { "content-length": "0" },
    });
  }

  async unstar(owner: string, repo: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/user/starred/${owner}/${repo}`,
    });
  }

  async countStargazers(owner: string, repo: string): Promise<number> {
    const response = await this.http.request<{ stargazers_count: number }>({
      path: `/repos/${owner}/${repo}`,
    });
    return response.data.stargazers_count;
  }
}