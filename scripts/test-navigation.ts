import { shouldTreatBackendDeleteErrorAsSuccessfulCleanup } from "../src/api/repositories/deckDeletion";
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

assert(getPostAuthRoute(true) === ROUTES.home, "Successful login should route to Home when setup is complete.");
assert(getPostAuthRoute(false) === ROUTES.studyType, "Successful login should route to study-type setup when setup is missing.");
assert(ROUTES.signIn === "/sign-in", "Logout should replace the stack with the public sign-in route.");

assert(isProtectedRootSegment("(tabs)"), "Signed-out users should not access protected tabs.");
assert(isProtectedRootSegment("deck"), "Signed-out users should not access deck details.");
assert(isProtectedRootSegment("review"), "Signed-out users should not access review sessions.");
assert(isProtectedRootSegment("upgrade"), "Signed-out users should not access upgrade.");
assert(!isProtectedRootSegment("sign-in"), "Sign-in should remain public.");

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

console.log("PASS navigation decision checks");
