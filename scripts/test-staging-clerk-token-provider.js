const {
  createAuthenticatedClient,
  createClerkSessionTokenProvider,
  createStaticTokenProvider,
  getTokenSecondsRemaining,
} = require("./staging-clerk-token-provider");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const base64UrlEncode = (value) =>
  Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const makeJwt = ({ exp, sub = "user_test" }) =>
  `${base64UrlEncode({ alg: "none", typ: "JWT" })}.${base64UrlEncode({ exp, sub })}.signature`;

const createClerkFetch = (tokens, calls) => async (url, options) => {
  calls.push({
    authHeaderPresent: Boolean(options?.headers?.Authorization),
    method: options?.method,
    url: String(url).replace(/sessions\/[^/]+\/tokens/u, "sessions/[redacted]/tokens"),
  });
  const jwt = tokens.shift();

  if (!jwt) {
    return new Response(JSON.stringify({ error: "no token" }), { status: 500 });
  }

  return new Response(JSON.stringify({ jwt }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};

const withMockedFetch = async (fetchImpl, action) => {
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  try {
    return await action();
  } finally {
    global.fetch = originalFetch;
  }
};

const captureConsole = async (action) => {
  const messages = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args) => messages.push(args.join(" "));
  console.warn = (...args) => messages.push(args.join(" "));
  console.error = (...args) => messages.push(args.join(" "));

  try {
    await action();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return messages.join("\n");
};

const main = async () => {
  const nowSeconds = 1_900_000_000;
  const now = () => nowSeconds * 1000;
  const freshToken = makeJwt({ exp: nowSeconds + 60 });
  const nearlyExpiredToken = makeJwt({ exp: nowSeconds + 10 });
  const refreshedToken = makeJwt({ exp: nowSeconds + 60, sub: "user_refreshed" });

  assert(getTokenSecondsRemaining(freshToken, now()) === 60, "Expected JWT exp to decode locally.");

  {
    const calls = [];
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([freshToken], calls),
      label: "primary test user",
      now,
      secretKey: "sk_redaction_fixture",
      sessionId: "sess_redaction_fixture",
    });
    const first = await provider.getToken();
    const second = await provider.getToken();
    assert(first === second, "Expected fresh token to be reused while safely valid.");
    assert(calls.length === 1, "Expected one Clerk token mint for reusable fresh token.");
  }

  {
    const calls = [];
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([nearlyExpiredToken, refreshedToken], calls),
      label: "primary test user",
      now,
      secretKey: "sk_redaction_fixture",
      sessionId: "sess_redaction_fixture",
    });
    await provider.getToken();
    const second = await provider.getToken();
    assert(second === refreshedToken, "Expected nearly expired token to be refreshed.");
    assert(calls.length === 2, "Expected two Clerk token mints after near-expiry refresh.");
  }

  {
    const calls = [];
    const apiCalls = [];
    const secondUserRefreshedToken = makeJwt({ exp: nowSeconds + 60, sub: "user_b" });
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([nearlyExpiredToken, secondUserRefreshedToken], calls),
      label: "second test user",
      now,
      secretKey: "sk_redaction_fixture",
      sessionId: "sess_second_redaction_fixture",
    });
    await provider.getToken();
    await provider.getToken({ forceRefresh: true });
    const client = createAuthenticatedClient("https://staging.example", provider);
    await withMockedFetch(
      async (_url, options) => {
        apiCalls.push(options.headers.Authorization);
        return new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 });
      },
      async () => {
        const result = await client("/api/decks/deck_a");
        assert(result.status === 403, "Expected ownership request to preserve 403.");
      },
    );
    assert(apiCalls[0] === `Bearer ${secondUserRefreshedToken}`, "Expected User B ownership request to use refreshed User B token.");
  }

  {
    const calls = [];
    const apiCalls = [];
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([freshToken, refreshedToken], calls),
      label: "primary test user",
      now,
      secretKey: "sk_redaction_fixture",
      sessionId: "sess_redaction_fixture",
    });
    const client = createAuthenticatedClient("https://staging.example", provider);
    await withMockedFetch(
      async (_url, options) => {
        apiCalls.push(options.headers.Authorization);
        return new Response(JSON.stringify({ ok: apiCalls.length > 1 }), { status: apiCalls.length === 1 ? 401 : 200 });
      },
      async () => {
        const result = await client("/api/progress");
        assert(result.status === 200, "Expected one token refresh retry after 401.");
        assert(result.retriedAfterTokenRefresh === true, "Expected retry marker after token refresh.");
      },
    );
    assert(apiCalls.length === 2, "Expected one original request and one retry after 401.");
    assert(calls.length === 2, "Expected forced Clerk token mint after 401.");
  }

  {
    const calls = [];
    const apiCalls = [];
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([freshToken], calls),
      label: "second test user",
      now,
      secretKey: "sk_redaction_fixture",
      sessionId: "sess_second_redaction_fixture",
    });
    const client = createAuthenticatedClient("https://staging.example", provider);
    await withMockedFetch(
      async (_url, options) => {
        apiCalls.push(options.headers.Authorization);
        return new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 });
      },
      async () => {
        const result = await client("/api/decks/deck_a");
        assert(result.status === 403, "Expected 403 not to be retried.");
      },
    );
    assert(apiCalls.length === 1, "Expected 403 not to trigger retry.");
    assert(calls.length === 1, "Expected no forced Clerk token mint after 403.");
  }

  {
    const provider = createStaticTokenProvider({
      label: "static test user",
      token: "static-redaction-token",
    });
    const client = createAuthenticatedClient("https://staging.example", provider);
    let apiCalls = 0;
    await withMockedFetch(
      async (_url, options) => {
        apiCalls += 1;
        assert(options.headers.Authorization === "Bearer static-redaction-token", "Expected static token auth header.");
        return new Response(JSON.stringify({ error: { message: "expired" } }), { status: 401 });
      },
      async () => {
        const result = await client("/api/progress");
        assert(result.status === 401, "Expected static-token mode to return 401 without retry.");
        assert(result.authHint, "Expected safe static-token expiry hint.");
      },
    );
    assert(apiCalls === 1, "Expected static-token mode not to retry 401.");
  }

  const logs = await captureConsole(async () => {
    const calls = [];
    const provider = createClerkSessionTokenProvider({
      fetchImpl: createClerkFetch([freshToken], calls),
      label: "primary test user",
      now,
      secretKey: "sk_should_not_appear",
      sessionId: "sess_should_not_appear",
    });
    await provider.getToken();
  });
  assert(!logs.includes("sk_should_not_appear"), "Expected logs not to include Clerk secret.");
  assert(!logs.includes("sess_should_not_appear"), "Expected logs not to include Clerk session id.");
  assert(!logs.includes(freshToken), "Expected logs not to include JWT.");

  console.log("PASS staging Clerk token provider tests");
};

main().catch((error) => {
  console.error("FAIL staging Clerk token provider tests");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
