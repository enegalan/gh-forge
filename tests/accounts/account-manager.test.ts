import { describe, expect, it } from "vitest";
import { AccountManager } from "../../src/accounts/account-manager.js";
import { makeAccount } from "../helpers.js";
import type { AccountCapabilities } from "../../src/accounts/capabilities.js";

function mockFetchFor(login: string, scopes = ["repo", "user:email"]): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("/user/emails")) {
      return new Response(
        JSON.stringify([
          { email: `${login}@example.com`, primary: true, verified: true, visibility: "public" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/rate_limit")) {
      return new Response(JSON.stringify({ rate: { limit: 5000, remaining: 5000, reset: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
    const manager = managerWithToken("ghp_test", mockFetchFor("octocat", ["repo"]));
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

  describe("co-author commit email verification", () => {
    function managerWithEmails(fetchImpl: typeof fetch, commitEmail?: string): AccountManager {
      return new AccountManager({
        accounts: [
          makeAccount({
            id: "helper",
            username: "octohelper",
            role: "helper",
            auth: { kind: "env", var: "GH_TEST_TOKEN_HELPER" },
            ...(commitEmail === undefined ? {} : { commitEmail }),
          }),
        ],
        env: { GH_TEST_TOKEN_HELPER: "ghp_test" },
        minIntervalMs: 0,
        fetchImpl,
        sleep: () => Promise.resolve(),
      });
    }

    it("accepts a configured email that GitHub reports as verified", async () => {
      const capabilities = await managerWithEmails(mockFetchFor("octohelper")).probe("helper");
      expect(capabilities.commitEmail).toBe("octohelper@example.com");
      expect(capabilities.commitEmailVerified).toBe(true);
      expect(capabilities.canAttributeCoAuthoredCommit).toBe(true);
    });

    it("rejects a configured email that GitHub does not report as verified", async () => {
      const manager = managerWithEmails(mockFetchFor("octohelper"), "helper@not-verified.test");
      const capabilities = await manager.probe("helper");
      expect(capabilities.commitEmail).toBeNull();
      expect(capabilities.commitEmailVerified).toBe(false);
      expect(capabilities.canAttributeCoAuthoredCommit).toBe(false);
      expect(capabilities.notes.join("\n")).toMatch(/not a verified email address/);
    });

    it("rejects a configured email when the account has no verified addresses", async () => {
      const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.includes("/user/emails")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ login: "octohelper", id: 2, type: "User" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-oauth-scopes": "repo,user:email" },
        });
      }) as typeof fetch;
      const capabilities = await managerWithEmails(fetchImpl, "helper@example.com").probe("helper");
      expect(capabilities.canAttributeCoAuthoredCommit).toBe(false);
      expect(capabilities.notes.join("\n")).toMatch(
        /not a verified email address[\s\S]*Verified addresses on "octohelper": \(none\)/,
      );
    });

    it("never trusts a configured email when the token lacks the user:email scope", async () => {
      const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        // GitHub answers 404 for /user/emails without the scope, which the HTTP
        // layer surfaces as an empty list rather than an error.
        if (url.includes("/user/emails")) {
          return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ login: "octohelper", id: 2, type: "User" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-oauth-scopes": "repo" },
        });
      }) as typeof fetch;
      const manager = managerWithEmails(fetchImpl, "helper@example.com");
      const capabilities = await manager.probe("helper");
      expect(capabilities.commitEmailVerified).toBe(false);
      expect(capabilities.canAttributeCoAuthoredCommit).toBe(false);
      expect(capabilities.notes.join("\n")).toMatch(/user:email/);
    });

    it("never trusts a configured email that belongs to another account", async () => {
      const capabilities = await managerWithEmails(
        mockFetchFor("octohelper"),
        "enegalan@ikzubirimanteo.com",
      ).probe("helper");
      expect(capabilities.canAttributeCoAuthoredCommit).toBe(false);
    });
  });
});
