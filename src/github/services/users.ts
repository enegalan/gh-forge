import type { HttpClient } from "../http/http-client.js";
import type { GitHubEmail, GitHubUser } from "../types.js";

/**
 * The authenticated identity.
 */
export interface AuthenticatedIdentity {
  user: GitHubUser;
  scopes: string[];
}

/**
 * The user service.
 */
export class UserService {
  /**
   * The HTTP client.
   */
  private readonly http: HttpClient;

  /**
   * Creates a new user service.
   *
   * @param http - The HTTP client.
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Gets the authenticated user.
   *
   * @returns The authenticated user.
   */
  async getAuthenticated(): Promise<GitHubUser> {
    const response = await this.http.request<GitHubUser>({ path: "/user" });
    return response.data;
  }

  /**
   * Gets the authenticated identity.
   *
   * @returns The authenticated identity.
   */
  async getAuthenticatedIdentity(): Promise<AuthenticatedIdentity> {
    const response = await this.http.request<GitHubUser>({ path: "/user" });
    const scopesHeader = response.headers.get("x-oauth-scopes") ?? "";
    const scopes = scopesHeader
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope !== "");
    return { user: response.data, scopes };
  }

  /**
   * Gets a user by login.
   *
   * @param login - The login.
   * @returns The user.
   */
  async getByLogin(login: string): Promise<GitHubUser | null> {
    const response = await this.http.requestOptional<GitHubUser>({ path: `/users/${login}` });
    return response === null ? null : response.data;
  }

  /**
   * Lists the emails.
   *
   * @returns The emails.
   */
  async listEmails(): Promise<GitHubEmail[]> {
    const response = await this.http.requestOptional<GitHubEmail[]>({ path: "/user/emails" });
    return response === null ? [] : response.data;
  }

  /**
   * Gets the rate limit.
   *
   * @returns The rate limit.
   */
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
