-- Add RevenueCat as a subscription provider for the first billing integration layer.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('clerk', 'stripe', 'manual', 'revenuecat'));
