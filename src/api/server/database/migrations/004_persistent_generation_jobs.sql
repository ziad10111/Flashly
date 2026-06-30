ALTER TABLE generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_status_check;

ALTER TABLE generation_jobs
  ADD CONSTRAINT generation_jobs_status_check
  CHECK (status IN ('queued', 'generating', 'processing', 'validating', 'complete', 'completed', 'partial', 'failed', 'cancelled'));

ALTER TABLE generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_stage_check;

ALTER TABLE generation_jobs
  ADD CONSTRAINT generation_jobs_stage_check
  CHECK (stage IN ('queued', 'reading-extracted-text', 'generating-cards', 'validating-schema', 'creating-deck', 'complete', 'failed', 'cancelled'));

ALTER TABLE decks
  DROP CONSTRAINT IF EXISTS decks_status_check;

ALTER TABLE decks
  ADD CONSTRAINT decks_status_check
  CHECK (status IN ('new', 'processing', 'ready', 'generating', 'in-progress', 'partial-error', 'cancelled', 'completed', 'needs-review'));

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS expected_card_count integer CHECK (expected_card_count IS NULL OR expected_card_count >= 0),
  ADD COLUMN IF NOT EXISTS total_batch_count integer NOT NULL DEFAULT 0 CHECK (total_batch_count >= 0),
  ADD COLUMN IF NOT EXISTS completed_batch_count integer NOT NULL DEFAULT 0 CHECK (completed_batch_count >= 0),
  ADD COLUMN IF NOT EXISTS failed_batch_count integer NOT NULL DEFAULT 0 CHECK (failed_batch_count >= 0),
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS debug_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS generation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  batch_index integer NOT NULL CHECK (batch_index >= 0),
  start_question_index integer NOT NULL DEFAULT 0 CHECK (start_question_index >= 0),
  requested_card_count integer NOT NULL CHECK (requested_card_count >= 0),
  completed_card_count integer NOT NULL DEFAULT 0 CHECK (completed_card_count >= 0),
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  idempotency_key text NOT NULL,
  last_error_code text,
  last_error_message text,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation_job_id, batch_index),
  UNIQUE (generation_job_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS generation_batches_user_id_idx ON generation_batches (user_id);
CREATE INDEX IF NOT EXISTS generation_batches_job_id_idx ON generation_batches (generation_job_id);
CREATE INDEX IF NOT EXISTS generation_batches_status_available_idx ON generation_batches (status, available_at);
CREATE INDEX IF NOT EXISTS generation_batches_lease_idx ON generation_batches (lease_expires_at);

CREATE TABLE IF NOT EXISTS deck_deletion_tombstones (
  deck_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_job_id uuid,
  reason text NOT NULL DEFAULT 'user-deleted',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

CREATE INDEX IF NOT EXISTS deck_deletion_tombstones_job_id_idx
  ON deck_deletion_tombstones (generation_job_id);
