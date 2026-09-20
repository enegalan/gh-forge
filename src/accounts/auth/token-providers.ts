import { execFile } from "node:child_process";
import type { Account } from "../account.js";
import { AuthError } from "../../utils/errors.js";
import { redactSecrets } from "../../utils/redact.js";

/**
 * Result of executing a command.
 */
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Function that executes a command and returns the result.
 *
 * @param command - The command to execute.
 * @param args - The arguments to pass to the command.
 * @returns A promise that resolves to the result of executing the command.
 */
export type ExecFn = (command: string, args: string[]) => Promise<ExecResult>;

/**
 * Default implementation of `ExecFn`.
 *
 * Used to execute commands on the local machine.
 *
 * @param command - The command to execute.
 * @param args - The arguments to pass to the command.
 * @returns A promise that resolves to the result of executing the command.
 */
const defaultExec: ExecFn = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(error);
        return;
      }
      resolve({ stdout, stderr, code: typeof error.code === "number" ? error.code : 1 });
    });
  });

/**
 * Sources a token for one account. Tokens are never persisted by GitHub Achievement Forge: they are
 * read on demand into memory and only ever passed to the HTTP client.
 */
export interface TokenProvider {
  readonly kind: "gh" | "tokenCommand" | "env";
  describe(): string;
  getToken(): Promise<string>;
  troubleshoot(): string[];
}

/**
 * Provides a token for an account using the GitHub CLI.
 */
export class GhCliTokenProvider implements TokenProvider {
  /**
   * The kind of token provider.
   */
  readonly kind = "gh" as const;
  /**
   * The login of the account.
   */
  private readonly login: string;

  /**
   * Creates a new GitHub CLI token provider.
   *
   * @param login - The login of the account.
   */
  constructor(login: string) {
    this.login = login;
  }

  /**
   * Describes the token provider.
   */
  describe(): string {
    return `GitHub CLI keychain (gh auth token --user ${this.login})`;
  }

  /**
   * Troubleshoots the token provider.
   */
  troubleshoot(): string[] {
    return [
      `Run \`gh auth login --hostname github.com\` while signed in as ${this.login}.`,
      `Check with \`gh auth status\` that ${this.login} is listed.`,
      "Note: the web flow reuses your browser session; use `gh auth login --with-token` with a PAT for additional accounts.",
    ];
  }

  /**
   * Gets a token for the account.
   */
  async getToken(): Promise<string> {
    let result: ExecResult;
    try {
      result = await defaultExec("gh", ["auth", "token", "--user", this.login]);
    } catch {
      throw new AuthError("AUTHProviderFailure", "The GitHub CLI (`gh`) was not found on PATH", [
        "Install it from https://cli.github.com and run `gh auth login`.",
      ]);
    }
    if (result.code !== 0) {
      throw new AuthError(
        "AUTHProviderFailure",
        `Could not read a token for ${this.login} from the GitHub CLI: ${redactSecrets(result.stderr.trim())}`,
        this.troubleshoot(),
      );
    }
    return assertToken(result.stdout, `gh auth token --user ${this.login}`, this.troubleshoot());
  }
}

/**
 * Provides a token for an account using a command.
 */
export class TokenCommandTokenProvider implements TokenProvider {
  /**
   * The kind of token provider.
   */
  readonly kind = "tokenCommand" as const;
  /**
   * The command to execute.
   */
  private readonly command: string;

  /**
   * Creates a new token command token provider.
   *
   * @param command - The command to execute.
   */
  constructor(command: string) {
    this.command = command;
  }

  /**
   * Describes the token provider.
   */
  describe(): string {
    return `command (${redactSecrets(this.command)})`;
  }

  /**
   * Troubleshoots the token provider.
   */
  troubleshoot(): string[] {
    return [
      "Make sure the command prints only the token on stdout.",
      "Store tokens in the OS keychain or a secret manager, e.g. `security find-generic-password -s gh-forge-helper-1 -w`.",
      "GitHub Achievement Forge never writes the token to disk.",
    ];
  }

  /**
   * Gets a token for the account.
   */
  async getToken(): Promise<string> {
    const result = await defaultExec("/bin/sh", ["-c", this.command]);
    if (result.code !== 0) {
      throw new AuthError(
        "AUTHProviderFailure",
        `Token command failed with exit code ${result.code}: ${redactSecrets(result.stderr.trim())}`,
        this.troubleshoot(),
      );
    }
    return assertToken(result.stdout, "tokenCommand", this.troubleshoot());
  }
}

/**
 * Provides a token for an account using an environment variable.
 */
export class EnvTokenProvider implements TokenProvider {
  /**
   * The kind of token provider.
   */
  readonly kind = "env" as const;
  /**
   * The environment variable name.
   */
  private readonly variable: string;
  /**
   * The environment variables.
   */
  private readonly env: NodeJS.ProcessEnv;

  /**
   * Creates a new environment token provider.
   *
   * @param variable - The environment variable name.
   * @param env - The environment variables.
   */
  constructor(variable: string, env: NodeJS.ProcessEnv = process.env) {
    this.variable = variable;
    this.env = env;
  }

  /**
   * Describes the token provider.
   */
  describe(): string {
    return `environment variable ${this.variable}`;
  }

  /**
   * Troubleshoots the token provider.
   */
  troubleshoot(): string[] {
    return [
      `Export ${this.variable} in your shell before running gh-forge.`,
      "Prefer the `gh` provider or a keychain backed command for stored credentials.",
    ];
  }

  /**
   * Gets a token for the account.
   */
  async getToken(): Promise<string> {
    const raw = this.env[this.variable];
    if (raw === undefined || raw.trim() === "") {
      throw new AuthError(
        "AUTH_MISSING",
        `Environment variable ${this.variable} is not set`,
        this.troubleshoot(),
      );
    }
    return assertToken(raw, `env ${this.variable}`, this.troubleshoot());
  }
}

/**
 * Creates a token provider for an account.
 */
export function createTokenProvider(
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
): TokenProvider {
  const auth = account.auth;
  switch (auth.kind) {
    case "gh":
      return new GhCliTokenProvider(auth.login ?? account.username);
    case "tokenCommand":
      return new TokenCommandTokenProvider(auth.command);
    case "env":
      return new EnvTokenProvider(auth.var, env);
  }
}

/**
 * Asserts that a token is valid.
 *
 * @param raw - The raw token.
 * @param source - The source of the token.
 * @param hints - The hints.
 * @returns The token.
 */
function assertToken(raw: string, source: string, hints: string[]): string {
  const token = raw.trim();
  if (token === "" || /\s/.test(token)) {
    throw new AuthError("AUTHProviderFailure", `No valid token obtained from ${source}`, hints);
  }
  return token;
}

/**
 * In-memory token cache, scoped to a single CLI invocation.
 */
export class TokenCache {
  /**
   * The cache of tokens.
   */
  private readonly cache = new Map<string, string>();

  /**
   * Resolves a token for an account.
   */
  async resolve(accountId: string, provider: TokenProvider): Promise<string> {
    const cached = this.cache.get(accountId);
    if (cached !== undefined) return cached;
    const token = await provider.getToken();
    this.cache.set(accountId, token);
    return token;
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}
