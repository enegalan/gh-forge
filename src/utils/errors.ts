/**
 * Explicit, typed errors used across GAF.
 *
 * Every error carries a machine readable `code` so the CLI can render a useful
 * message and so tests can assert on behaviour instead of on free text.
 */

export type GafErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_MISSING"
  | "AUTH_MISSING"
  | "AUTH_IDENTITY_MISMATCH"
  | "AUTHProviderFailure"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_DUPLICATE"
  | "CAPABILITY_MISSING"
  | "GITHUB_HTTP"
  | "GITHUB_RATE_LIMITED"
  | "POLICY_BLOCKED"
  | "PLANNER_FAILED"
  | "EXECUTION_FAILED"
  | "STATE_CORRUPT"
  | "USAGE";

export class GafError extends Error {
  readonly code: GafErrorCode;
  readonly hints: string[];

  constructor(code: GafErrorCode, message: string, hints: string[] = []) {
    super(message);
    this.name = "GafError";
    this.code = code;
    this.hints = hints;
  }
}

export class UsageError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("USAGE", message, hints);
    this.name = "UsageError";
  }
}

export class ConfigError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("CONFIG_INVALID", message, hints);
    this.name = "ConfigError";
  }
}

export class AuthError extends GafError {
  constructor(
    code: Extract<GafErrorCode, "AUTH_MISSING" | "AUTH_IDENTITY_MISMATCH" | "AUTHProviderFailure">,
    message: string,
    hints: string[] = [],
  ) {
    super(code, message, hints);
    this.name = "AuthError";
  }
}

export class AccountError extends GafError {
  constructor(code: Extract<GafErrorCode, "ACCOUNT_NOT_FOUND" | "ACCOUNT_DUPLICATE">, message: string, hints: string[] = []) {
    super(code, message, hints);
    this.name = "AccountError";
  }
}

export class PolicyError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("POLICY_BLOCKED", message, hints);
    this.name = "PolicyError";
  }
}

export class PlannerError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("PLANNER_FAILED", message, hints);
    this.name = "PlannerError";
  }
}

export class ExecutionError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("EXECUTION_FAILED", message, hints);
    this.name = "ExecutionError";
  }
}

export class StateError extends GafError {
  constructor(message: string, hints: string[] = []) {
    super("STATE_CORRUPT", message, hints);
    this.name = "StateError";
  }
}

export function isGafError(value: unknown): value is GafError {
  return value instanceof GafError;
}

export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}
