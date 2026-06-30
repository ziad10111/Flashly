import type {
  ApiErrorCode,
  DeckDTO,
  DurableGenerationStatusDTO,
  FlashcardChoiceDTO,
  FlashcardDTO,
  GenerationJobDTO,
  StartGenerationJobRequest,
} from "@/api/contracts";
import type { PoolClient } from "pg";

import { queryPostgres } from "../database";
import { isGenerationServiceFailureError } from "../generation";
import type { GeneratedFlashcardDTOs } from "../generation/types";
import { ServerRepositoryNotConfiguredError } from "../repositoryErrors";
import type { ServerRepositoryContext } from "../repositories/types";
import {
  ensureDatabaseUser,
  toIsoString,
  withDatabaseRepositoryError,
  withDatabaseTransaction,
} from "../repositories/database/utils";

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_ATTEMPTS = 3;
const BATCH_LEASE_MS = 6 * 60 * 1000;

type JsonObject = Record<string, unknown>;

type MaterialRow = {
  id: string;
  user_id: string;
  file_name: string;
  file_type: DeckDTO["sourceType"];
  extracted_text_preview: string | null;
};

type DeckRow = {
  id: string;
  material_id: string | null;
  title: string;
  description: string | null;
  source_file_name: string;
  source_type: DeckDTO["sourceType"];
  status: DeckDTO["status"];
  card_count: number;
  last_reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type GenerationJobRow = {
  id: string;
  user_id: string;
  material_id: string;
  deck_id: string | null;
  idempotency_key: string;
  status: string;
  stage: string;
  requested_card_count: number;
  generated_card_count: number;
  expected_card_count: number | null;
  total_batch_count: number;
  completed_batch_count: number;
  failed_batch_count: number;
  retry_count: number;
  difficulty: "easy" | "medium" | "hard" | null;
  topic_focus: string[] | null;
  options: JsonObject | string | null;
  error_code: ApiErrorCode | null;
  error_message: string | null;
  last_error_code: ApiErrorCode | null;
  last_error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
};

type GenerationJobWithDeckRow = GenerationJobRow & {
  deck_row_id: string | null;
  deck_material_id: string | null;
  deck_title: string | null;
  deck_description: string | null;
  deck_source_file_name: string | null;
  deck_source_type: DeckDTO["sourceType"] | null;
  deck_status: DeckDTO["status"] | null;
  deck_card_count: number | null;
  deck_last_reviewed_at: Date | string | null;
  deck_created_at: Date | string | null;
  deck_updated_at: Date | string | null;
};

type GenerationBatchRow = {
  id: string;
  user_id: string;
  generation_job_id: string;
  batch_index: number;
  start_question_index: number;
  requested_card_count: number;
  completed_card_count: number;
  status: string;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
  last_error_code: ApiErrorCode | null;
  last_error_message: string | null;
};

type GenerationBatchWorkRow = GenerationBatchRow & {
  job_id: string;
  job_material_id: string;
  job_deck_id: string;
  job_requested_card_count: number;
  job_expected_card_count: number | null;
  job_difficulty: "easy" | "medium" | "hard" | null;
  job_topic_focus: string[] | null;
  job_options: JsonObject | string | null;
  material_text: string | null;
};

type FlashcardRow = {
  id: string;
  deck_id: string;
  material_id: string | null;
  source_chunk_id: string | null;
  type: FlashcardDTO["type"];
  question: string;
  answer: string;
  explanation: string | null;
  difficulty: FlashcardDTO["difficulty"];
  topic: string | null;
  choices: FlashcardChoiceDTO[] | null;
  correct_choice_id: string | null;
  source_page: number | null;
  source_section: string | null;
  position: number;
};

export type GenerationBatchWorkItem = {
  attemptCount: number;
  batchId: string;
  batchIndex: number;
  batchSize: number;
  deckId: string;
  difficulty?: "easy" | "medium" | "hard";
  extractedTextPreview?: string;
  generationMode: "sample" | "comprehensive";
  idempotencyKey: string;
  jobId: string;
  materialId: string;
  maxAttempts: number;
  requestedCardCount: number;
  startQuestionIndex: number;
  totalRequestedCardCount: number;
  topicFocus: string[];
  userId: string;
};

type BatchCounts = {
  active: number;
  completed: number;
  failed: number;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const parseOptions = (value: JsonObject | string | null | undefined): JsonObject => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JsonObject;
    } catch {
      return {};
    }
  }

  return value;
};

const normalizeDurableStatus = (status: string): DurableGenerationStatusDTO => {
  if (status === "complete" || status === "completed") {
    return "completed";
  }

  if (status === "generating" || status === "processing" || status === "validating") {
    return "processing";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "partial") {
    return "partial";
  }

  if (status === "failed") {
    return "failed";
  }

  return "queued";
};

const isTerminalStatus = (status: DurableGenerationStatusDTO) =>
  status === "completed" || status === "partial" || status === "failed" || status === "cancelled";

const mapDeckRowToDTO = (row: DeckRow): DeckDTO => ({
  cardCount: toNumber(row.card_count),
  completionPercentage: 0,
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  description: row.description ?? undefined,
  id: row.id,
  lastReviewedAt: toIsoString(row.last_reviewed_at),
  materialId: row.material_id ?? undefined,
  reviewedCount: 0,
  sourceFileName: row.source_file_name,
  sourceType: row.source_type,
  status: row.status,
  title: row.title,
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  weakCardCount: 0,
  xpEarned: 0,
});

const mapDeckFromJobRow = (row: GenerationJobWithDeckRow): DeckDTO | undefined => {
  if (!row.deck_row_id || !row.deck_title || !row.deck_source_file_name || !row.deck_source_type || !row.deck_status) {
    return undefined;
  }

  return mapDeckRowToDTO({
    card_count: row.deck_card_count ?? 0,
    created_at: row.deck_created_at ?? row.created_at,
    description: row.deck_description,
    id: row.deck_row_id,
    last_reviewed_at: row.deck_last_reviewed_at,
    material_id: row.deck_material_id,
    source_file_name: row.deck_source_file_name,
    source_type: row.deck_source_type,
    status: row.deck_status,
    title: row.deck_title,
    updated_at: row.deck_updated_at ?? row.updated_at,
  });
};

const mapJobRowToDTO = (row: GenerationJobWithDeckRow): GenerationJobDTO => {
  const status = normalizeDurableStatus(row.status);
  const lastErrorCode = row.last_error_code ?? row.error_code;
  const lastErrorMessage = row.last_error_message ?? row.error_message;

  return {
    canRetry: status === "partial" || status === "failed",
    completedAt: toIsoString(row.completed_at),
    completedBatchCount: toNumber(row.completed_batch_count),
    completedCardCount: toNumber(row.generated_card_count),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    deck: mapDeckFromJobRow(row),
    deckId: row.deck_id ?? row.deck_row_id ?? "",
    failedBatchCount: toNumber(row.failed_batch_count),
    jobId: row.id,
    lastError:
      lastErrorCode && lastErrorMessage
        ? {
            code: lastErrorCode,
            message: lastErrorMessage,
            retryable: status === "partial" || status === "failed",
          }
        : null,
    legacyStatus: row.status as GenerationJobDTO["legacyStatus"],
    materialId: row.material_id,
    requestedCardCount: toNumber(row.expected_card_count ?? row.requested_card_count),
    retryCount: toNumber(row.retry_count),
    startedAt: toIsoString(row.started_at),
    status,
    totalBatchCount: toNumber(row.total_batch_count),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    cancelledAt: toIsoString(row.cancelled_at),
  };
};

const selectJobSql = `
  SELECT
    j.*,
    d.id AS deck_row_id,
    d.material_id AS deck_material_id,
    d.title AS deck_title,
    d.description AS deck_description,
    d.source_file_name AS deck_source_file_name,
    d.source_type AS deck_source_type,
    d.status AS deck_status,
    d.card_count AS deck_card_count,
    d.last_reviewed_at AS deck_last_reviewed_at,
    d.created_at AS deck_created_at,
    d.updated_at AS deck_updated_at
  FROM generation_jobs j
  LEFT JOIN decks d
    ON d.id = j.deck_id AND d.user_id = j.user_id
`;

const getMaterialForUser = async (client: PoolClient, userId: string, materialId: string) => {
  const result = await client.query<MaterialRow>(
    `
      SELECT id, user_id, file_name, file_type, extracted_text_preview
      FROM materials
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [materialId, userId],
  );

  return result.rows[0] ?? null;
};

const createDeckForJob = async (
  client: PoolClient,
  userId: string,
  material: MaterialRow,
  jobId: string,
  request: StartGenerationJobRequest,
) => {
  const title =
    request.deckTitle?.trim() ||
    material.file_name.replace(/\.[^/.]+$/u, "").replace(/[-_]+/gu, " ").trim() ||
    "AI Study Flashcards";
  const result = await client.query<DeckRow>(
    `
      INSERT INTO decks (
        user_id,
        material_id,
        generation_job_id,
        title,
        description,
        source_file_name,
        source_type,
        status,
        card_count,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'generating', 0, $8::jsonb)
      RETURNING *
    `,
    [
      userId,
      material.id,
      jobId,
      title,
      "AI-generated flashcards from extracted study material.",
      material.file_name,
      material.file_type,
      JSON.stringify({
        generationJobId: jobId,
        idempotencyKey: request.idempotencyKey,
        requestedCardCount: request.requestedCardCount,
      }),
    ],
  );

  return result.rows[0];
};

const insertBatches = async (
  client: PoolClient,
  userId: string,
  jobId: string,
  requestedCardCount: number,
  batchSize: number,
) => {
  const existing = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM generation_batches WHERE generation_job_id = $1",
    [jobId],
  );

  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    return;
  }

  const totalBatchCount = Math.max(1, Math.ceil(requestedCardCount / batchSize));
  const values: unknown[] = [];
  const placeholders = Array.from({ length: totalBatchCount }, (_, batchIndex) => {
    const startQuestionIndex = batchIndex * batchSize;
    const remaining = Math.max(requestedCardCount - startQuestionIndex, 0);
    const requestedBatchCount = Math.min(batchSize, remaining || batchSize);
    const offset = values.length;

    values.push(
      userId,
      jobId,
      batchIndex,
      startQuestionIndex,
      requestedBatchCount,
      DEFAULT_MAX_ATTEMPTS,
      `${jobId}-batch-${batchIndex}`,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 'queued', $${offset + 6}, $${offset + 7})`;
  });

  await client.query(
    `
      INSERT INTO generation_batches (
        user_id,
        generation_job_id,
        batch_index,
        start_question_index,
        requested_card_count,
        status,
        max_attempts,
        idempotency_key
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (generation_job_id, batch_index) DO NOTHING
    `,
    values,
  );

  await client.query(
    `
      UPDATE generation_jobs
      SET total_batch_count = $2,
          updated_at = now()
      WHERE id = $1 AND user_id = $3
    `,
    [jobId, totalBatchCount, userId],
  );
};

const getJobById = async (client: PoolClient, userId: string, jobId: string) => {
  const result = await client.query<GenerationJobWithDeckRow>(
    `${selectJobSql} WHERE j.id = $1 AND j.user_id = $2 LIMIT 1`,
    [jobId, userId],
  );

  return result.rows[0] ?? null;
};

const getBatchCounts = async (client: PoolClient, jobId: string): Promise<BatchCounts> => {
  const result = await client.query<{
    active_count: string;
    completed_count: string;
    failed_count: string;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('queued', 'processing')) AS active_count,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM generation_batches
      WHERE generation_job_id = $1
    `,
    [jobId],
  );
  const row = result.rows[0];

  return {
    active: Number(row?.active_count ?? 0),
    completed: Number(row?.completed_count ?? 0),
    failed: Number(row?.failed_count ?? 0),
  };
};

const getDeckCardCount = async (client: PoolClient, userId: string, deckId: string) => {
  const result = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM flashcards WHERE user_id = $1 AND deck_id = $2",
    [userId, deckId],
  );

  return Number(result.rows[0]?.count ?? 0);
};

const getJobStatusFromCounts = (counts: BatchCounts, generatedCardCount: number): DurableGenerationStatusDTO => {
  if (counts.active > 0) {
    return "processing";
  }

  if (counts.failed > 0) {
    return generatedCardCount > 0 ? "partial" : "failed";
  }

  return "completed";
};

const deckStatusForJobStatus = (status: DurableGenerationStatusDTO): DeckDTO["status"] => {
  if (status === "completed") {
    return "ready";
  }

  if (status === "partial" || status === "failed") {
    return "partial-error";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  return "generating";
};

const updateJobProgress = async (
  client: PoolClient,
  userId: string,
  jobId: string,
  options: {
    forceStatus?: DurableGenerationStatusDTO;
    lastErrorCode?: ApiErrorCode | null;
    lastErrorMessage?: string | null;
  } = {},
) => {
  const current = await getJobById(client, userId, jobId);

  if (!current) {
    return null;
  }

  const deckId = current.deck_id ?? current.deck_row_id;
  const generatedCardCount = deckId ? await getDeckCardCount(client, userId, deckId) : 0;
  const counts = await getBatchCounts(client, jobId);
  const status = options.forceStatus ?? getJobStatusFromCounts(counts, generatedCardCount);
  const terminal = isTerminalStatus(status);
  const stage =
    status === "completed"
      ? "complete"
      : status === "cancelled"
        ? "cancelled"
        : status === "failed" || status === "partial"
          ? "failed"
          : "generating-cards";

  await client.query(
    `
      UPDATE generation_jobs
      SET status = $3,
          stage = $4,
          generated_card_count = $5,
          completed_batch_count = $6,
          failed_batch_count = $7,
          last_error_code = COALESCE($8, last_error_code),
          last_error_message = COALESCE($9, last_error_message),
          error_code = CASE WHEN $3 IN ('failed', 'partial') THEN COALESCE($8, error_code) ELSE NULL END,
          error_message = CASE WHEN $3 IN ('failed', 'partial') THEN COALESCE($9, error_message) ELSE NULL END,
          completed_at = CASE WHEN $10 = TRUE THEN COALESCE(completed_at, now()) ELSE NULL END,
          updated_at = now()
      WHERE id = $1 AND user_id = $2
    `,
    [
      jobId,
      userId,
      status,
      stage,
      generatedCardCount,
      counts.completed,
      counts.failed,
      options.lastErrorCode ?? null,
      options.lastErrorMessage ?? null,
      terminal,
    ],
  );

  if (deckId) {
    const deckStatus = deckStatusForJobStatus(status);
    await client.query(
      `
        UPDATE decks
        SET card_count = $3,
            status = $4,
            updated_at = now()
        WHERE id = $1 AND user_id = $2
      `,
      [deckId, userId, generatedCardCount, deckStatus],
    );

    await client.query(
      `
        UPDATE uploads
        SET deck_id = $3,
            status = CASE WHEN $4 = 'failed' THEN 'failed' WHEN $5 = TRUE THEN 'ready' ELSE 'processing' END,
            stage = CASE WHEN $5 = TRUE THEN 'ready' ELSE 'generating-flashcards' END,
            progress_percentage = CASE
              WHEN $5 = TRUE THEN 100
              ELSE LEAST(95, GREATEST(progress_percentage, 70 + FLOOR(($6::numeric / GREATEST($7, 1)) * 25)::int))
            END,
            error_code = CASE WHEN $4 = 'failed' THEN $8 ELSE NULL END,
            error_message = CASE WHEN $4 = 'failed' THEN $9 ELSE NULL END,
            updated_at = now()
        WHERE material_id = $1 AND user_id = $2
      `,
      [
        current.material_id,
        userId,
        deckId,
        status,
        terminal,
        generatedCardCount,
        current.expected_card_count ?? current.requested_card_count,
        options.lastErrorCode ?? null,
        options.lastErrorMessage ?? null,
      ],
    );
  }

  return getJobById(client, userId, jobId);
};

const mapFlashcardRowToDTO = (row: FlashcardRow): FlashcardDTO => ({
  answer: row.answer,
  choices: row.choices ?? undefined,
  correctChoiceId: row.correct_choice_id ?? undefined,
  deckId: row.deck_id,
  difficulty: row.difficulty,
  explanation: row.explanation ?? undefined,
  id: row.id,
  position: row.position,
  question: row.question,
  sourceChunkId: row.source_chunk_id ?? undefined,
  sourcePage: row.source_page ?? undefined,
  sourceSection: row.source_section ?? undefined,
  topic: row.topic ?? undefined,
  type: row.type,
});

const upsertFlashcards = async (
  client: PoolClient,
  userId: string,
  materialId: string,
  deckId: string,
  batchId: string,
  cards: FlashcardDTO[],
) => {
  if (cards.length === 0) {
    return [];
  }

  const positions: number[] = [];
  const values: unknown[] = [];
  const placeholders = cards.map((card) => {
    positions.push(card.position);
    const offset = values.length;
    values.push(
      userId,
      deckId,
      materialId,
      null,
      card.type,
      card.question,
      card.answer,
      card.explanation ?? null,
      card.difficulty,
      card.topic ?? null,
      JSON.stringify(card.choices ?? null),
      card.correctChoiceId ?? null,
      card.sourcePage ?? null,
      card.sourceSection ?? null,
      card.position,
      JSON.stringify({
        generationBatchId: batchId,
        originalGeneratedCardId: card.id,
      }),
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}::jsonb, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}::jsonb)`;
  });

  await client.query(
    `
      INSERT INTO flashcards (
        user_id,
        deck_id,
        material_id,
        source_chunk_id,
        type,
        question,
        answer,
        explanation,
        difficulty,
        topic,
        choices,
        correct_choice_id,
        source_page,
        source_section,
        position,
        metadata
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (deck_id, position)
      DO UPDATE SET
        type = EXCLUDED.type,
        question = EXCLUDED.question,
        answer = EXCLUDED.answer,
        explanation = EXCLUDED.explanation,
        difficulty = EXCLUDED.difficulty,
        topic = EXCLUDED.topic,
        choices = EXCLUDED.choices,
        correct_choice_id = EXCLUDED.correct_choice_id,
        source_page = EXCLUDED.source_page,
        source_section = EXCLUDED.source_section,
        metadata = flashcards.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    values,
  );

  const result = await client.query<FlashcardRow>(
    `
      SELECT *
      FROM flashcards
      WHERE user_id = $1 AND deck_id = $2 AND position = ANY($3::int[])
      ORDER BY position ASC
    `,
    [userId, deckId, positions],
  );

  return result.rows.map(mapFlashcardRowToDTO);
};

const hasDeckTombstone = async (client: PoolClient, userId: string, deckId: string) => {
  const result = await client.query(
    `
      SELECT 1
      FROM deck_deletion_tombstones
      WHERE user_id = $1 AND deck_id = $2
      LIMIT 1
    `,
    [userId, deckId],
  );

  return result.rows.length > 0;
};

const cancelJobInTransaction = async (
  client: PoolClient,
  userId: string,
  jobId: string,
  reason = "cancelled",
) => {
  await client.query(
    `
      UPDATE generation_jobs
      SET cancelled_at = COALESCE(cancelled_at, now()),
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
      WHERE id = $1 AND user_id = $2
    `,
    [jobId, userId],
  );
  await client.query(
    `
      UPDATE generation_batches
      SET status = CASE WHEN status = 'completed' THEN status ELSE 'cancelled' END,
          last_error_code = NULL,
          last_error_message = $3,
          completed_at = CASE WHEN status = 'completed' THEN completed_at ELSE now() END,
          updated_at = now()
      WHERE generation_job_id = $1 AND user_id = $2
    `,
    [jobId, userId, reason],
  );

  return updateJobProgress(client, userId, jobId, {
    forceStatus: "cancelled",
    lastErrorMessage: reason,
  });
};

const getErrorCode = (error: unknown): ApiErrorCode =>
  isGenerationServiceFailureError(error) ? error.code : "processing-failed";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Generation failed.";

const isRetryableError = (error: unknown) =>
  isGenerationServiceFailureError(error) ? error.retryable : true;

const getBackoffDelayMs = (attemptCount: number) => {
  if (attemptCount <= 1) {
    return 0;
  }

  return Math.min(30_000, 2 ** (attemptCount - 2) * 5_000);
};

const mapWorkRow = (row: GenerationBatchWorkRow): GenerationBatchWorkItem => {
  const options = parseOptions(row.job_options);
  const batchSize = typeof options.batchSize === "number" && options.batchSize > 0
    ? options.batchSize
    : row.requested_card_count;

  return {
    attemptCount: row.attempt_count,
    batchId: row.id,
    batchIndex: row.batch_index,
    batchSize,
    deckId: row.job_deck_id,
    difficulty: row.job_difficulty ?? undefined,
    extractedTextPreview: row.material_text ?? undefined,
    generationMode: options.generationMode === "sample" ? "sample" : "comprehensive",
    idempotencyKey: row.idempotency_key,
    jobId: row.job_id,
    materialId: row.job_material_id,
    maxAttempts: row.max_attempts,
    requestedCardCount: row.requested_card_count,
    startQuestionIndex: row.start_question_index,
    totalRequestedCardCount: row.job_expected_card_count ?? row.job_requested_card_count,
    topicFocus: row.job_topic_focus ?? [],
    userId: row.user_id,
  };
};

export const databaseGenerationJobRepository = {
  createGenerationJob: (request: StartGenerationJobRequest, context?: ServerRepositoryContext) =>
    withDatabaseTransaction("generationJobs.createGenerationJob", async (client): Promise<GenerationJobDTO | null> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const materialId = request.materialId ?? request.sourceId;

      if (!materialId) {
        return null;
      }

      const material = await getMaterialForUser(client, user.id, materialId);

      if (!material) {
        return null;
      }

      if (request.extractedTextPreview?.trim()) {
        await client.query(
          `
            UPDATE materials
            SET extracted_text_preview = COALESCE(extracted_text_preview, $3),
                text_length = COALESCE(text_length, length($3)),
                updated_at = now()
            WHERE id = $1 AND user_id = $2
          `,
          [material.id, user.id, request.extractedTextPreview.trim()],
        );
      }

      const batchSize = Math.max(1, Math.min(request.batchSize ?? DEFAULT_BATCH_SIZE, request.requestedCardCount));
      const totalBatchCount = Math.max(1, Math.ceil(request.requestedCardCount / batchSize));
      const options = {
        batchSize,
        generationMode: request.generationMode ?? "comprehensive",
      };
      const result = await client.query<GenerationJobRow>(
        `
          INSERT INTO generation_jobs (
            user_id,
            material_id,
            idempotency_key,
            status,
            stage,
            requested_card_count,
            expected_card_count,
            total_batch_count,
            completed_batch_count,
            failed_batch_count,
            retry_count,
            difficulty,
            topic_focus,
            options,
            error_code,
            error_message,
            last_error_code,
            last_error_message,
            debug_metadata
          )
          VALUES ($1, $2, $3, 'queued', 'queued', $4, $4, $5, 0, 0, 0, $6, $7, $8::jsonb, NULL, NULL, NULL, NULL, '{}'::jsonb)
          ON CONFLICT (user_id, idempotency_key)
          DO UPDATE SET updated_at = generation_jobs.updated_at
          RETURNING *
        `,
        [
          user.id,
          material.id,
          request.idempotencyKey,
          request.requestedCardCount,
          totalBatchCount,
          request.difficulty ?? null,
          request.topicFocus ?? [],
          JSON.stringify(options),
        ],
      );
      let job = result.rows[0];

      if (!job.deck_id) {
        const deck = await createDeckForJob(client, user.id, material, job.id, request);
        const updated = await client.query<GenerationJobRow>(
          `
            UPDATE generation_jobs
            SET deck_id = $3,
                updated_at = now()
            WHERE id = $1 AND user_id = $2
            RETURNING *
          `,
          [job.id, user.id, deck.id],
        );
        job = updated.rows[0];
      }

      await insertBatches(client, user.id, job.id, request.requestedCardCount, batchSize);
      const row = await getJobById(client, user.id, job.id);

      return row ? mapJobRowToDTO(row) : null;
    }),

  getGenerationJob: (jobId: string, context?: ServerRepositoryContext) =>
    withDatabaseRepositoryError("generationJobs.getGenerationJob", async (): Promise<GenerationJobDTO | null> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<GenerationJobWithDeckRow>(
        `${selectJobSql} WHERE j.id = $1 AND j.user_id = $2 LIMIT 1`,
        [jobId, user.id],
      );
      const row = result.rows[0];

      return row ? mapJobRowToDTO(row) : null;
    }),

  getActiveGenerationJobs: (context?: ServerRepositoryContext) =>
    withDatabaseRepositoryError("generationJobs.getActiveGenerationJobs", async (): Promise<GenerationJobDTO[]> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<GenerationJobWithDeckRow>(
        `
          ${selectJobSql}
          WHERE j.user_id = $1
            AND j.status IN ('queued', 'generating', 'processing', 'validating')
          ORDER BY j.updated_at DESC
        `,
        [user.id],
      );

      return result.rows.map(mapJobRowToDTO);
    }),

  retryGenerationJob: (jobId: string, context?: ServerRepositoryContext) =>
    withDatabaseTransaction("generationJobs.retryGenerationJob", async (client): Promise<GenerationJobDTO | null> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const job = await getJobById(client, user.id, jobId);

      if (!job) {
        return null;
      }

      const status = normalizeDurableStatus(job.status);

      if (status === "completed" || status === "cancelled") {
        return mapJobRowToDTO(job);
      }

      await client.query(
        `
          UPDATE generation_batches
          SET status = 'queued',
              attempt_count = 0,
              completed_card_count = 0,
              last_error_code = NULL,
              last_error_message = NULL,
              available_at = now(),
              lease_expires_at = NULL,
              started_at = NULL,
              completed_at = NULL,
              updated_at = now()
          WHERE generation_job_id = $1
            AND user_id = $2
            AND status = 'failed'
        `,
        [jobId, user.id],
      );
      await client.query(
        `
          UPDATE generation_jobs
          SET status = 'queued',
              stage = 'queued',
              retry_count = retry_count + 1,
              completed_at = NULL,
              error_code = NULL,
              error_message = NULL,
              last_error_code = NULL,
              last_error_message = NULL,
              updated_at = now()
          WHERE id = $1 AND user_id = $2
        `,
        [jobId, user.id],
      );
      const updated = await updateJobProgress(client, user.id, jobId);

      return updated ? mapJobRowToDTO(updated) : null;
    }),

  cancelGenerationJob: (jobId: string, context?: ServerRepositoryContext, reason = "Generation was cancelled.") =>
    withDatabaseTransaction("generationJobs.cancelGenerationJob", async (client): Promise<GenerationJobDTO | null> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const job = await getJobById(client, user.id, jobId);

      if (!job) {
        return null;
      }

      const cancelled = await cancelJobInTransaction(client, user.id, jobId, reason);

      return cancelled ? mapJobRowToDTO(cancelled) : null;
    }),

  claimNextBatch: () =>
    withDatabaseTransaction("generationJobs.claimNextBatch", async (client): Promise<GenerationBatchWorkItem | null> => {
      const leaseExpiresAt = new Date(Date.now() + BATCH_LEASE_MS).toISOString();
      const result = await client.query<GenerationBatchWorkRow>(
        `
          WITH candidate AS (
            SELECT b.id
            FROM generation_batches b
            JOIN generation_jobs j
              ON j.id = b.generation_job_id
            LEFT JOIN deck_deletion_tombstones t
              ON t.deck_id = j.deck_id AND t.user_id = j.user_id
            WHERE j.status IN ('queued', 'generating', 'processing', 'validating', 'partial')
              AND j.cancelled_at IS NULL
              AND j.deck_id IS NOT NULL
              AND t.deck_id IS NULL
              AND (
                (b.status = 'queued' AND b.available_at <= now())
                OR (b.status = 'processing' AND b.lease_expires_at < now() AND b.attempt_count < b.max_attempts)
              )
            ORDER BY j.created_at ASC, b.batch_index ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          ),
          claimed AS (
            UPDATE generation_batches b
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                lease_expires_at = $1,
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            FROM candidate
            WHERE b.id = candidate.id
            RETURNING b.*
          )
          SELECT
            claimed.*,
            j.id AS job_id,
            j.material_id AS job_material_id,
            j.deck_id AS job_deck_id,
            j.requested_card_count AS job_requested_card_count,
            j.expected_card_count AS job_expected_card_count,
            j.difficulty AS job_difficulty,
            j.topic_focus AS job_topic_focus,
            j.options AS job_options,
            m.extracted_text_preview AS material_text
          FROM claimed
          JOIN generation_jobs j
            ON j.id = claimed.generation_job_id
          JOIN materials m
            ON m.id = j.material_id AND m.user_id = j.user_id
        `,
        [leaseExpiresAt],
      );
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      await client.query(
        `
          UPDATE generation_jobs
          SET status = 'processing',
              stage = 'generating-cards',
              started_at = COALESCE(started_at, now()),
              updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status <> 'cancelled'
        `,
        [row.job_id, row.user_id],
      );

      return mapWorkRow(row);
    }),

  completeBatch: (item: GenerationBatchWorkItem, generated: GeneratedFlashcardDTOs) =>
    withDatabaseTransaction("generationJobs.completeBatch", async (client): Promise<GenerationJobDTO | null> => {
      const job = await getJobById(client, item.userId, item.jobId);

      if (!job || !job.deck_id) {
        return null;
      }

      if (normalizeDurableStatus(job.status) === "cancelled" || job.cancelled_at) {
        const cancelled = await cancelJobInTransaction(client, item.userId, item.jobId, "Generation was cancelled before this batch saved.");
        return cancelled ? mapJobRowToDTO(cancelled) : null;
      }

      if (await hasDeckTombstone(client, item.userId, job.deck_id)) {
        const cancelled = await cancelJobInTransaction(client, item.userId, item.jobId, "Deck was deleted before this batch saved.");
        return cancelled ? mapJobRowToDTO(cancelled) : null;
      }

      const batchStatus = await client.query<{ status: string }>(
        "SELECT status FROM generation_batches WHERE id = $1 AND user_id = $2 LIMIT 1",
        [item.batchId, item.userId],
      );

      if (batchStatus.rows[0]?.status !== "processing") {
        const updated = await updateJobProgress(client, item.userId, item.jobId);
        return updated ? mapJobRowToDTO(updated) : null;
      }

      const deckExists = await client.query("SELECT 1 FROM decks WHERE id = $1 AND user_id = $2 LIMIT 1", [
        job.deck_id,
        item.userId,
      ]);

      if (deckExists.rowCount !== 1) {
        const cancelled = await cancelJobInTransaction(client, item.userId, item.jobId, "Deck was deleted before this batch saved.");
        return cancelled ? mapJobRowToDTO(cancelled) : null;
      }

      const persistedCards = await upsertFlashcards(
        client,
        item.userId,
        item.materialId,
        item.deckId,
        item.batchId,
        generated.cards,
      );
      const expectedTotalCards = generated.expectedTotalCards ?? job.expected_card_count ?? item.totalRequestedCardCount;
      const batchEndIndex = item.startQuestionIndex + item.requestedCardCount;
      const shouldStopAfterBatch =
        generated.hasMore === false ||
        (expectedTotalCards > 0 && batchEndIndex >= expectedTotalCards);

      await client.query(
        `
          UPDATE generation_batches
          SET status = 'completed',
              completed_card_count = $3,
              last_error_code = NULL,
              last_error_message = NULL,
              lease_expires_at = NULL,
              completed_at = now(),
              updated_at = now()
          WHERE id = $1 AND user_id = $2
        `,
        [item.batchId, item.userId, persistedCards.length],
      );

      if (shouldStopAfterBatch) {
        await client.query(
          `
            UPDATE generation_batches
            SET status = 'cancelled',
                completed_at = now(),
                updated_at = now()
            WHERE generation_job_id = $1
              AND user_id = $2
              AND batch_index > $3
              AND status IN ('queued', 'processing')
          `,
          [item.jobId, item.userId, item.batchIndex],
        );
      }

      await client.query(
        `
          UPDATE generation_jobs
          SET expected_card_count = LEAST(requested_card_count, $3),
              debug_metadata = debug_metadata || $4::jsonb,
              updated_at = now()
          WHERE id = $1 AND user_id = $2
        `,
        [
          item.jobId,
          item.userId,
          expectedTotalCards,
          JSON.stringify({
            lastCompletedBatchIndex: item.batchIndex,
            lastGeneratedCardCount: persistedCards.length,
            generationDebug: generated.generationDebug ?? null,
          }),
        ],
      );

      const updated = await updateJobProgress(client, item.userId, item.jobId);

      return updated ? mapJobRowToDTO(updated) : null;
    }),

  failBatch: (item: GenerationBatchWorkItem, error: unknown) =>
    withDatabaseTransaction("generationJobs.failBatch", async (client): Promise<GenerationJobDTO | null> => {
      const code = getErrorCode(error);
      const message = getErrorMessage(error);
      const retryable = isRetryableError(error);
      const shouldRetry = retryable && item.attemptCount < item.maxAttempts;
      const delayMs = getBackoffDelayMs(item.attemptCount);

      await client.query(
        `
          UPDATE generation_batches
          SET status = $3,
              last_error_code = $4,
              last_error_message = $5,
              available_at = now() + ($6::text || ' milliseconds')::interval,
              lease_expires_at = NULL,
              completed_at = CASE WHEN $3 = 'failed' THEN now() ELSE completed_at END,
              updated_at = now()
          WHERE id = $1 AND user_id = $2
        `,
        [item.batchId, item.userId, shouldRetry ? "queued" : "failed", code, message, delayMs],
      );
      const updated = await updateJobProgress(client, item.userId, item.jobId, {
        lastErrorCode: code,
        lastErrorMessage: message,
      });

      return updated ? mapJobRowToDTO(updated) : null;
    }),

  cancelJobForDeletedDeck: (deckId: string, userId: string, generationJobId?: string | null) =>
    withDatabaseTransaction("generationJobs.cancelJobForDeletedDeck", async (client) => {
      await client.query(
        `
          INSERT INTO deck_deletion_tombstones (deck_id, user_id, generation_job_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (deck_id, user_id)
          DO UPDATE SET generation_job_id = COALESCE(EXCLUDED.generation_job_id, deck_deletion_tombstones.generation_job_id)
        `,
        [deckId, userId, generationJobId ?? null],
      );

      const result = await client.query<{ id: string }>(
        `
          SELECT id
          FROM generation_jobs
          WHERE user_id = $1
            AND (deck_id = $2 OR id = $3)
            AND status NOT IN ('complete', 'completed', 'failed', 'cancelled')
        `,
        [userId, deckId, generationJobId ?? null],
      );

      for (const row of result.rows) {
        await cancelJobInTransaction(client, userId, row.id, "Deck was deleted.");
      }
    }),
};

export const assertDatabaseGenerationJobsAvailable = () => {
  if (!queryPostgres) {
    throw new ServerRepositoryNotConfiguredError(
      "generationJobs.database",
      "Persistent generation jobs require the database repository.",
    );
  }
};
