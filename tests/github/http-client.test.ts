import { describe, expect, it } from "vitest";
import { FetchHttpClient } from "../../src/github/http/http-client.js";

function makeFetch(
  handler: (request: { method: string; url: string; headers: Headers; body: string | null }) => Response | Promise<Response>,
): typeof fetch {
  type FetchInput = Parameters<typeof fetch>[0];
  return (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const url = String(input);
    const headers = new Headers(init?.headers as Record<string, string> | undefined);
    const body = init?.body != null ? String(init.body) : null;
    return handler({ method, url, headers, body });
  }) as typeof fetch;
}

function client(fetchImpl: typeof fetch, token = "ghp_testtoken1234567890"): FetchHttpClient {
  return new FetchHttpClient({
    token: async () => token,
    minIntervalMs: 0,
    maxRetries: 1,
    sleep: () => Promise.resolve(),
    fetchImpl,
  });
}

describe("FetchHttpClient", () => {
  it("sends the authorization header", async () => {
    let sawAuth = false;
    const http = client(
      makeFetch(({ headers }) => {
        sawAuth = Boolean(headers.get("authorization"));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await http.request({ path: "/user" });
    expect(sawAuth).toBe(true);
  });

  it("parses JSON responses", async () => {
    const http = client(
      makeFetch(() => new Response(JSON.stringify({ login: "octocat" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    );
    const response = await http.request<{ login: string }>({ path: "/user" });
    expect(response.data.login).toBe("octocat");
  });

  it("returns null from requestOptional on 404", async () => {
    const http = client(
      makeFetch(() => new Response(JSON.stringify({ message: "nope" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })),
    );
    expect(await http.requestOptional({ path: "/things/1" })).toBeNull();
  });

  it("throws GitHubHttpError for non-404 failures", async () => {
    const http = client(
      makeFetch(() => new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-limit": "5000",
          "x-ratelimit-reset": "9999999999",
          "x-ratelimit-used": "5000",
        },
      })),
    );
    await expect(http.request({ path: "/x" })).rejects.toMatchObject({
      code: "GITHUB_RATE_LIMITED",
    });
  });

  it("retries 5xx responses up to maxRetries", async () => {
    let attempts = 0;
    const http = client(
      makeFetch(() => {
        attempts += 1;
        if (attempts === 1) {
          return new Response("boom", { status: 503 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const response = await http.request({ path: "/x" });
    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it("captures rate limit headers", async () => {
    const http = client(
      makeFetch(() =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-reset": "1700000000",
            "x-ratelimit-used": "1",
          },
        }),
      ),
    );
    await http.request({ path: "/x" });
    expect(http.rateLimit).toEqual({
      limit: 5000,
      remaining: 4999,
      used: 1,
      resetAt: 1700000000,
    });
  });

  it("never logs the raw token in debug output", async () => {
    const token = "ghp_supersecrettoken1234567890zzzzzzzz";
    let logged = "";
    const logger = {
      debug: (message: string) => {
        logged += message;
      },
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => logger,
    };
    const http = new FetchHttpClient({
      token: async () => token,
      minIntervalMs: 0,
      maxRetries: 0,
      sleep: () => Promise.resolve(),
      fetchImpl: makeFetch(() => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
      logger,
    });
    await http.request({ path: "/user" });
    expect(logged).not.toContain(token);
  });

  it("throttles requests by minIntervalMs", async () => {
    let calls = 0;
    let lastCallAt = 0;
    const http = new FetchHttpClient({
      token: async () => "t",
      minIntervalMs: 5,
      maxRetries: 0,
      fetchImpl: makeFetch(async () => {
        calls += 1;
        const now = Date.now();
        if (calls > 1) {
          expect(now - lastCallAt).toBeGreaterThanOrEqual(4);
        }
        lastCallAt = now;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });
    await http.request({ path: "/1" });
    await http.request({ path: "/2" });
    expect(calls).toBe(2);
  });

  it("executes GraphQL with the right body", async () => {
    let bodySeen: string | null = null;
    const http = client(
      makeFetch(({ body }) => {
        bodySeen = body;
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await http.graphql("{ viewer { login } }", { foo: "bar" });
    expect(bodySeen).toContain("viewer");
    expect(bodySeen).toContain("bar");
  });

  it("surfaces GraphQL errors", async () => {
    const http = client(
      makeFetch(() =>
        new Response(
          JSON.stringify({ errors: [{ message: "Field 'x' doesn't exist" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(http.graphql("{ bogus }")).rejects.toThrow(/doesn't exist/);
  });
});