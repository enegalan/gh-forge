import type { HttpClient } from "../http/http-client.js";
import type { GitHubEmail, GitHubUser } from "../types.js";

export interface AuthenticatedIdentity {
  user: GitHubUser;
  scopes: string[];
}

export class UserService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * `GET /user` — also used to prove that a token belongs to the username the
   * user configured for this account.
   */
  async getAuthenticated(): Promise<GitHubUser> {
    const response = await this.http.request<GitHubUser>({ path: "/user" });
    return response.data;
  }

  async getAuthenticatedIdentity(): Promise<AuthenticatedIdentity> {
    const response = await this.http.request<GitHubUser>({ path: "/user" });
    const scopesHeader = response.headers.get("x-oauth-scopes") ?? "";
    const scopes = scopesHeader
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope !== "");
    return { user: response.data, scopes };
  }

  async getByLogin(login: string): Promise<GitHubUser | null> {
    const response = await this.http.requestOptional<GitHubUser>({ path: `/users/${login}` });
    return response === null ? null : response.data;
  }

  /** Requires the `user:email` scope; callers must handle 403/404 gracefully. */
  async listEmails(): Promise<GitHubEmail[]> {
    const response = await this.http.requestOptional<GitHubEmail[]>({ path: "/user/emails" });
    return response === null ? [] : response.data;
  }

  async getRateLimit(): Promise<{ limit: number; remaining: number; resetAt: number }> {
    const response = await this.http.request<{
      rate: { limit: number; remaining: number; reset: number };
    }>({ path: "/rate_limit" });
    return {
      limit: response.data.rate.limit,
      remaining: response.data.rate.remaining,
      resetAt: response.data.rate.reset,
    };
  }
}