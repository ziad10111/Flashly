export const ROUTES = {
  decks: "/decks",
  home: "/",
  onboarding: "/onboarding",
  profile: "/profile",
  signIn: "/sign-in",
  signUp: "/sign-up",
  studyType: "/study-type",
  upload: "/upload",
  upgrade: "/upgrade",
} as const;

export type ReviewRouteMode = "all" | "weak";
export type NavigationNotice = "deck-deleted" | "deck-not-found" | "review-unavailable";

type NavigationLogPayload = {
  action: string;
  deckId?: string;
  errorCode?: string;
  from?: string;
  reason?: string;
  to?: string;
};

const protectedRootSegments = new Set(["(tabs)", "deck", "review", "study-type", "upgrade"]);

export const isProtectedRootSegment = (segment: string | undefined) =>
  Boolean(segment && protectedRootSegments.has(segment));

export const getPostAuthRoute = (hasSelectedStudyType: boolean) =>
  hasSelectedStudyType ? ROUTES.home : ROUTES.studyType;

export const normalizeRouteId = (id: string) => encodeURIComponent(id.trim());

export const createDeckRoute = (deckId: string) => `/deck/${normalizeRouteId(deckId)}`;

export const createReviewRoute = (deckId: string, mode: ReviewRouteMode = "all") => {
  const route = `/review/${normalizeRouteId(deckId)}`;

  return mode === "weak" ? `${route}?mode=weak` : route;
};

export const createDecksNoticeRoute = (notice: NavigationNotice) => `${ROUTES.decks}?notice=${notice}`;

export const getInvalidDeckFallbackRoute = () => createDecksNoticeRoute("deck-not-found");

export const getReviewUnavailableFallbackRoute = () => createDecksNoticeRoute("review-unavailable");

export const getSafeDeckRoute = (deckId: string | null | undefined) => {
  const normalizedDeckId = deckId?.trim();

  return normalizedDeckId ? createDeckRoute(normalizedDeckId) : null;
};

export const logNavigation = (payload: NavigationLogPayload) => {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return;
  }

  console.info("[Flashly Navigation]", payload);
};

export const createSingleNavigationGuard = () => {
  let lastNavigationKey: string | null = null;

  return {
    reset() {
      lastNavigationKey = null;
    },
    shouldNavigate(navigationKey: string) {
      if (lastNavigationKey === navigationKey) {
        return false;
      }

      lastNavigationKey = navigationKey;
      return true;
    },
  };
};
