import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { validateStartupConfiguration } from "../src/lib/startup/startupConfiguration";

const validClerkConfiguration = validateStartupConfiguration({
  clerkPublishableKey: "pk_test_example",
  postHogHost: "https://us.i.posthog.com",
  postHogKey: "phc_test",
});

assert.equal(validClerkConfiguration.isReady, true);

if (validClerkConfiguration.isReady) {
  assert.equal(validClerkConfiguration.clerkPublishableKey, "pk_test_example");
  assert.equal(validClerkConfiguration.postHogHost, "https://us.i.posthog.com");
  assert.equal(validClerkConfiguration.postHogKey, "phc_test");
}

const missingClerkConfiguration = validateStartupConfiguration({
  postHogHost: "https://us.i.posthog.com",
  postHogKey: "phc_test",
});

assert.equal(missingClerkConfiguration.isReady, false);

if (!missingClerkConfiguration.isReady) {
  assert.deepEqual(missingClerkConfiguration.missingKeys, ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
}

const whitespaceClerkConfiguration = validateStartupConfiguration({
  clerkPublishableKey: " ",
  postHogHost: "https://us.i.posthog.com",
  postHogKey: "phc_test",
});

assert.equal(whitespaceClerkConfiguration.isReady, false);

if (!whitespaceClerkConfiguration.isReady) {
  assert.deepEqual(whitespaceClerkConfiguration.missingKeys, ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
}

const invalidClerkConfiguration = validateStartupConfiguration({
  clerkPublishableKey: "not_a_clerk_key",
});

assert.equal(invalidClerkConfiguration.isReady, false);

const previewConfigurationWithoutAnalytics = validateStartupConfiguration({
  clerkPublishableKey: "pk_test_example",
});

assert.equal(previewConfigurationWithoutAnalytics.isReady, true);

if (previewConfigurationWithoutAnalytics.isReady) {
  assert.equal(previewConfigurationWithoutAnalytics.clerkPublishableKey, "pk_test_example");
  assert.equal(previewConfigurationWithoutAnalytics.postHogKey, undefined);
}

const productionConfiguration = validateStartupConfiguration({
  clerkPublishableKey: " pk_live_example ",
  postHogHost: " https://us.i.posthog.com ",
  postHogKey: " phc_example ",
});

assert.equal(productionConfiguration.isReady, true);

if (productionConfiguration.isReady) {
  assert.equal(productionConfiguration.clerkPublishableKey, "pk_live_example");
  assert.equal(productionConfiguration.postHogHost, "https://us.i.posthog.com");
  assert.equal(productionConfiguration.postHogKey, "phc_example");
}

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");
const startupConfigurationSource = readFileSync("src/lib/startup/startupConfiguration.ts", "utf8");

assert.equal(
  rootLayoutSource.includes('throw new Error("Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  false,
  "Root layout should render a controlled configuration screen instead of throwing at startup.",
);
assert.equal(
  rootLayoutSource.includes("EXPO_PUBLIC_POSTHOG_KEY!"),
  false,
  "PostHog should remain optional and must not use a startup non-null assertion.",
);
assert.equal(
  rootLayoutSource.includes("process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  true,
  "Root layout must directly reference the Clerk publishable key so Expo can inline it.",
);
assert.equal(
  rootLayoutSource.includes("process.env.EXPO_PUBLIC_POSTHOG_KEY"),
  true,
  "Root layout must directly reference the PostHog key so Expo can inline it when configured.",
);
assert.equal(
  rootLayoutSource.includes("process.env.EXPO_PUBLIC_POSTHOG_HOST"),
  true,
  "Root layout must directly reference the PostHog host so Expo can inline it when configured.",
);
assert.equal(
  rootLayoutSource.includes('process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]'),
  false,
  "Root layout must not use bracket lookup for the Clerk key.",
);
assert.equal(
  rootLayoutSource.includes("validateStartupConfiguration(process.env"),
  false,
  "Root layout must pass explicit public values instead of process.env.",
);
assert.equal(
  startupConfigurationSource.includes("process.env"),
  false,
  "Startup configuration validation must not read process.env.",
);

console.log("PASS android startup configuration checks");
