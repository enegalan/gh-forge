import { GafError, type GafErrorCode } from "../../utils/errors.js";
import { redactSecrets, redactValue } from "../../utils/redact.js";

/**
 * The HTTP method.
 */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * The HTTP request options.
 */
export interface HttpRequestOptions {
  method?: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * The HTTP response.
 */
export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

/**
 * The rate limit info.
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  used: number;
  resetAt: number;
  resource?: string;
}

/**
 * The GitHub HTTP error.
 */
export class GitHubHttpError extends GafError {
  /**
   * The status.
   */
  readonly status: number;
  /**
   * The method.
   */
  readonly method: HttpMethod;
  /**
   * The URL.
   */
  readonly url: string;
  /**
   * The retry after seconds.
   */
  readonly retryAfterSeconds: number | null;
  /**
   * The details.
   */
  readonly details: unknown;

  /**
   * Creates a new GitHub HTTP error.
   *
   * @param input - The input.
   */
  constructor(input: {
    status: number;
    method: HttpMethod;
    url: string;
    message: string;
    retryAfterSeconds?: number | null;
    details?: unknown;
    code?: GafErrorCode;
  }) {
    super(
      input.code ?? "GITHUB_HTTP",
      `${input.method} ${redactSecrets(input.url)} -> ${input.status}: ${redactSecrets(input.message)}`,
    );
    this.name = "GitHubHttpError";
    this.status = input.status;
    this.method = input.method;
    this.url = input.url;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.details = redactValue(input.details);
  }
}
