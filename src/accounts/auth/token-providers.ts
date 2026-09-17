import { execFile } from "node:child_process";
import type { Account } from "../account.js";
import { AuthError } from "../../utils/errors.js";
import { redactSecrets } from "../../utils/redact.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type ExecFn = (command: string, args: string[]) => Promise<ExecResult>;

export const defaultExec: ExecFn = (command, args) =>
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
 * Sources a token for one account. Tokens are never persisted by GAF: they are
 * read on demand into memory and only ever passed to the HTTP client.
 */
export interface TokenProvider {
  readonly kind: "gh" | "tokenCommand" | "env";
  /** Safe to print: never contains the secret. */
  describe(): string;
  getToken(): Promise<string>;
  troubleshoot(): string[];
}

export class GhCliTokenProvider implements TokenProvider {
  readonly kind = "gh" as const;
  private readonly login: string;
  private readonly exec: ExecFn;

  constructor(login: string, exec: ExecFn) {
    this.login = login;
    this.exec = exec;
  }

  describe(): string {
    return `GitHub CLI keychain (gh auth token --user ${this.login})`;
  }

  troubleshoot(): string[] {
    return [
      `Run \`gh auth login --hostname github.com\` while signed in as ${this.login}.`,
      `Check with \`gh auth status\` that ${this.login} is listed.`,
      "Note: the web flow reuses your browser session; use `gh auth login --with-token` with a PAT for additional accounts.",
    ];
  }

  async getToken(): Promise<string> {
    let result: ExecResult;
    try {
      result = await this.exec("gh", ["auth", "token", "--user", this.login]);
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

export class TokenCommandTokenProvider implements TokenProvider {
  readonly kind = "tokenCommand" as const;
  private readonly command: string;
  private readonly exec: ExecFn;

  constructor(command: string, exec: ExecFn) {
    this.command = command;
    this.exec = exec;
  }

  describe(): string {
    return `command (${redactSecrets(this.command)})`;
  }

  troubleshoot(): string[] {
    return [
      "Make sure the command prints only the token on stdout.",
      "Store tokens in the OS keychain or a secret manager, e.g. `security find-generic-password -s gh-forge-helper-1 -w`.",
      "GAF never writes the token to disk.",
    ];
  }

  async getToken(): Promise<string> {
    const result = await this.exec("/bin/sh", ["-c", this.command]);
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

export class EnvTokenProvider implements TokenProvider {
  readonly kind = "env" as const;
  private readonly variable: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(variable: string, env: NodeJS.ProcessEnv = process.env) {
    this.variable = variable;
    this.env = env;
  }

  describe(): string {
    return `environment variable ${this.variable}`;
  }

  troubleshoot(): string[] {
    return [
      `Export ${this.variable} in your shell before running gh-forge.`,
      "Prefer the `gh` provider or a keychain backed command for stored credentials.",
    ];
  }

  async getToken(): Promise<string> {
    const raw = this.env[this.variable];
    if (raw === undefined || raw.trim() === "") {
      throw new AuthError("AUTH_MISSING", `Environment variable ${this.variable} is not set`, this.troubleshoot());
    }
    return assertToken(raw, `env ${this.variable}`, this.troubleshoot());
  }
}

export function createTokenProvider(account: Account, exec: ExecFn = defaultExec, env: NodeJS.ProcessEnv = process.env): TokenProvider {
  const auth = account.auth;
  switch (auth.kind) {
    case "gh":
      return new GhCliTokenProvider(auth.login ?? account.username, exec);
    case "tokenCommand":
      return new TokenCommandTokenProvider(auth.command, exec);
    case "env":
      return new EnvTokenProvider(auth.var, env);
  }
}

function assertToken(raw: string, source: string, hints: string[]): string {
  const token = raw.trim();
  if (token === "" || /\s/.test(token)) {
    throw new AuthError(
      "AUTHProviderFailure",
      `No valid token obtained from ${source}`,
      hints,
    );
  }
  return token;
}

/** In-memory token cache, scoped to a single CLI invocation. */
export class TokenCache {
  private readonly cache = new Map<string, string>();

  async resolve(accountId: string, provider: TokenProvider): Promise<string> {
    const cached = this.cache.get(accountId);
    if (cached !== undefined) return cached;
    const token = await provider.getToken();
    this.cache.set(accountId, token);
    return token;
  }

  clear(): void {
    this.cache.clear();
  }
}