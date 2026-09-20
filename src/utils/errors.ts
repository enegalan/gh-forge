/**
 * Explicit, typed errors used across GitHub Achievement Forge.
 *
 * Every error carries a machine readable `code` so the CLI can render a useful
 * message and so tests can assert on behaviour instead of on free text.
 */

/**
 * The GitHub Achievement Forge error code.
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

/**
 * The GitHub Achievement Forge error.
 */
export class GafError extends Error {
  /**
   * The error code.
   */
  readonly code: GafErrorCode;
  /**
   * The hints.
   */
  readonly hints: string[];

  /**
   * Creates a new GitHub Achievement Forge error.
   *
   * @param code - The error code.
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(code: GafErrorCode, message: string, hints: string[] = []) {
    super(message);
    this.name = "GafError";
    this.code = code;
    this.hints = hints;
  }
}

/**
 * The usage error.
 */
export class UsageError extends GafError {
  /**
   * Creates a new usage error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("USAGE", message, hints);
    this.name = "UsageError";
  }
}

/**
 * The config error.
 */
export class ConfigError extends GafError {
  /**
   * Creates a new config error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("CONFIG_INVALID", message, hints);
    this.name = "ConfigError";
  }
}

/**
 * The auth error.
 */
export class AuthError extends GafError {
  /**
   * Creates a new auth error.
   *
   * @param code - The error code.
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(
    code: Extract<GafErrorCode, "AUTH_MISSING" | "AUTH_IDENTITY_MISMATCH" | "AUTHProviderFailure">,
    message: string,
    hints: string[] = [],
  ) {
    super(code, message, hints);
    this.name = "AuthError";
  }
}

/**
 * The account error.
 */
export class AccountError extends GafError {
  /**
   * Creates a new account error.
   *
   * @param code - The error code.
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(
    code: Extract<GafErrorCode, "ACCOUNT_NOT_FOUND" | "ACCOUNT_DUPLICATE">,
    message: string,
    hints: string[] = [],
  ) {
    super(code, message, hints);
    this.name = "AccountError";
  }
}

/**
 * The policy error.
 */
export class PolicyError extends GafError {
  /**
   * Creates a new policy error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("POLICY_BLOCKED", message, hints);
    this.name = "PolicyError";
  }
}

/**
 * The planner error.
 */
export class PlannerError extends GafError {
  /**
   * Creates a new planner error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("PLANNER_FAILED", message, hints);
    this.name = "PlannerError";
  }
}

/**
 * The execution error.
 */
export class ExecutionError extends GafError {
  /**
   * Creates a new execution error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("EXECUTION_FAILED", message, hints);
    this.name = "ExecutionError";
  }
}

/**
 * The state error.
 */
export class StateError extends GafError {
  /**
   * Creates a new state error.
   *
   * @param message - The error message.
   * @param hints - The hints.
   */
  constructor(message: string, hints: string[] = []) {
    super("STATE_CORRUPT", message, hints);
    this.name = "StateError";
  }
}

/**
 * Gets the error message.
 *
 * @param value - The value.
 * @returns The error message.
 */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}
