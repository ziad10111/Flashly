import { router, type Href } from "expo-router";

import { ROUTES, logNavigation } from "@/lib/navigation/routes";

export function safeBack(fallback: Href = ROUTES.home as Href) {
  if (router.canGoBack()) {
    logNavigation({
      action: "safe-back",
      reason: "navigation stack has a previous route",
    });
    router.back();
    return;
  }

  logNavigation({
    action: "safe-back-fallback",
    reason: "no previous route available",
    to: String(fallback),
  });
  router.replace(fallback);
}
