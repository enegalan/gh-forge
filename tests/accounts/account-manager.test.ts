import { describe, expect, it } from "vitest";
import { AccountManager } from "../../src/accounts/account-manager.js";
import { makeAccount } from "../helpers.js";
import type { AccountCapabilities } from "../../src/accounts/capabilities.js";

function mockFetchFor(login: string, scopes = ["repo"]): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("/user/emails")) {
      return new Response(
        JSON.stringify([{ email: `${login}@example.com`, primary: true, verified: true, visibility: "public" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/rate_limit")) {
      return new Response(
        JSON.stringify({ rate: { limit: 5000, remaining: 5000, reset: 0 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/repos/")) {
      return new Response(
        JSON.stringify({
          id: 1,
          node_id: "R_1",
          name: "gh-forge-sandbox",
          full_name: `${login}/gh-forge-sandbox`,
          owner: { login },
          private: false,
          fork: false,
          archived: false,
          has_discussions: true,
          default_branch: "main",
          stargazers_count: 0,
          html_url: "",
          permissions: { admin: true, push: true, pull: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ login, id: 1, type: "User", html_url: "" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-oauth-scopes": scopes.join(",") },
    });
  }) as typeof fetch;
}

function managerWithToken(token: string, fetchImpl: typeof fetch): AccountManager {
  return new AccountManager({
    accounts: [
      makeAccount({ auth: { kind: "env", var: "GH_TEST_TOKEN_MAIN" } }),
      makeAccount({
        id: "helper",
        username: "octohelper",
        role: "helper",
        auth: { kind: "env", var: "GH_TEST_TOKEN_HELPER" },
      }),
    ],
    env: { GH_TEST_TOKEN_MAIN: token, GH_TEST_TOKEN_HELPER: `${token}helper` },
    minIntervalMs: 0,
    fetchImpl,
    sleep: () => Promise.resolve(),
  });
}

describe("AccountManager", () => {
  it("authenticates an account whose token matches the configured username", async () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat"));
    const authenticated = await manager.authenticate("main");
    expect(authenticated.login).toBe("octocat");
    expect(authenticated.scopes).toEqual(["repo"]);
  });

  it("rejects a token belonging to a different user", async () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("someone-else"));
    await expect(manager.authenticate("main")).rejects.toThrow(/belongs to/);
  });

  it("probes read-only capabilities", async () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat"));
    const capabilities: AccountCapabilities = await manager.probe("main", {
      owner: "octocat",
      name: "gh-forge-sandbox",
    });
    expect(capabilities.authenticated).toBe(true);
    expect(capabilities.login).toBe("octocat");
    expect(capabilities.identityMatches).toBe(true);
    expect(capabilities.canCreateRepository).toBe(true);
    expect(capabilities.canPushToSandbox).toBe(true);
    expect(capabilities.canCreateDiscussions).toBe(true);
    expect(capabilities.commitEmail).toBe("octocat@example.com");
  });

  it("returns an unauthenticated probe when the token is rejected", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const manager = managerWithToken("ghp_bad", fetchImpl);
    const capabilities = await manager.probe("main");
    expect(capabilities.authenticated).toBe(false);
    expect(capabilities.identityMatches).toBe(false);
    expect(capabilities.notes.length).toBeGreaterThan(0);
  });

  it("all() returns every configured account", () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat"));
    expect(manager.all()).toHaveLength(2);
  });

  it("get() throws for unknown accounts", () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat"));
    expect(() => manager.get("nope")).toThrow(/Unknown account/);
  });

  it("helpers() returns only helper roles", () => {
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat"));
    const helpers = manager.helpers();
    expect(helpers).toHaveLength(1);
    expect(helpers[0]?.role).toBe("helper");
  });

  it("reports untouched empty capabilities for an account with no token", async () => {
    const manager = new AccountManager({
      accounts: [makeAccount({ auth: { kind: "env", var: "GH_TEST_TOKEN_MAIN" } })],
      env: {},
      minIntervalMs: 0,
      fetchImpl: mockFetchFor("octocat"),
      sleep: () => Promise.resolve(),
    });
    const capabilities = await manager.probe("main");
    expect(capabilities.authenticated).toBe(false);
    expect(capabilities.login).toBeNull();
  });
});