import type {
  DeckDTO,
  ExtractMaterialResponse,
  FlashcardChoiceDTO,
  FlashcardDTO,
  GenerateFlashcardsResponse,
  StudyMaterialDTO,
} from "@/api/contracts";
import type { PoolClient } from "pg";

import type {
  CreateGenerationJobInput,
  ServerMaterialRepository,
} from "../types";
import { ensureDatabaseUser, toIsoString, withDatabaseTransaction } from "./utils";
import { mapFlashcardRowToDTO } from "./databaseDeckRepository";

const SOURCE_CHUNK_SIZE = 4_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MaterialRow = {
  id: string;
  user_id: string;
  upload_id: string | null;
  file_name: string;
  file_type: StudyMaterialDTO["fileType"];
  mime_type: string | null;
  file_size: number | string | null;
  storage_key: string | null;
  extraction_status: StudyMaterialDTO["extractionStatus"];
  extraction_stage: StudyMaterialDTO["extractionStage"];
  ocr_status: StudyMaterialDTO["ocrStatus"];
  ocr_required: boolean;
  extracted_text_preview: string | null;
  text_length: number | null;
  page_count: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type GenerationJobRow = {
  id: string;
  deck_id: string | null;
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

type PersistedFlashcardRow = {
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

const toOptionalNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? undefined : Number(value);

const mapMaterialRowToDTO = (row: MaterialRow): StudyMaterialDTO => ({
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  extractedTextPreview: row.extracted_text_preview ?? undefined,
  extractionStage: row.extraction_stage,
  extractionStatus: row.extraction_status,
  fileName: row.file_name,
  fileSize: toOptionalNumber(row.file_size),
  fileType: row.file_type,
  id: row.id,
  mimeType: row.mime_type ?? undefined,
  ocrRequired: row.ocr_required,
  ocrStatus: row.ocr_status,
  pageCount: row.page_count ?? undefined,
  storageKey: row.storage_key ?? undefined,
  textLength: row.text_length ?? undefined,
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  uploadJobId: row.upload_id ?? undefined,
  userId: row.user_id,
});

const mapDeckRowToDTO = (row: DeckRow): DeckDTO => ({
  cardCount: row.card_count,
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

const getMaterialForUser = async (client: PoolClient, userId: string, materialId: string) => {
  const result = await client.query<MaterialRow>(
    `
      SELECT *
      FROM materials
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [materialId, userId],
  );

  return result.rows[0] ?? null;
};

const splitSourceChunks = (text: string) => {
  const chunks: string[] = [];
  const normalized = text.trim();

  for (let index = 0; index < normalized.length; index += SOURCE_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + SOURCE_CHUNK_SIZE));
  }

  return chunks;
};

const persistSourceChunks = async (
  client: PoolClient,
  userId: string,
  materialId: string,
  text: string | undefined,
) => {
  await client.query("DELETE FROM source_chunks WHERE material_id = $1 AND user_id = $2", [materialId, userId]);

  if (!text?.trim()) {
    return 0;
  }

  const chunks = splitSourceChunks(text);

  for (const [index, chunk] of chunks.entries()) {
    await client.query(
      `
        INSERT INTO source_chunks (user_id, material_id, chunk_index, text, text_length, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        userId,
        materialId,
        index,
        chunk,
        chunk.length,
        JSON.stringify({ source: "extraction-result" }),
      ],
    );
  }

  return chunks.length;
};

const createOrUpdateGenerationJob = async (
  client: PoolClient,
  userId: string,
  input: CreateGenerationJobInput,
) => {
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
        difficulty,
        topic_focus,
        options,
        error_code,
        error_message,
        last_error_message,
        debug_metadata
      )
      VALUES ($1, $2, $3, 'generating', 'generating-cards', $4, $5, $6, $7, $8::jsonb, NULL, NULL, NULL, '{}'::jsonb)
      ON CONFLICT (user_id, idempotency_key)
      DO UPDATE SET
        material_id = EXCLUDED.material_id,
        status = 'generating',
        stage = 'generating-cards',
        requested_card_count = EXCLUDED.requested_card_count,
        expected_card_count = COALESCE(EXCLUDED.expected_card_count, generation_jobs.expected_card_count),
        difficulty = EXCLUDED.difficulty,
        topic_focus = EXCLUDED.topic_focus,
        options = EXCLUDED.options,
        error_code = NULL,
        error_message = NULL,
        last_error_message = NULL,
        updated_at = now()
      RETURNING id, deck_id
    `,
    [
      userId,
      input.materialId,
      input.metadata.idempotencyKey,
      input.metadata.requestedCardCount,
      input.metadata.maxCards,
      input.metadata.difficulty ?? null,
      input.metadata.topicFocus,
      JSON.stringify({
        batchIndex: input.metadata.batchIndex,
        batchMode: input.metadata.batchMode,
        batchSize: input.metadata.batchSize,
        generationMode: input.metadata.generationMode,
        maxCards: input.metadata.maxCards,
        startQuestionIndex: input.metadata.startQuestionIndex,
      }),
    ],
  );

  await client.query(
    `
      UPDATE uploads
      SET status = 'processing',
          stage = 'generating-flashcards',
          progress_percentage = GREATEST(progress_percentage, 70),
          updated_at = now()
      WHERE material_id = $1 AND user_id = $2
    `,
    [input.materialId, userId],
  );

  return result.rows[0];
};

const getPersistedDeckStatus = (generation: GenerateFlashcardsResponse): DeckDTO["status"] => {
  if (generation.error) {
    return "partial-error";
  }

  return generation.hasMore ? "generating" : "ready";
};

const getPersistedJobStatus = (generation: GenerateFlashcardsResponse) => {
  if (generation.error) {
    return "partial" as const;
  }

  return generation.hasMore ? "generating" : "complete";
};

const createOrUpdateDeck = async (
  client: PoolClient,
  userId: string,
  material: MaterialRow,
  generationJobId: string,
  existingDeckId: string | null,
  generation: GenerateFlashcardsResponse,
) => {
  const status = getPersistedDeckStatus(generation);
  const sourceFileName = generation.deck.sourceFileName || material.file_name;
  const sourceType = generation.deck.sourceType || material.file_type;

  if (existingDeckId) {
    const result = await client.query<DeckRow>(
      `
        UPDATE decks
        SET title = $3,
            description = $4,
            source_file_name = $5,
            source_type = $6,
            status = $7,
            metadata = metadata || $8::jsonb,
            updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [
        existingDeckId,
        userId,
        generation.deck.title,
        generation.deck.description ?? null,
        sourceFileName,
        sourceType,
        status,
        JSON.stringify({
          expectedTotalCards: generation.expectedTotalCards ?? null,
          generationJobId,
          hasMore: generation.hasMore ?? false,
          idempotencyKey: generation.idempotencyKey,
        }),
      ],
    );

    return result.rows[0];
  }

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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9::jsonb)
      RETURNING *
    `,
    [
      userId,
      material.id,
      generationJobId,
      generation.deck.title,
      generation.deck.description ?? null,
      sourceFileName,
      sourceType,
      status,
      JSON.stringify({
        expectedTotalCards: generation.expectedTotalCards ?? null,
        generationJobId,
        hasMore: generation.hasMore ?? false,
        idempotencyKey: generation.idempotencyKey,
      }),
    ],
  );

  await client.query("UPDATE generation_jobs SET deck_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
    result.rows[0].id,
    generationJobId,
    userId,
  ]);

  return result.rows[0];
};

const getSafeSourceChunkId = (sourceChunkId: string | undefined) =>
  sourceChunkId && UUID_PATTERN.test(sourceChunkId) ? sourceChunkId : null;

const upsertFlashcards = async (
  client: PoolClient,
  userId: string,
  materialId: string,
  deckId: string,
  cards: FlashcardDTO[],
) => {
  const positions: number[] = [];

  for (const card of cards) {
    positions.push(card.position);
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (deck_id, position)
        DO UPDATE SET
          source_chunk_id = EXCLUDED.source_chunk_id,
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
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        userId,
        deckId,
        materialId,
        getSafeSourceChunkId(card.sourceChunkId),
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
          originalGeneratedCardId: card.id,
        }),
      ],
    );
  }

  if (positions.length === 0) {
    return [];
  }

  const result = await client.query<PersistedFlashcardRow>(
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

const updateDeckCardCount = async (client: PoolClient, userId: string, deckId: string) => {
  const result = await client.query<DeckRow>(
    `
      UPDATE decks
      SET card_count = (
            SELECT COUNT(*)::int
            FROM flashcards
            WHERE deck_id = $1 AND user_id = $2
          ),
          updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [deckId, userId],
  );

  return result.rows[0];
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Generation failed.";

export const databaseMaterialRepository: ServerMaterialRepository = {
  createGenerationJob: (input, context) =>
    withDatabaseTransaction("materials.createGenerationJob", async (client) => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const material = await getMaterialForUser(client, user.id, input.materialId);

      if (!material) {
        return null;
      }

      const job = await createOrUpdateGenerationJob(client, user.id, input);

      return {
        generationJobId: job.id,
      };
    }),
  getMaterialById: (materialId, context) =>
    withDatabaseTransaction("materials.getMaterialById", async (client) => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const material = await getMaterialForUser(client, user.id, materialId);

      return material ? mapMaterialRowToDTO(material) : null;
    }),
  markGenerationFailed: (input, context) =>
    withDatabaseTransaction("materials.markGenerationFailed", async (client) => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const material = await getMaterialForUser(client, user.id, input.materialId);

      if (!material) {
        return;
      }

      const message = getErrorMessage(input.error);
      await createOrUpdateGenerationJob(client, user.id, input);
      await client.query(
        `
          UPDATE generation_jobs
          SET status = 'failed',
              stage = 'failed',
              error_code = 'processing-failed',
              error_message = $4,
              last_error_message = $4,
              updated_at = now()
          WHERE user_id = $1 AND material_id = $2 AND idempotency_key = $3
        `,
        [user.id, input.materialId, input.metadata.idempotencyKey, message],
      );
      await client.query(
        `
          UPDATE uploads
          SET status = 'failed',
              error_code = 'processing-failed',
              error_message = $3,
              updated_at = now()
          WHERE material_id = $1 AND user_id = $2
        `,
        [input.materialId, user.id, message],
      );
    }),
  persistExtractionResult: (input, context) =>
    withDatabaseTransaction("materials.persistExtractionResult", async (client): Promise<ExtractMaterialResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const material = await getMaterialForUser(client, user.id, input.metadata.materialId);

      if (!material) {
        return input.extraction;
      }

      const sourceChunkCount = await persistSourceChunks(
        client,
        user.id,
        material.id,
        input.extraction.extractedTextPreview,
      );

      const updated = await client.query<MaterialRow>(
        `
          UPDATE materials
          SET extraction_status = $3,
              extraction_stage = $4,
              ocr_status = $5,
              ocr_required = $6,
              extracted_text_preview = $7,
              text_length = $8,
              page_count = $9,
              error_code = $10,
              error_message = $11,
              metadata = metadata || $12::jsonb,
              updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING *
        `,
        [
          material.id,
          user.id,
          input.extraction.extractionStatus,
          input.extraction.extractionStage,
          input.extraction.ocrStatus,
          input.extraction.ocrRequired,
          input.extraction.extractedTextPreview ?? null,
          input.extraction.textLength,
          input.extraction.pageCount ?? null,
          input.extraction.error?.code ?? null,
          input.extraction.error?.message ?? null,
          JSON.stringify({
            extractionPersistedAt: new Date().toISOString(),
            forceOcr: input.metadata.ocrRequired,
            sourceChunkCount,
            sourceUploadId: input.metadata.sourceUploadId,
          }),
        ],
      );

      await client.query(
        `
          UPDATE uploads
          SET status = CASE WHEN $3 = 'failed' THEN 'failed' ELSE 'processing' END,
              stage = CASE WHEN $4 = TRUE THEN 'ocr' ELSE 'ocr-skipped' END,
              progress_percentage = CASE WHEN $3 = 'failed' THEN progress_percentage ELSE GREATEST(progress_percentage, 58) END,
              ocr_status = $5,
              ocr_required = $4,
              error_code = $6,
              error_message = $7,
              updated_at = now()
          WHERE material_id = $1 AND user_id = $2
        `,
        [
          material.id,
          user.id,
          input.extraction.extractionStatus,
          input.extraction.ocrRequired,
          input.extraction.ocrStatus,
          input.extraction.error?.code ?? null,
          input.extraction.error?.message ?? null,
        ],
      );

      const materialDto = mapMaterialRowToDTO(updated.rows[0]);

      return {
        ...input.extraction,
        material: materialDto,
        extractedTextPreview: materialDto.extractedTextPreview,
      };
    }),
  persistGenerationResult: (input, context) =>
    withDatabaseTransaction("materials.persistGenerationResult", async (client): Promise<GenerateFlashcardsResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const material = await getMaterialForUser(client, user.id, input.materialId);

      if (!material) {
        return input.generation;
      }

      const job = await createOrUpdateGenerationJob(client, user.id, input);
      const deck = await createOrUpdateDeck(client, user.id, material, job.id, job.deck_id, input.generation);
      const persistedCards = await upsertFlashcards(client, user.id, material.id, deck.id, input.generation.cards);
      const updatedDeck = await updateDeckCardCount(client, user.id, deck.id);
      const totalGeneratedCount = updatedDeck.card_count;
      const expectedCardCount = input.generation.expectedTotalCards ?? input.metadata.maxCards;
      const jobStatus = getPersistedJobStatus(input.generation);

      await client.query(
        `
          UPDATE generation_jobs
          SET deck_id = $3,
              status = $4,
              stage = CASE WHEN $4 = 'complete' THEN 'complete' ELSE 'generating-cards' END,
              generated_card_count = $5,
              expected_card_count = $6,
              failed_batch_count = CASE WHEN $4 = 'partial' THEN failed_batch_count + 1 ELSE failed_batch_count END,
              error_code = $7,
              error_message = $8,
              last_error_message = $8,
              debug_metadata = $9::jsonb,
              updated_at = now()
          WHERE user_id = $1 AND id = $2
        `,
        [
          user.id,
          job.id,
          deck.id,
          jobStatus,
          totalGeneratedCount,
          expectedCardCount,
          input.generation.error?.code ?? null,
          input.generation.error?.message ?? null,
          JSON.stringify(input.generation.generationDebug ?? {}),
        ],
      );

      await client.query(
        `
          UPDATE uploads
          SET deck_id = $3,
              status = 'ready',
              stage = 'ready',
              progress_percentage = 100,
              updated_at = now()
          WHERE material_id = $1 AND user_id = $2
        `,
        [material.id, user.id, deck.id],
      );

      const deckDto = mapDeckRowToDTO(updatedDeck);

      return {
        ...input.generation,
        cards: persistedCards,
        deck: deckDto,
        deckId: deckDto.id,
        deckStatus: deckDto.status,
        generatedCardCount: persistedCards.length,
        generationJobId: job.id,
        generationStatus: jobStatus,
        materialId: material.id,
      };
    }),
};
