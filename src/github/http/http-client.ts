import type { Logger } from "../../utils/logger.js";
import { createSilentLogger } from "../../utils/logger.js";
import {
  GitHubHttpError,
  type HttpMethod,
  type HttpRequestOptions,
  type HttpResponse,
  type RateLimitInfo,
} from "./http-errors.js";

/**
 * The HTTP client options.
 */
export interface HttpClientOptions {
  token: () => Promise<string>;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  apiVersion?: string;
  maxRetries?: number;
  minIntervalMs?: number;
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

/**
 * The HTTP client.
 */
export interface HttpClient {
  request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>>;
  requestOptional<T>(options: HttpRequestOptions): Promise<HttpResponse<T> | null>;
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  readonly rateLimit: RateLimitInfo | null;
}

/**
 * The default base URL.
 */
const DEFAULT_BASE_URL = "https://api.github.com";

/**
 * The default API version.
 */
const DEFAULT_API_VERSION = "2022-11-28";

/**
 * The fetch HTTP client.
 */
export class FetchHttpClient implements HttpClient {
  /**
   * The options.
   */
  private readonly options: Required<Omit<HttpClientOptions, "logger">> & { logger: Logger };
  /**
   * The last request at.
   */
  private lastRequestAt = 0;
  /**
   * The rate limit info.
   */
  private rateLimitInfo: RateLimitInfo | null = null;

  /**
   * Creates a new fetch HTTP client.
   *
   * @param options - The options.
   */
  constructor(options: HttpClientOptions) {
    this.options = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      userAgent: options.userAgent ?? "gh-forge",
      apiVersion: options.apiVersion ?? DEFAULT_API_VERSION,
      maxRetries: options.maxRetries ?? 3,
      minIntervalMs: options.minIntervalMs ?? 0,
      requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
      sleep: options.sleep ?? defaultSleep,
      token: options.token,
      logger: options.logger ?? createSilentLogger(),
    };
  }

  /**
   * The rate limit info.
   *
   * @returns The rate limit info.
   */
  get rateLimit(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Sends a request.
   *
   * @param options - The options.
   * @returns The response.
   */
  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const response = await this.send<T>(options, false);
    if (response === null) {
      throw new GitHubHttpError({
        status: 404,
        method: options.method ?? "GET",
        url: options.path,
        message: "Not Found",
      });
    }
    return response;
  }

  /**
   * Sends a request optionally.
   *
   * @param options - The options.
   * @returns The response.
   */
  async requestOptional<T>(options: HttpRequestOptions): Promise<HttpResponse<T> | null> {
    return this.send<T>(options, true);
  }

  /**
   * Sends a GraphQL request.
   *
   * @param query - The query.
   * @param variables - The variables.
   * @returns The response.
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request<{ data?: T; errors?: Array<{ message: string }> }>({
      method: "POST",
      path: "/graphql",
      body: { query, variables },
    });
    const payload = response.data;
    if (payload.errors !== undefined && payload.errors.length > 0) {
      throw new GitHubHttpError({
        status: response.status,
        method: "POST",
        url: "/graphql",
        message: payload.errors.map((error) => error.message).join("; "),
        details: payload.errors,
      });
    }
    if (payload.data === undefined) {
      throw new GitHubHttpError({
        status: response.status,
        method: "POST",
        url: "/graphql",
        message: "GraphQL response contained no data",
        details: payload,
      });
    }
    return payload.data;
  }

  /**
   * Sends a request.
   *
   * @param options - The options.
   * @param allowNotFound - Whether to allow not found.
   * @returns The response.
   */
  private async send<T>(
    options: HttpRequestOptions,
    allowNotFound: boolean,
  ): Promise<HttpResponse<T> | null> {
    const method: HttpMethod = options.method ?? "GET";
    const url = this.buildUrl(options);
    let attempt = 0;

    for (;;) {
      attempt += 1;
      await this.throttle();
      const token = await this.options.token();
      const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "x-github-api-version": this.options.apiVersion,
        "user-agent": this.options.userAgent,
        ...(options.headers ?? {}),
      };
      if (token !== "") headers["authorization"] = `Bearer ${token}`;

      const init: RequestInit = {
        method,
        headers,
        signal: options.signal ?? AbortSignal.timeout(this.options.requestTimeoutMs),
      };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
        headers["content-type"] = "application/json";
      }

      this.options.logger.debug(`github: ${method} ${url}`);
      let response: Response;
      try {
        response = await this.options.fetchImpl(url, init);
      } catch (error) {
        if (attempt <= this.options.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw new GitHubHttpError({
          status: 0,
          method,
          url,
          message: error instanceof Error ? error.message : "network error",
        });
      }

      this.captureRateLimit(response.headers);
      if (response.status === 404 && allowNotFound) return null;

      if (this.shouldRetry(response, attempt)) {
        const retryAfter = readRetryAfter(response);
        this.options.logger.warn(
          `github: ${method} ${url} -> ${response.status}; retrying (attempt ${attempt}, retry-after ${retryAfter ?? "backoff"})`,
        );
        await this.backoff(attempt, retryAfter);
        continue;
      }

      const data = await parseBody<T>(response);
      if (!response.ok) {
        throw new GitHubHttpError({
          status: response.status,
          method,
          url,
          message: extractMessage(data),
          retryAfterSeconds: readRetryAfter(response),
          details: data,
          code:
            response.status === 403 || response.status === 429
              ? "GITHUB_RATE_LIMITED"
              : "GITHUB_HTTP",
        });
      }

      return { status: response.status, headers: response.headers, data };
    }
  }

  /**
   * Checks if a response should be retried.
   *
   * @param response - The response.
   * @param attempt - The attempt.
   * @returns True if the response should be retried, false otherwise.
   */
  private shouldRetry(response: Response, attempt: number): boolean {
    if (attempt > this.options.maxRetries) return false;
    if (response.status === 429) return true;
    if (response.status >= 500) return true;
    if (response.status === 403) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const retryAfter = response.headers.get("retry-after");
      return remaining === "0" || retryAfter !== null;
    }
    return false;
  }

  /**
   * Backoffs.
   *
   * @param attempt - The attempt.
   * @param retryAfterSeconds - The retry after seconds.
   * @returns The promise.
   */
  private async backoff(attempt: number, retryAfterSeconds: number | null = null): Promise<void> {
    const base =
      retryAfterSeconds === null ? Math.min(2 ** attempt * 1000, 30_000) : retryAfterSeconds * 1000;
    const jitter = Math.floor(Math.random() * 250);
    await this.options.sleep(base + jitter);
  }

  /**
   * Throttles.
   *
   * @returns The promise.
   */
  private async throttle(): Promise<void> {
    if (this.options.minIntervalMs <= 0) return;
    const wait = this.lastRequestAt + this.options.minIntervalMs - Date.now();
    if (wait > 0) await this.options.sleep(wait);
    this.lastRequestAt = Date.now();
  }

  /**
   * Builds a URL.
   *
   * @param options - The options.
   * @returns The URL.
   */
  private buildUrl(options: HttpRequestOptions): string {
    const base = options.path.startsWith("http")
      ? options.path
      : `${this.options.baseUrl}${options.path.startsWith("/") ? "" : "/"}${options.path}`;
    if (options.query === undefined) return base;
    const url = new URL(base);
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /**
   * Captures the rate limit.
   *
   * @param headers - The headers.
   */
  private captureRateLimit(headers: Headers): void {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (limit === null || remaining === null || reset === null) return;
    const resource = headers.get("x-ratelimit-resource");
    this.rateLimitInfo = {
      limit: Number(limit),
      remaining: Number(remaining),
      used: Number(headers.get("x-ratelimit-used") ?? "0"),
      resetAt: Number(reset),
      ...(resource === null ? {} : { resource }),
    };
  }
}

/**
 * Parses a body.
 *
 * @param response - The response.
 * @returns The body.
 */
async function parseBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text === "") return undefined as T;
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
  return text as unknown as T;
}

/**
 * Extracts a message.
 *
 * @param data - The data.
 * @returns The message.
 */
function extractMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (data !== null && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "request failed";
}

/**
 * Reads the retry after.
 *
 * @param response - The response.
 * @returns The retry after.
 */
function readRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds;
  }
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if (remaining === "0" && reset !== null) {
      const seconds = Number(reset) - Math.floor(Date.now() / 1000);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
  }
  return null;
}

/**
 * The default sleep function.
 *
 * @param ms - The milliseconds.
 * @returns The promise.
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
