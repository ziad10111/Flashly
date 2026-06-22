import { canUsePremiumFeature, trialTestUtils } from "../src/api/server/entitlements/trial";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const date = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);

let metadata: Record<string, unknown> | null = null;

metadata = trialTestUtils.buildNextMetadata(metadata, date("2026-06-20"));
let trial = trialTestUtils.buildTrialState(metadata.flashlyTrial as never, "2026-06-20");
assert(trial.activeUsageDayCount === 1, "Day 1 should count as the first active usage day.");
assert(trial.isExpired === false, "Day 1 should be trial-active.");
assert(canUsePremiumFeature({ isPro: false, trial }), "Free user should access premium features on day 1.");

metadata = trialTestUtils.buildNextMetadata(metadata, date("2026-06-21"));
trial = trialTestUtils.buildTrialState(metadata.flashlyTrial as never, "2026-06-21");
assert(trial.activeUsageDayCount === 2, "Day 2 should count as the second active usage day.");
assert(trial.isExpired === false, "Day 2 should be trial-active.");

metadata = trialTestUtils.buildNextMetadata(metadata, date("2026-06-22"));
trial = trialTestUtils.buildTrialState(metadata.flashlyTrial as never, "2026-06-22");
assert(trial.activeUsageDayCount === 3, "Day 3 should count as the third active usage day.");
assert(trial.remainingActiveUsageDays === 0, "Day 3 should consume the final active usage day.");
assert(trial.isExpired === false, "Day 3 should still be trial-active.");

metadata = trialTestUtils.buildNextMetadata(metadata, date("2026-06-23"));
trial = trialTestUtils.buildTrialState(metadata.flashlyTrial as never, "2026-06-23");
assert(trial.activeUsageDayCount === 3, "Expired trial should remain capped at three active usage days.");
assert(trial.isExpired === true, "Day 4 should expire the free trial.");
assert(!canUsePremiumFeature({ isPro: false, trial }), "Expired free user should be blocked from premium features.");
assert(canUsePremiumFeature({ isPro: true, trial }), "Pro user should bypass trial expiration.");

const skippedDayMetadata = trialTestUtils.buildNextMetadata(null, date("2026-06-20"));
const afterSkipMetadata = trialTestUtils.buildNextMetadata(skippedDayMetadata, date("2026-06-25"));
const afterSkipTrial = trialTestUtils.buildTrialState(afterSkipMetadata.flashlyTrial as never, "2026-06-25");
assert(afterSkipTrial.activeUsageDayCount === 2, "Skipped calendar days should not reset or extend counted active days.");
assert(afterSkipTrial.isExpired === false, "Trial should still allow the second active usage day after a skip.");

console.log("PASS free trial entitlement checks");
