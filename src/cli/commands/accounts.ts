import type { AccountAuthConfig, AccountRefConfig } from "../../config/schema.js";
import { listAccounts, resolveMainAccountId } from "../../config/config.js";
import { describeCapabilities } from "../../accounts/capabilities.js";
import type { Account, AccountRole } from "../../accounts/account.js";
import { resolveSandbox } from "../../runtime/context.js";
import type { GafPaths } from "../../config/paths.js";
import {
  buildAccountManager,
  configStoreFor,
  loadConfigOrThrow,
  mainAccountIdOrThrow,
} from "../context.js";
import { AccountError, UsageError } from "../../utils/errors.js";
import { bullet, printLine, section, table } from "../ui/format.js";

/**
 * The options for adding an account.
 */
export interface AccountAddOptions {
  role?: AccountRole;
  username?: string;
  auth?: "gh" | "token-command" | "env";
  login?: string;
  command?: string;
  envVar?: string;
  email?: string;
  noVerify?: boolean;
  force?: boolean;
}

/**
 * Adds an account.
 *
 * @param paths - The paths.
 * @param id - The ID of the account.
 * @param options - The options.
 * @returns The result code.
 */
export async function accountsAdd(
  paths: GafPaths,
  id: string,
  options: AccountAddOptions,
): Promise<number> {
  const store = configStoreFor(paths);
  const config = await store.loadOrDefault();

  if (config.accounts[id] !== undefined && options.force !== true) {
    throw new AccountError("ACCOUNT_DUPLICATE", `Account "${id}" already exists`, [
      "Use --force to overwrite it, or pick another id.",
    ]);
  }
  if (options.username === undefined || options.username.trim() === "") {
    throw new UsageError("An account needs the GitHub username it belongs to", [
      `Run \`gh-forge accounts add ${id} --username <login>\` (add --role main for the primary account).`,
      "GitHub Achievement Forge always verifies that the credential belongs to this username.",
    ]);
  }
  const role = options.role ?? (id === "main" ? "main" : "helper");
  const auth = buildAuthRef(options);

  const ref: AccountRefConfig = {
    username: options.username,
    role,
    auth,
    ...(options.email === undefined ? {} : { commitEmail: options.email }),
  };

  if (role === "main") {
    const currentMainId = resolveMainAccountId(config);
    if (currentMainId !== null && currentMainId !== id) {
      throw new AccountError(
        "ACCOUNT_DUPLICATE",
        `Account "${currentMainId}" is already the main account (${config.accounts[currentMainId]?.username ?? "?"})`,
        ["Remove it first, or add this one with --role helper."],
      );
    }
  }

  config.accounts[id] = ref;
  if (role === "main") config.mainAccount = id;
  await store.save(config);

  printLine(`Added account "${id}" (${options.username}, ${role}, auth: ${describeAuth(auth)}).`);

  if (options.noVerify === true) return 0;
  return verifySingle(paths, id, config);
}

/**
 * Builds an authentication reference from the options.
 *
 * @param options - The options.
 * @returns The authentication reference.
 */
function buildAuthRef(options: AccountAddOptions): AccountAuthConfig {
  const kind = options.auth ?? "gh";
  switch (kind) {
    case "gh":
      return { kind: "gh", login: options.login ?? options.username ?? "" };
    case "token-command":
      if (options.command === undefined || options.command.trim() === "") {
        throw new UsageError("--auth token-command requires --command '<shell command>'", [
          "The command must print the token on stdout, e.g. `security find-generic-password -s gh-forge-helper-1 -w`.",
          "GitHub Achievement Forge never writes the token to disk and never logs it.",
        ]);
      }
      return { kind: "tokenCommand", command: options.command };
    case "env":
      if (options.envVar === undefined || options.envVar.trim() === "") {
        throw new UsageError("--auth env requires --env-var <NAME>");
      }
      return { kind: "env", var: options.envVar };
  }
}

/**
 * Describes an authentication reference.
 *
 * @param auth - The authentication reference.
 * @returns The description of the authentication reference.
 */
function describeAuth(auth: AccountAuthConfig): string {
  switch (auth.kind) {
    case "gh":
      return `gh keychain${auth.login === undefined ? "" : ` (login ${auth.login})`}`;
    case "tokenCommand":
      return "external command (token never stored by GitHub Achievement Forge)";
    case "env":
      return `environment variable ${auth.var}`;
  }
}

/**
 * Verifies a single account.
 *
 * @param paths - The paths.
 * @param id - The ID of the account.
 * @param config - The configuration.
 * @returns The result code.
 */
async function verifySingle(
  paths: GafPaths,
  id: string,
  config: Awaited<ReturnType<typeof loadConfigOrThrow>>,
): Promise<number> {
  const manager = await buildAccountManager(paths, {}, config);
  const account = manager.get(id);
  const mainUsername = config.accounts[mainAccountIdOrThrow(config)]?.username ?? account.username;
  const sandbox = resolveSandbox(config, mainUsername);
  const capabilities = await manager.probe(id, { owner: sandbox.owner, name: sandbox.name });
  for (const line of describeCapabilities(account, capabilities)) printLine(line);
  if (!capabilities.authenticated) {
    printLine();
    printLine("Authentication failed. Fix it with one of:");
    for (const hint of bullet(manager.troubleshootFor(account))) printLine(hint);
    return 1;
  }
  return 0;
}

/**
 * Lists the accounts.
 */
export async function accountsList(paths: GafPaths, asJson: boolean): Promise<number> {
  const config = await loadConfigOrThrow(paths);
  const mainId = resolveMainAccountId(config);
  const accounts = listAccounts(config);
  if (asJson) {
    printLine(
      JSON.stringify(
        accounts.map(({ id, account }) => ({
          id,
          username: account.username,
          role: account.role,
          main: id === mainId,
          auth: describeAuth(account.auth),
          commitEmail: account.commitEmail ?? null,
        })),
        null,
        2,
      ),
    );
    return 0;
  }
  section("Accounts (all owned and authenticated by you)");
  printLine(
    table(
      ["id", "username", "role", "main", "auth", "commit email"],
      accounts.map(({ id, account }) => [
        id,
        account.username,
        account.role,
        id === mainId ? "*" : "",
        describeAuth(account.auth),
        account.commitEmail ?? "",
      ]),
    ),
  );
  printLine();
  printLine(
    "GitHub Achievement Forge never creates GitHub accounts, never asks for passwords and never uses accounts owned by others.",
  );
  return 0;
}

/**
 * Tests the accounts.
 *
 * @param paths - The paths.
 * @param accountId - The ID of the account.
 * @returns The result code.
 */
export async function accountsTest(
  paths: GafPaths,
  accountId: string | undefined,
): Promise<number> {
  const config = await loadConfigOrThrow(paths);
  const manager = await buildAccountManager(paths, {}, config);
  const mainUsername = config.accounts[mainAccountIdOrThrow(config)]?.username ?? "";
  const sandbox = resolveSandbox(config, mainUsername);
  const targets: Account[] = accountId === undefined ? manager.all() : [manager.get(accountId)];

  let failures = 0;
  for (const account of targets) {
    const capabilities = await manager.probe(account.id, {
      owner: sandbox.owner,
      name: sandbox.name,
    });
    section("");
    for (const line of describeCapabilities(account, capabilities)) printLine(line);
    if (!capabilities.authenticated) failures += 1;
  }
  return failures === 0 ? 0 : 1;
}

/**
 * Removes an account.
 *
 * @param paths - The paths.
 * @param id - The ID of the account.
 * @returns The result code.
 */
export async function accountsRemove(paths: GafPaths, id: string): Promise<number> {
  const store = configStoreFor(paths);
  const config = await store.loadOrDefault();
  if (config.accounts[id] === undefined) {
    throw new AccountError("ACCOUNT_NOT_FOUND", `Account "${id}" is not configured`);
  }
  delete config.accounts[id];
  if (config.mainAccount === id) config.mainAccount = null;
  await store.save(config);
  printLine(`Removed account "${id}" from gh-forge.`);
  printLine(
    "(Its GitHub credentials were not touched: GitHub Achievement Forge never stored them.)",
  );
  return 0;
}

/**
 * Sets the commit email for an account.
 *
 * @param paths - The paths.
 * @param id - The ID of the account.
 * @param email - The commit email.
 * @returns The result code.
 */
export async function accountsSetEmail(
  paths: GafPaths,
  id: string,
  email: string,
): Promise<number> {
  const store = configStoreFor(paths);
  const config = await store.loadOrDefault();
  const account = config.accounts[id];
  if (account === undefined) {
    throw new AccountError("ACCOUNT_NOT_FOUND", `Account "${id}" is not configured`);
  }
  account.commitEmail = email;
  await store.save(config);
  printLine(`Set commit email for "${id}" to ${email}.`);
  printLine("The email must be verified on that GitHub account for co-authorship to be credited.");
  return 0;
}
