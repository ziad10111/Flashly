import { ROUTES } from "./routes";

export type AuthRedirectInput = {
  canRedirectSignedIn: boolean;
  isLoaded: boolean;
  isProtectedRoute: boolean;
  isSignedIn: boolean;
  pathname: string;
  signedInDestination: string;
};

type AuthRedirectAttempt = {
  destination: string | null;
  pathname: string;
};

const publicAuthPathnames = new Set<string>([ROUTES.onboarding, ROUTES.signIn, ROUTES.signUp, "/sso-callback"]);
const signedInRedirectPathnames = new Set<string>([ROUTES.signIn, ROUTES.signUp]);

export const normalizeAuthPathname = (pathname: string | null | undefined) => {
  const trimmedPathname = pathname?.trim() || ROUTES.home;
  const pathnameWithoutQuery = trimmedPathname.split("?")[0] || ROUTES.home;
  const pathnameWithSlash = pathnameWithoutQuery.startsWith("/") ? pathnameWithoutQuery : `/${pathnameWithoutQuery}`;

  return pathnameWithSlash.length > 1 && pathnameWithSlash.endsWith("/")
    ? pathnameWithSlash.slice(0, -1)
    : pathnameWithSlash;
};

export const isProtectedAuthPathname = (pathname: string) => !publicAuthPathnames.has(normalizeAuthPathname(pathname));

export const isSignedInRedirectPathname = (pathname: string) =>
  signedInRedirectPathnames.has(normalizeAuthPathname(pathname));

export function getAuthRedirectDestination(input: AuthRedirectInput) {
  const pathname = normalizeAuthPathname(input.pathname);

  if (!input.isLoaded) {
    return null;
  }

  if (!input.isSignedIn && input.isProtectedRoute) {
    return ROUTES.signIn === pathname ? null : ROUTES.signIn;
  }

  if (input.isSignedIn && input.canRedirectSignedIn && isSignedInRedirectPathname(pathname)) {
    const destination = normalizeAuthPathname(input.signedInDestination);

    return destination === pathname ? null : destination;
  }

  return null;
}

export const createAuthRedirectGuard = () => {
  let lastNavigationKey: string | null = null;

  return {
    reset() {
      lastNavigationKey = null;
    },
    shouldNavigate({ destination, pathname }: AuthRedirectAttempt) {
      const normalizedDestination = destination ? normalizeAuthPathname(destination) : null;
      const normalizedPathname = normalizeAuthPathname(pathname);

      if (!normalizedDestination || normalizedDestination === normalizedPathname) {
        lastNavigationKey = null;
        return false;
      }

      const navigationKey = `${normalizedPathname}->${normalizedDestination}`;

      if (lastNavigationKey === navigationKey) {
        return false;
      }

      lastNavigationKey = navigationKey;
      return true;
    },
  };
};
