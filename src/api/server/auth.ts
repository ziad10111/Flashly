import { verifyToken } from "@clerk/backend";
import type { ApiErrorDTO } from "@/api/contracts";
import { CLERK_SECRET_KEY, FLASHLY_AUTH_MODE, type FlashlyAuthMode } from "./config";
import { unauthorizedError } from "./apiErrors";
import { jsonApiError } from "./responses";

export type BackendAuthContext = {
  authenticated: true;
  mode: FlashlyAuthMode;
  sessionId?: string;
  userId: string;
};

export type BackendAuthState =
  | BackendAuthContext
  | {
      authenticated: false;
      error: ApiErrorDTO;
      mode: FlashlyAuthMode;
      userId: null;
    };

export type BackendAuthResult =
  | { ok: true; context: BackendAuthContext }
  | { ok: false; response: Response };

const mockUserId = "mock-clerk-user-flashly";

const hasInvalidAuthorizationHeader = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  return Boolean(authorization && !authorization.startsWith("Bearer "));
};

const getAuthorizationToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  return authorization?.replace("Bearer ", "").trim() ?? null;
};

const getMockAuthContext = (request: Request): BackendAuthState => {
  if (hasInvalidAuthorizationHeader(request)) {
    return {
      authenticated: false,
      error: unauthorizedError("Invalid authorization header."),
      mode: "mock",
      userId: null,
    };
  }

  return {
    authenticated: true,
    mode: "mock",
    userId: mockUserId,
  };
};

export const verifyClerkRequest = async (request: Request): Promise<BackendAuthState> => {
  if (hasInvalidAuthorizationHeader(request)) {
    return {
      authenticated: false,
      error: unauthorizedError("Invalid authorization header. Use Authorization: Bearer <token>."),
      mode: "clerk",
      userId: null,
    };
  }

  const token = getAuthorizationToken(request);

  if (!token) {
    return {
      authenticated: false,
      error: unauthorizedError("Missing Clerk session token."),
      mode: "clerk",
      userId: null,
    };
  }

  if (!CLERK_SECRET_KEY) {
    return {
      authenticated: false,
      error: unauthorizedError("Clerk backend authentication is missing server configuration."),
      mode: "clerk",
      userId: null,
    };
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : null;

    if (!userId) {
      return {
        authenticated: false,
        error: unauthorizedError("Clerk session token is missing a user id."),
        mode: "clerk",
        userId: null,
      };
    }

    return {
      authenticated: true,
      mode: "clerk",
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
      userId,
    };
  } catch {
    return {
      authenticated: false,
      error: unauthorizedError("Invalid or expired Clerk session token."),
      mode: "clerk",
      userId: null,
    };
  }
};

export const authenticateBackendRequest = async (request: Request): Promise<BackendAuthState> => {
  if (FLASHLY_AUTH_MODE === "clerk") {
    return verifyClerkRequest(request);
  }

  return getMockAuthContext(request);
};

export const requireBackendAuth = async (request: Request): Promise<BackendAuthResult> => {
  const auth = await authenticateBackendRequest(request);

  if (!auth.authenticated) {
    return {
      ok: false,
      response: jsonApiError(auth.error),
    };
  }

  return {
    ok: true,
    context: auth,
  };
};
