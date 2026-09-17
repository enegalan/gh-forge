import { GafError, type GafErrorCode } from "../../utils/errors.js";
import { redactSecrets, redactValue } from "../../utils/redact.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface HttpRequestOptions {
  method?: HttpMethod;
  /** Either an API path ("/user") or an absolute URL. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Passed through to fetch; used by tests and by the optional timeout. */
  signal?: AbortSignal;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  used: number;
  resetAt: number;
  resource?: string;
}

export class GitHubHttpError extends GafError {
  readonly status: number;
  readonly method: HttpMethod;
  readonly url: string;
  readonly retryAfterSeconds: number | null;
  readonly details: unknown;

  constructor(input: {
    status: number;
    method: HttpMethod;
    url: string;
    message: string;
    retryAfterSeconds?: number | null;
    details?: unknown;
    code?: GafErrorCode;
  }) {
    super(input.code ?? "GITHUB_HTTP", `${input.method} ${redactSecrets(input.url)} -> ${input.status}: ${redactSecrets(input.message)}`);
    this.name = "GitHubHttpError";
    this.status = input.status;
    this.method = input.method;
    this.url = input.url;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.details = redactValue(input.details);
  }
}
