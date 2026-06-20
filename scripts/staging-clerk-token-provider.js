const CLERK_SESSIONS_API_BASE_URL = "https://api.clerk.com/v1/sessions";
const DEFAULT_REFRESH_THRESHOLD_SECONDS = 15;

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64").toString("utf8");
};

const decodeJwtPayload = (token) => {
  const payload = token.split(".")[1];

  if (!payload) {
    throw new Error("Staging test token is not a JWT.");
  }

  return JSON.parse(base64UrlDecode(payload));
};

const decodeJwtSub = (token) => {
  const decoded = decodeJwtPayload(token);

  if (typeof decoded.sub !== "string" || !decoded.sub.trim()) {
    throw new Error("Staging test token JWT does not include a sub claim.");
  }

  return decoded.sub;
};

const getTokenSecondsRemaining = (token, nowMs = Date.now()) => {
  try {
    const decoded = decodeJwtPayload(token);

    if (typeof decoded.exp !== "number") {
      return Number.POSITIVE_INFINITY;
    }

    return decoded.exp - Math.floor(nowMs / 1000);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const createStaticTokenProvider = ({ label, token }) => ({
  canRefresh: false,
  getToken: async () => token,
  label,
  mode: "static",
});

const createClerkSessionTokenProvider = ({
  fetchImpl = fetch,
  label,
  now = () => Date.now(),
  refreshThresholdSeconds = DEFAULT_REFRESH_THRESHOLD_SECONDS,
  secretKey,
  sessionId,
}) => {
  let cachedToken;

  const mintToken = async () => {
    const response = await fetchImpl(`${CLERK_SESSIONS_API_BASE_URL}/${encodeURIComponent(sessionId)}/tokens`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Could not create Clerk session token for ${label}. Clerk returned HTTP ${response.status}.`);
    }

    const json = await response.json();

    if (typeof json?.jwt !== "string" || !json.jwt.trim()) {
      throw new Error(`Clerk session token response for ${label} did not include a JWT.`);
    }

    cachedToken = json.jwt;
    return cachedToken;
  };

  return {
    canRefresh: true,
    getToken: async ({ forceRefresh = false } = {}) => {
      if (
        forceRefresh ||
        !cachedToken ||
        getTokenSecondsRemaining(cachedToken, now()) < refreshThresholdSeconds
      ) {
        return mintToken();
      }

      return cachedToken;
    },
    label,
    mode: "clerk-session",
  };
};

const createAuthenticatedClient = (baseUrl, tokenProvider) => {
  const root = baseUrl.replace(/\/+$/g, "");

  return async (pathName, options = {}) => {
    const requestOnce = async (token) => {
      const method = options.method ?? "GET";
      const startedAt = Date.now();
      const headers = {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      };
      const response = await fetch(`${root}${pathName}`, {
        ...options,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers,
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : null;

      return {
        elapsedMs: Date.now() - startedAt,
        headers: response.headers,
        json,
        method,
        ok: response.ok,
        pathName,
        requestId: response.headers.get("x-request-id"),
        status: response.status,
      };
    };

    let token = await tokenProvider.getToken();
    let result = await requestOnce(token);

    if (result.status === 401 && tokenProvider.canRefresh) {
      token = await tokenProvider.getToken({ forceRefresh: true });
      result = await requestOnce(token);
      result.retriedAfterTokenRefresh = true;
    } else if (result.status === 401 && !tokenProvider.canRefresh) {
      result.authHint =
        "Request returned 401 in static-token staging mode. Static Clerk session tokens may have expired; configure CLERK_SECRET_KEY plus staging session ids to mint fresh tokens.";
    }

    return result;
  };
};

module.exports = {
  createAuthenticatedClient,
  createClerkSessionTokenProvider,
  createStaticTokenProvider,
  decodeJwtSub,
  getTokenSecondsRemaining,
};
