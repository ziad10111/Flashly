ALTER TABLE generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_status_check;

ALTER TABLE generation_jobs
  ADD CONSTRAINT generation_jobs_status_check
  CHECK (status IN ('queued', 'generating', 'validating', 'complete', 'partial', 'failed'));

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS expected_card_count integer CHECK (expected_card_count IS NULL OR expected_card_count >= 0),
  ADD COLUMN IF NOT EXISTS failed_batch_count integer NOT NULL DEFAULT 0 CHECK (failed_batch_count >= 0),
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS debug_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
