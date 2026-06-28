import { readFileSync } from "node:fs";

import { shouldTreatBackendDeleteErrorAsSuccessfulCleanup } from "../src/api/repositories/deckDeletion";
import {
  createAuthRedirectGuard,
  getAuthRedirectDestination,
  isProtectedAuthPathname,
} from "../src/lib/navigation/authRedirect";
import {
  ROUTES,
  createDeckRoute,
  createReviewRoute,
  createSingleNavigationGuard,
  getInvalidDeckFallbackRoute,
  getPostAuthRoute,
  getReviewUnavailableFallbackRoute,
  getSafeDeckRoute,
  isProtectedRootSegment,
} from "../src/lib/navigation/routes";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getAuthRedirect = ({
  canRedirectSignedIn = true,
  isLoaded = true,
  isSignedIn = false,
  pathname,
  signedInDestination = ROUTES.home,
}: {
  canRedirectSignedIn?: boolean;
  isLoaded?: boolean;
  isSignedIn?: boolean;
  pathname: string;
  signedInDestination?: string;
}) =>
  getAuthRedirectDestination({
    canRedirectSignedIn,
    isLoaded,
    isProtectedRoute: isProtectedAuthPathname(pathname),
    isSignedIn,
    pathname,
    signedInDestination,
  });

assert(getPostAuthRoute(true) === ROUTES.home, "Successful login should route to Home when setup is complete.");
assert(getPostAuthRoute(false) === ROUTES.studyType, "Successful login should route to study-type setup when setup is missing.");
assert(ROUTES.signIn === "/sign-in", "Logout should replace the stack with the public sign-in route.");

assert(isProtectedRootSegment("(tabs)"), "Signed-out users should not access protected tabs.");
assert(isProtectedRootSegment("deck"), "Signed-out users should not access deck details.");
assert(isProtectedRootSegment("review"), "Signed-out users should not access review sessions.");
assert(isProtectedRootSegment("upgrade"), "Signed-out users should not access upgrade.");
assert(!isProtectedRootSegment("sign-in"), "Sign-in should remain public.");

assert(!isProtectedAuthPathname(ROUTES.signIn), "Sign-in should remain a public auth route.");
assert(!isProtectedAuthPathname("/sso-callback"), "SSO callback should remain public while auth completes.");
assert(isProtectedAuthPathname(ROUTES.home), "Home should be protected for signed-out users.");
assert(isProtectedAuthPathname(ROUTES.studyType), "Study-type setup should be protected for signed-out users.");
assert(getAuthRedirect({ isLoaded: false, pathname: ROUTES.home }) === null, "Clerk loading should not redirect.");
assert(getAuthRedirect({ pathname: ROUTES.signIn }) === null, "Signed-out users already on sign-in should not redirect.");
assert(
  getAuthRedirect({ pathname: ROUTES.home }) === ROUTES.signIn,
  "Signed-out users on a protected route should redirect to sign-in.",
);
assert(getAuthRedirect({ pathname: "/sso-callback" }) === null, "Signed-out users on SSO callback should not redirect.");
assert(
  getAuthRedirect({ isSignedIn: true, pathname: ROUTES.home }) === null,
  "Signed-in users already on the authenticated destination should not redirect.",
);
assert(
  getAuthRedirect({ isSignedIn: true, pathname: ROUTES.signIn }) === ROUTES.home,
  "Signed-in users on sign-in should redirect to the canonical signed-in route.",
);
assert(
  getAuthRedirect({ isSignedIn: true, pathname: ROUTES.signIn, signedInDestination: ROUTES.studyType }) ===
    ROUTES.studyType,
  "Signed-in users without setup should redirect to study-type setup.",
);
assert(
  getAuthRedirect({ canRedirectSignedIn: false, isSignedIn: true, pathname: ROUTES.signIn }) === null,
  "Signed-in auth redirects should wait for local progress hydration.",
);
assert(
  getAuthRedirect({ isSignedIn: true, pathname: ROUTES.signIn, signedInDestination: ROUTES.signIn }) === null,
  "Auth routing should not navigate when the destination equals the current pathname.",
);

const authGuard = createAuthRedirectGuard();
assert(
  authGuard.shouldNavigate({ destination: ROUTES.signIn, pathname: ROUTES.home }),
  "First auth redirect should navigate.",
);
assert(
  !authGuard.shouldNavigate({ destination: ROUTES.signIn, pathname: ROUTES.home }),
  "Repeated renders with unchanged auth and route state should not navigate again.",
);
authGuard.reset();
assert(
  !authGuard.shouldNavigate({ destination: ROUTES.signIn, pathname: ROUTES.signIn }),
  "Auth redirect guard should block route replacement to the current pathname.",
);

const loadingThenSignedOutGuard = createAuthRedirectGuard();
const loadingRedirect = getAuthRedirect({ isLoaded: false, pathname: ROUTES.home });
assert(
  !loadingThenSignedOutGuard.shouldNavigate({ destination: loadingRedirect, pathname: ROUTES.home }),
  "Auth loading should not call router.replace.",
);
const signedOutRedirect = getAuthRedirect({ isLoaded: true, pathname: ROUTES.home });
assert(
  loadingThenSignedOutGuard.shouldNavigate({ destination: signedOutRedirect, pathname: ROUTES.home }),
  "Auth loading to signed-out should issue one deterministic redirect.",
);
assert(
  !loadingThenSignedOutGuard.shouldNavigate({ destination: signedOutRedirect, pathname: ROUTES.home }),
  "Auth loading to signed-out should not issue duplicate redirects.",
);

const signedOutThenSignedInGuard = createAuthRedirectGuard();
assert(
  !signedOutThenSignedInGuard.shouldNavigate({
    destination: getAuthRedirect({ isSignedIn: false, pathname: ROUTES.signIn }),
    pathname: ROUTES.signIn,
  }),
  "Signed-out users on sign-in should produce zero router.replace calls.",
);
assert(
  signedOutThenSignedInGuard.shouldNavigate({
    destination: getAuthRedirect({ isSignedIn: true, pathname: ROUTES.signIn }),
    pathname: ROUTES.signIn,
  }),
  "Signed-out to signed-in on sign-in should issue one deterministic redirect.",
);
assert(
  !signedOutThenSignedInGuard.shouldNavigate({
    destination: getAuthRedirect({ isSignedIn: true, pathname: ROUTES.signIn }),
    pathname: ROUTES.signIn,
  }),
  "Signed-out to signed-in should not issue duplicate redirects.",
);

assert(createDeckRoute("deck-a") === "/deck/deck-a", "Opening a valid deck should route to deck detail.");
assert(createDeckRoute("deck a/1") === "/deck/deck%20a%2F1", "Deck route params should be encoded.");
assert(getSafeDeckRoute("   ") === null, "Blank deck ids should not produce a navigable deck route.");
assert(getInvalidDeckFallbackRoute() === "/decks?notice=deck-not-found", "Invalid deck ids should redirect to Decks.");
assert(getReviewUnavailableFallbackRoute() === "/decks?notice=review-unavailable", "Missing review state should redirect to Decks.");

assert(createReviewRoute("deck-a") === "/review/deck-a", "Full review should route to the review screen.");
assert(createReviewRoute("deck-a", "weak") === "/review/deck-a?mode=weak", "Weak-card review should include the weak mode.");

assert(ROUTES.decks === "/decks", "Successful deck deletion should replace with Decks.");
assert(shouldTreatBackendDeleteErrorAsSuccessfulCleanup(404), "Backend 404 delete should be treated as stale-local success.");
assert(!shouldTreatBackendDeleteErrorAsSuccessfulCleanup(500), "Backend 500 delete should keep the user on the current deck page.");

assert(ROUTES.upgrade === "/upgrade", "Expired-trial restricted actions should route to Upgrade.");
assert(createReviewRoute("deck-a") !== ROUTES.upgrade, "Allowed expired-trial review actions should remain accessible.");

const guard = createSingleNavigationGuard();
assert(guard.shouldNavigate("generation-complete:deck-a"), "First generation completion should navigate.");
assert(!guard.shouldNavigate("generation-complete:deck-a"), "Duplicate generation completion should not navigate twice.");
assert(guard.shouldNavigate("generation-complete:deck-b"), "A different generated deck should be allowed to navigate.");
guard.reset();
assert(guard.shouldNavigate("generation-complete:deck-a"), "Reset should allow a later generation run to navigate.");

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");
const tabsLayoutSource = readFileSync("src/app/(tabs)/_layout.tsx", "utf8");
const authScreenSource = readFileSync("src/components/auth/auth-screen.tsx", "utf8");
const startupFallbackIndex = rootLayoutSource.indexOf("return <StartupConfigurationScreen />");
const authRouteGateIndex = rootLayoutSource.indexOf("<AuthRouteGate>");

assert(rootLayoutSource.includes("usePathname"), "AuthRouteGate should use stable pathname routing.");
assert(!rootLayoutSource.includes("useSegments"), "AuthRouteGate should not depend on the unstable segments array.");
assert(!rootLayoutSource.includes("router.dismissAll()"), "AuthRouteGate should not chain dismissAll with replace.");
assert(
  rootLayoutSource.includes("createAuthRedirectGuard"),
  "AuthRouteGate should guard duplicate auth navigation operations.",
);
assert(
  rootLayoutSource.includes("redirectDestination") && rootLayoutSource.includes("router.replace(redirectDestination"),
  "AuthRouteGate should only replace with the computed redirect destination.",
);
assert(
  startupFallbackIndex >= 0 && authRouteGateIndex > startupFallbackIndex,
  "Startup configuration fallback should render before auth routing is mounted.",
);
assert(!tabsLayoutSource.includes("ROUTES.signIn"), "Tabs layout should not issue a competing sign-in redirect.");
assert(
  (authScreenSource.match(/return <Redirect href={postAuthRoute as never} \/>;/g) ?? []).length === 1,
  "AuthScreen should keep only the mock-mode post-auth redirect and leave Clerk signed-in redirects to the root gate.",
);

console.log("PASS navigation decision checks");
