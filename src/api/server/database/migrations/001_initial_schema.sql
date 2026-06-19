-- Flashly production database foundation.
-- Runtime repositories are still placeholders; this migration prepares the schema only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  email text,
  display_name text,
  image_url text,
  last_signed_in_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id uuid,
  deck_id uuid,
  idempotency_key text NOT NULL,
  file_name text NOT NULL,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  mime_type text,
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'image', 'text', 'document', 'unknown')),
  storage_key text,
  status text NOT NULL CHECK (status IN ('idle', 'queued', 'uploading', 'processing', 'ready', 'failed')),
  stage text CHECK (stage IS NULL OR stage IN ('uploading', 'assembling', 'extracting', 'ocr', 'ocr-skipped', 'generating-flashcards', 'creating-deck', 'ready')),
  progress_percentage integer NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  ocr_status text NOT NULL DEFAULT 'not-needed' CHECK (ocr_status IN ('not-needed', 'queued', 'running', 'complete', 'failed')),
  ocr_required boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'image', 'text', 'document', 'unknown')),
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  storage_key text,
  extraction_status text NOT NULL DEFAULT 'not-started' CHECK (extraction_status IN ('not-started', 'extracting', 'ocr-needed', 'complete', 'failed')),
  extraction_stage text NOT NULL DEFAULT 'not-started' CHECK (extraction_stage IN ('not-started', 'extracting-text', 'ocr', 'cleaning-text', 'complete', 'failed')),
  ocr_status text NOT NULL DEFAULT 'not-needed' CHECK (ocr_status IN ('not-needed', 'queued', 'running', 'complete', 'failed')),
  ocr_required boolean NOT NULL DEFAULT false,
  extracted_text_preview text,
  extracted_text_storage_key text,
  text_length integer CHECK (text_length IS NULL OR text_length >= 0),
  page_count integer CHECK (page_count IS NULL OR page_count >= 0),
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE uploads
  ADD CONSTRAINT uploads_material_id_fkey
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  text text NOT NULL,
  text_length integer NOT NULL CHECK (text_length >= 0),
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  source_page integer CHECK (source_page IS NULL OR source_page >= 0),
  source_section text,
  embedding_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  deck_id uuid,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'generating', 'validating', 'complete', 'failed')),
  stage text NOT NULL CHECK (stage IN ('queued', 'reading-extracted-text', 'generating-cards', 'validating-schema', 'creating-deck', 'complete', 'failed')),
  requested_card_count integer NOT NULL CHECK (requested_card_count >= 0),
  generated_card_count integer NOT NULL DEFAULT 0 CHECK (generated_card_count >= 0),
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  topic_focus text[] NOT NULL DEFAULT '{}',
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  generation_job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  source_file_name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'image', 'text', 'document', 'unknown')),
  status text NOT NULL CHECK (status IN ('new', 'processing', 'ready', 'generating', 'in-progress', 'partial-error', 'completed', 'needs-review')),
  card_count integer NOT NULL DEFAULT 0 CHECK (card_count >= 0),
  last_reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE uploads
  ADD CONSTRAINT uploads_deck_id_fkey
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL;

ALTER TABLE generation_jobs
  ADD CONSTRAINT generation_jobs_deck_id_fkey
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  source_chunk_id uuid REFERENCES source_chunks(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'mcq' CHECK (type IN ('qa', 'mcq')),
  question text NOT NULL,
  answer text NOT NULL,
  explanation text,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic text,
  choices jsonb,
  correct_choice_id text,
  source_page integer CHECK (source_page IS NULL OR source_page >= 0),
  source_section text,
  position integer NOT NULL CHECK (position >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, position)
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('full-deck', 'weak-cards', 'quick-review')),
  cards_reviewed integer NOT NULL CHECK (cards_reviewed >= 0),
  known_count integer NOT NULL DEFAULT 0 CHECK (known_count >= 0),
  unknown_count integer NOT NULL DEFAULT 0 CHECK (unknown_count >= 0),
  xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS review_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('known', 'again')),
  answered_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id uuid REFERENCES decks(id) ON DELETE CASCADE,
  card_id uuid REFERENCES flashcards(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('user', 'deck', 'card')),
  total_xp integer NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  daily_streak integer NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
  last_activity_date date,
  reviewed_card_count integer NOT NULL DEFAULT 0 CHECK (reviewed_card_count >= 0),
  weak_card_count integer NOT NULL DEFAULT 0 CHECK (weak_card_count >= 0),
  generated_deck_count integer NOT NULL DEFAULT 0 CHECK (generated_deck_count >= 0),
  completed_deck_count integer NOT NULL DEFAULT 0 CHECK (completed_deck_count >= 0),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  known_count integer NOT NULL DEFAULT 0 CHECK (known_count >= 0),
  unknown_count integer NOT NULL DEFAULT 0 CHECK (unknown_count >= 0),
  is_weak boolean NOT NULL DEFAULT false,
  completion_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  completed_at timestamptz,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_scope_target_check CHECK (
    (scope = 'user' AND deck_id IS NULL AND card_id IS NULL) OR
    (scope = 'deck' AND deck_id IS NOT NULL AND card_id IS NULL) OR
    (scope = 'card' AND deck_id IS NOT NULL AND card_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS progress_user_scope_unique
  ON progress (user_id)
  WHERE scope = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS progress_deck_scope_unique
  ON progress (user_id, deck_id)
  WHERE scope = 'deck';

CREATE UNIQUE INDEX IF NOT EXISTS progress_card_scope_unique
  ON progress (user_id, card_id)
  WHERE scope = 'card';

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('clerk', 'stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  plan_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'past-due', 'canceled', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_unique
  ON subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('upload-create', 'flashcard-generation', 'review-session-create')),
  idempotency_key text NOT NULL,
  resource_id uuid,
  request_hash text,
  response_snapshot jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON uploads (user_id);
CREATE INDEX IF NOT EXISTS uploads_material_id_idx ON uploads (material_id);
CREATE INDEX IF NOT EXISTS uploads_deck_id_idx ON uploads (deck_id);
CREATE INDEX IF NOT EXISTS uploads_status_idx ON uploads (status);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads (created_at DESC);

CREATE INDEX IF NOT EXISTS materials_user_id_idx ON materials (user_id);
CREATE INDEX IF NOT EXISTS materials_upload_id_idx ON materials (upload_id);
CREATE INDEX IF NOT EXISTS materials_extraction_status_idx ON materials (extraction_status);
CREATE INDEX IF NOT EXISTS materials_created_at_idx ON materials (created_at DESC);

CREATE INDEX IF NOT EXISTS source_chunks_user_id_idx ON source_chunks (user_id);
CREATE INDEX IF NOT EXISTS source_chunks_material_id_idx ON source_chunks (material_id);

CREATE INDEX IF NOT EXISTS generation_jobs_user_id_idx ON generation_jobs (user_id);
CREATE INDEX IF NOT EXISTS generation_jobs_material_id_idx ON generation_jobs (material_id);
CREATE INDEX IF NOT EXISTS generation_jobs_deck_id_idx ON generation_jobs (deck_id);
CREATE INDEX IF NOT EXISTS generation_jobs_status_idx ON generation_jobs (status);
CREATE INDEX IF NOT EXISTS generation_jobs_created_at_idx ON generation_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks (user_id);
CREATE INDEX IF NOT EXISTS decks_material_id_idx ON decks (material_id);
CREATE INDEX IF NOT EXISTS decks_generation_job_id_idx ON decks (generation_job_id);
CREATE INDEX IF NOT EXISTS decks_status_idx ON decks (status);
CREATE INDEX IF NOT EXISTS decks_created_at_idx ON decks (created_at DESC);

CREATE INDEX IF NOT EXISTS flashcards_user_id_idx ON flashcards (user_id);
CREATE INDEX IF NOT EXISTS flashcards_deck_id_idx ON flashcards (deck_id);
CREATE INDEX IF NOT EXISTS flashcards_material_id_idx ON flashcards (material_id);
CREATE INDEX IF NOT EXISTS flashcards_source_chunk_id_idx ON flashcards (source_chunk_id);

CREATE INDEX IF NOT EXISTS review_sessions_user_id_idx ON review_sessions (user_id);
CREATE INDEX IF NOT EXISTS review_sessions_deck_id_idx ON review_sessions (deck_id);
CREATE INDEX IF NOT EXISTS review_sessions_created_at_idx ON review_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS review_answers_user_id_idx ON review_answers (user_id);
CREATE INDEX IF NOT EXISTS review_answers_session_id_idx ON review_answers (session_id);
CREATE INDEX IF NOT EXISTS review_answers_deck_id_idx ON review_answers (deck_id);
CREATE INDEX IF NOT EXISTS review_answers_card_id_idx ON review_answers (card_id);

CREATE INDEX IF NOT EXISTS progress_user_id_idx ON progress (user_id);
CREATE INDEX IF NOT EXISTS progress_deck_id_idx ON progress (deck_id);
CREATE INDEX IF NOT EXISTS progress_card_id_idx ON progress (card_id);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);
CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON subscriptions (created_at DESC);

CREATE INDEX IF NOT EXISTS idempotency_keys_user_id_idx ON idempotency_keys (user_id);
CREATE INDEX IF NOT EXISTS idempotency_keys_resource_id_idx ON idempotency_keys (resource_id);
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
